import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';

const MESSAGE_TYPES = ['ALL', 'GENERAL', 'QUESTION', 'FEEDBACK', 'REFERENCE'];
const ROLE_OPTIONS = ['viewer', 'editor'];

const normalizeKeywords = (text) =>
  Array.from(
    new Set(
      String(text || '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  ).slice(0, 20);

const ProjectThreadPage = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { user, profile, isAdmin } = useAuth();

  const [project, setProject] = useState(null);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [projectLogs, setProjectLogs] = useState([]);
  const [memberProfiles, setMemberProfiles] = useState([]);
  const [messageTypeFilter, setMessageTypeFilter] = useState('ALL');
  const [keyword, setKeyword] = useState('');
  const [recentLimit, setRecentLimit] = useState('100');
  const [draft, setDraft] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [toast, setToast] = useState({ text: '', tone: 'ok' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [baseViewportHeight, setBaseViewportHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 900);
  const [visualViewportHeight, setVisualViewportHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 900);

  const [editingMessageId, setEditingMessageId] = useState('');
  const [editingMessageText, setEditingMessageText] = useState('');
  const [editingLogId, setEditingLogId] = useState('');
  const [editingLogSummary, setEditingLogSummary] = useState('');
  const [editingLogRetro, setEditingLogRetro] = useState('');

  const listRef = useRef(null);
  const lastMessageRef = useRef({ text: '', sentAt: 0 });

  const showToast = (text, tone = 'ok') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast({ text: '', tone: 'ok' }), 2500);
  };

  const typeLabel = useMemo(
    () => ({
      GENERAL: '일반',
      QUESTION: '질문',
      FEEDBACK: '피드백',
      REFERENCE: '참고자료'
    }),
    []
  );

  // 역할 계산은 owner > memberRoles > 기존 members(호환) 순서로 평가한다.
  const myRole = useMemo(() => {
    if (!user || !project) return null;
    if (isAdmin) return 'admin';
    if (project.ownerUid === user.uid) return 'owner';
    if (project.memberRoles?.[user.uid]) return project.memberRoles[user.uid];
    if (Array.isArray(project.members) && project.members.includes(user.uid)) return 'editor';
    return null;
  }, [user, project, isAdmin]);

  const canViewProject = Boolean(myRole);
  const canEditProjectContent = myRole === 'admin' || myRole === 'owner' || myRole === 'editor';
  const canManageMembers = myRole === 'admin' || myRole === 'owner';
  const canPostMessage = canEditProjectContent;
  const keyboardInset = Math.max(0, baseViewportHeight - visualViewportHeight);
  const roleLabel =
    myRole === 'admin'
      ? '관리자'
      : myRole === 'owner'
      ? '소유자'
      : myRole === 'editor'
      ? '편집자'
      : myRole === 'viewer'
      ? '뷰어'
      : '미지정';

  useEffect(() => {
    const syncBaseViewport = () => setBaseViewportHeight(window.innerHeight);
    syncBaseViewport();
    window.addEventListener('resize', syncBaseViewport);
    return () => window.removeEventListener('resize', syncBaseViewport);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) {
      setVisualViewportHeight(window.innerHeight);
      return;
    }
    const syncVisualViewport = () => setVisualViewportHeight(Math.floor(viewport.height));
    syncVisualViewport();
    viewport.addEventListener('resize', syncVisualViewport);
    return () => viewport.removeEventListener('resize', syncVisualViewport);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const unsubscribe = onSnapshot(doc(db, 'projects', projectId), (snapshot) => {
      if (!snapshot.exists()) {
        setProject(null);
        return;
      }
      setProject({ id: snapshot.id, ...snapshot.data() });
    });
    return () => unsubscribe();
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !canViewProject) return;
    const logsQuery = query(
      collection(db, 'project_logs'),
      where('projectId', '==', projectId),
      orderBy('createdAt', 'desc'),
      limit(40)
    );
    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      setProjectLogs(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    });
    return () => unsubscribe();
  }, [projectId, canViewProject]);

  useEffect(() => {
    if (!projectId || !canViewProject) return;
    const threadQuery = query(
      collection(db, 'project_threads'),
      where('projectId', '==', projectId),
      orderBy('lastMessageAt', 'desc'),
      limit(1)
    );
    const unsubscribe = onSnapshot(threadQuery, (snapshot) => {
      if (snapshot.empty) {
        setThread(null);
        return;
      }
      const first = snapshot.docs[0];
      setThread({ id: first.id, ...first.data() });
    });
    return () => unsubscribe();
  }, [projectId, canViewProject]);

  useEffect(() => {
    if (!thread?.id || !canViewProject) {
      setMessages([]);
      return;
    }

    const constraints = [];
    if (messageTypeFilter !== 'ALL') constraints.push(where('messageType', '==', messageTypeFilter));
    const keywordToken = keyword.trim().toLowerCase();
    if (keywordToken.length >= 2) constraints.push(where('messageKeywords', 'array-contains', keywordToken));
    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(limit(Number(recentLimit) || 100));

    const primaryQuery = query(collection(db, 'project_threads', thread.id, 'messages'), ...constraints);
    const fallbackQuery = query(
      collection(db, 'project_threads', thread.id, 'messages'),
      ...(messageTypeFilter !== 'ALL' ? [where('messageType', '==', messageTypeFilter)] : []),
      orderBy('createdAt', 'desc'),
      limit(Number(recentLimit) || 100)
    );

    let fallbackUnsubscribe = null;
    const primaryUnsubscribe = onSnapshot(
      primaryQuery,
      (snapshot) => {
        setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).reverse());
      },
      () => {
        if (fallbackUnsubscribe) return;
        fallbackUnsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
          setMessages(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })).reverse());
        });
      }
    );

    return () => {
      primaryUnsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    };
  }, [thread?.id, canViewProject, messageTypeFilter, keyword, recentLimit]);

  useEffect(() => {
    if (!project?.members?.length || !canViewProject) {
      setMemberProfiles([]);
      return;
    }

    const unsubscribers = project.members.map((uid) =>
      onSnapshot(doc(db, 'users', uid), (snapshot) => {
        const data = snapshot.exists() ? snapshot.data() : { uid, nickname: uid };
        setMemberProfiles((prev) => {
          const next = prev.filter((entry) => entry.uid !== uid);
          next.push({ uid, ...data });
          return next;
        });
      })
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [project?.members, canViewProject]);

  useEffect(() => {
    // 새 메시지가 들어오면 하단으로 자동 스크롤한다.
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const linkify = (text) => {
    const parts = String(text || '').split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, index) => {
      if (/^https?:\/\/[^\s]+$/.test(part)) {
        return (
          <a
            key={`${part}_${index}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="text-sentinel-green underline break-all"
          >
            {part}
          </a>
        );
      }
      return <span key={`${part}_${index}`}>{part}</span>;
    });
  };

  const handleSend = async (event) => {
    event.preventDefault();
    if (!user || !projectId || !canPostMessage) return;
    const text = draft.trim();
    if (!text) return;
    if (text.length > 500) {
      showToast('메시지는 500자 이하로 입력해 주세요.', 'error');
      return;
    }

    const now = Date.now();
    if (now - lastMessageRef.current.sentAt < 900) {
      showToast('메시지는 0.9초 간격으로 전송할 수 있습니다.', 'error');
      return;
    }
    if (lastMessageRef.current.text === text && now - lastMessageRef.current.sentAt < 8000) {
      showToast('같은 메시지를 너무 빠르게 반복 전송할 수 없습니다.', 'error');
      return;
    }

    let targetThread = thread;
    setIsSubmitting(true);
    try {
      if (!targetThread) {
        const created = await addDoc(collection(db, 'project_threads'), {
          projectId,
          title: '기본 스레드',
          createdBy: user.uid,
          lastMessageAt: serverTimestamp()
        });
        targetThread = { id: created.id, projectId };
        setThread(targetThread);
      }

      await addDoc(collection(db, 'project_threads', targetThread.id, 'messages'), {
        projectId,
        authorUid: user.uid,
        authorNickname: profile?.nickname || '게스트',
        messageType: messageTypeFilter === 'ALL' ? 'GENERAL' : messageTypeFilter,
        text,
        messageKeywords: normalizeKeywords(text),
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'project_threads', targetThread.id), {
        lastMessageAt: serverTimestamp()
      });

      lastMessageRef.current = { text, sentAt: now };
      setDraft('');
    } catch {
      showToast('메시지 전송에 실패했습니다.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEditMessage = (message) => {
    setEditingMessageId(message.id);
    setEditingMessageText(message.text || '');
  };

  const handleCancelEditMessage = () => {
    setEditingMessageId('');
    setEditingMessageText('');
  };

  const handleSaveEditMessage = async (message) => {
    if (!thread?.id || !user) return;
    if (!(isAdmin || message.authorUid === user.uid)) return;
    const nextText = editingMessageText.trim();
    if (!nextText) {
      showToast('수정 메시지를 입력해 주세요.', 'error');
      return;
    }
    if (nextText.length > 500) {
      showToast('메시지는 500자 이하로 입력해 주세요.', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'project_threads', thread.id, 'messages', message.id), {
        text: nextText,
        messageKeywords: normalizeKeywords(nextText),
        editedAt: serverTimestamp()
      });
      handleCancelEditMessage();
      showToast('메시지를 수정했습니다.');
    } catch {
      showToast('메시지 수정에 실패했습니다.', 'error');
    }
  };

  const handleDeleteMessage = async (message) => {
    if (!thread?.id || !user) return;
    if (!(isAdmin || message.authorUid === user.uid)) return;
    try {
      await deleteDoc(doc(db, 'project_threads', thread.id, 'messages', message.id));
      showToast('메시지를 삭제했습니다.');
    } catch {
      showToast('메시지 삭제에 실패했습니다.', 'error');
    }
  };

  const handleStartEditLog = (log) => {
    setEditingLogId(log.id);
    setEditingLogSummary(log.summary || '');
    setEditingLogRetro(log.retro || '');
  };

  const handleCancelEditLog = () => {
    setEditingLogId('');
    setEditingLogSummary('');
    setEditingLogRetro('');
  };

  const canEditLog = (log) => {
    if (!user || !log) return false;
    if (isAdmin) return true;
    if (log.authorUid === user.uid) return true;
    return canEditProjectContent;
  };

  const handleSaveLog = async (log) => {
    if (!canEditLog(log)) return;
    const summary = editingLogSummary.trim();
    if (!summary) {
      showToast('작업 요약은 필수입니다.', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'project_logs', log.id), {
        summary,
        retro: editingLogRetro.trim()
      });
      handleCancelEditLog();
      showToast('로그를 수정했습니다.');
    } catch {
      showToast('로그 수정에 실패했습니다.', 'error');
    }
  };

  const handleDeleteLog = async (log) => {
    if (!canEditLog(log)) return;
    try {
      await deleteDoc(doc(db, 'project_logs', log.id));
      showToast('로그를 삭제했습니다.');
    } catch {
      showToast('로그 삭제에 실패했습니다.', 'error');
    }
  };

  const handleInviteMember = async (event) => {
    event.preventDefault();
    if (!canManageMembers || !inviteEmail.trim() || !project?.id) return;

    const normalizedEmail = inviteEmail.trim().toLowerCase();
    setIsSubmitting(true);
    try {
      const userQuery = query(collection(db, 'users'), where('email', '==', normalizedEmail), limit(1));
      const result = await getDocs(userQuery);
      if (result.empty) {
        showToast('해당 이메일 사용자를 찾을 수 없습니다.', 'error');
        return;
      }
      const targetUser = result.docs[0].data();
      await updateDoc(doc(db, 'projects', project.id), {
        members: arrayUnion(targetUser.uid),
        // 동적 키 업데이트로 멤버 역할을 분리 저장한다.
        [`memberRoles.${targetUser.uid}`]: inviteRole,
        updatedAt: serverTimestamp()
      });
      setInviteEmail('');
      setInviteRole('viewer');
      showToast('멤버를 초대했습니다.');
    } catch {
      showToast('멤버 초대 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateMemberRole = async (uid, role) => {
    if (!canManageMembers || !project?.id) return;
    if (uid === project.ownerUid) return;
    try {
      await updateDoc(doc(db, 'projects', project.id), {
        [`memberRoles.${uid}`]: role,
        updatedAt: serverTimestamp()
      });
      showToast('멤버 권한을 변경했습니다.');
    } catch {
      showToast('멤버 권한 변경에 실패했습니다.', 'error');
    }
  };

  const handleRemoveMember = async (uid) => {
    if (!canManageMembers || !project?.id) return;
    if (uid === project.ownerUid) {
      showToast('프로젝트 소유자는 제거할 수 없습니다.', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'projects', project.id), {
        members: arrayRemove(uid),
        [`memberRoles.${uid}`]: null,
        updatedAt: serverTimestamp()
      });
      showToast('멤버를 제거했습니다.');
    } catch {
      showToast('멤버 제거에 실패했습니다.', 'error');
    }
  };

  if (!projectId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sentinel-dark-bg text-white">
        <p className="text-sm">프로젝트 ID가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-sentinel-dark-bg text-black dark:text-white px-3 py-5 sm:px-4 md:py-8">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-3 py-2 rounded-xl border border-sentinel-green/40 text-sentinel-green text-sm"
          >
            대시보드로 돌아가기
          </button>
          <p className="text-xs text-gray-500">프로젝트 상세 + 스레드</p>
        </div>

        <section className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-2xl font-black text-sentinel-green">{project?.title || '프로젝트 로딩 중'}</h1>
            <span className="text-xs px-2 py-1 rounded-lg border border-sentinel-green/30 text-sentinel-green/90">
              내 권한: {roleLabel}
            </span>
          </div>
          <p className="text-sm text-gray-400">{project?.description || '프로젝트 설명이 없습니다.'}</p>
          <div className="flex flex-wrap gap-2">
            {(project?.tags || []).map((tag) => (
              <span key={tag} className="text-[11px] px-2 py-1 rounded-lg border border-sentinel-green/30 text-sentinel-green/80">
                {tag}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {project?.demoUrl && (
              <a href={project.demoUrl} target="_blank" rel="noreferrer" className="text-sentinel-green hover:underline">
                Demo
              </a>
            )}
            {project?.repoUrl && (
              <a href={project.repoUrl} target="_blank" rel="noreferrer" className="text-sentinel-green hover:underline">
                Repo
              </a>
            )}
            <span className="text-gray-500">멤버 {Array.isArray(project?.members) ? project.members.length : 0}명</span>
            <span className="text-gray-500">최근 로그 {projectLogs.length}개</span>
          </div>
        </section>

        {!canViewProject && (
          <section className="rounded-3xl border border-red-400/40 bg-red-500/10 p-4">
            <p className="text-sm text-red-300">이 프로젝트를 볼 권한이 없습니다.</p>
          </section>
        )}

        {canViewProject && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <section className="xl:col-span-2 rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-4 md:p-5 flex flex-col min-h-[56vh] sm:min-h-[64vh] lg:min-h-[68vh]">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <select
                  value={messageTypeFilter}
                  onChange={(event) => setMessageTypeFilter(event.target.value)}
                  className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm"
                >
                  {MESSAGE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type === 'ALL' ? '전체 타입' : typeLabel[type]}
                    </option>
                  ))}
                </select>
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="메시지 검색"
                  className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm"
                />
                <select
                  value={recentLimit}
                  onChange={(event) => setRecentLimit(event.target.value)}
                  className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm"
                >
                  <option value="50">최근 50개</option>
                  <option value="100">최근 100개</option>
                  <option value="150">최근 150개</option>
                </select>
              </div>

              <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                {messages.map((message) => (
                  <div key={message.id} className="rounded-xl border border-sentinel-green/10 bg-black/25 p-3">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="text-sm font-bold text-sentinel-green">{message.authorNickname || '게스트'}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {message.createdAt?.toMillis
                            ? new Date(message.createdAt.toMillis()).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : '--:--'}
                        </span>
                        {(isAdmin || message.authorUid === user?.uid) && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartEditMessage(message)}
                              className="text-[11px] text-sentinel-green hover:underline"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(message)}
                              className="text-[11px] text-red-400 hover:underline"
                            >
                              삭제
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-sentinel-green/80 mb-1">{typeLabel[message.messageType] || '일반'}</p>
                    {editingMessageId === message.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingMessageText}
                          onChange={(event) => setEditingMessageText(event.target.value)}
                          rows={3}
                          maxLength={500}
                          className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEditMessage(message)}
                            className="px-3 py-1.5 rounded-lg border border-sentinel-green/40 text-sentinel-green text-xs font-bold"
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEditMessage}
                            className="px-3 py-1.5 rounded-lg border border-gray-500/40 text-gray-300 text-xs"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-300 break-words">{linkify(message.text)}</p>
                    )}
                    {message.editedAt && <p className="mt-1 text-[11px] text-gray-500">수정됨</p>}
                  </div>
                ))}
                {!messages.length && <p className="text-sm text-gray-500">조건에 맞는 메시지가 없습니다.</p>}
              </div>

              <form
                onSubmit={handleSend}
                className="mt-3 pt-3 border-t border-sentinel-green/20 flex flex-col sm:flex-row gap-2"
                style={{ paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + ${Math.min(Math.max(keyboardInset, 0), 260)}px)` }}
              >
                <input
                  value={draft}
                  maxLength={500}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={
                    canPostMessage
                      ? '메시지를 입력해 주세요 (최대 500자)'
                      : 'viewer 권한은 읽기 전용입니다.'
                  }
                  disabled={!canPostMessage}
                  className="flex-1 rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm"
                />
                <button
                  disabled={isSubmitting || !canPostMessage}
                  type="submit"
                  className="px-4 py-2 rounded-xl border border-sentinel-green/50 text-sentinel-green font-bold text-sm disabled:opacity-50"
                >
                  {!canPostMessage ? '읽기 전용' : isSubmitting ? '전송 중' : '전송'}
                </button>
              </form>
              {!canPostMessage && (
                <p className="mt-2 text-[11px] text-gray-500">
                  뷰어 권한은 프로젝트 내용을 조회만 할 수 있습니다.
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-4 md:p-5 min-h-[56vh] sm:min-h-[64vh] lg:min-h-[68vh] flex flex-col">
              <h2 className="text-sm font-bold text-sentinel-green mb-3">멤버 / 프로젝트 로그</h2>

              <div className="rounded-xl border border-sentinel-green/10 bg-black/25 p-3 mb-3">
                <p className="text-xs text-gray-400 mb-2">프로젝트 멤버</p>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {memberProfiles.map((member) => {
                    const role = member.uid === project?.ownerUid ? 'owner' : project?.memberRoles?.[member.uid] || 'viewer';
                    return (
                      <div key={member.uid} className="flex items-center justify-between gap-2">
                        <p className="text-sm text-white truncate">
                          {member.nickname || member.email || member.uid}
                          {member.uid === project?.ownerUid ? ' (소유자)' : ''}
                        </p>
                        <div className="flex items-center gap-2">
                          {canManageMembers && member.uid !== project?.ownerUid ? (
                            <select
                              value={role}
                              onChange={(event) => handleUpdateMemberRole(member.uid, event.target.value)}
                              className="rounded-lg border border-sentinel-green/30 bg-black/20 px-2 py-1 text-[11px]"
                            >
                              {ROLE_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-gray-400">{role}</span>
                          )}
                          {canManageMembers && member.uid !== project?.ownerUid && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(member.uid)}
                              className="text-[11px] text-red-400 hover:underline"
                            >
                              제거
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {canManageMembers && (
                  <form onSubmit={handleInviteMember} className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
                    <input
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="초대할 사용자 이메일"
                      className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-xs"
                    />
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value)}
                      className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-xs"
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-3 py-2 rounded-xl border border-sentinel-green/50 text-sentinel-green text-xs font-bold disabled:opacity-50"
                    >
                      초대
                    </button>
                  </form>
                )}
              </div>

              <div className="space-y-3 overflow-y-auto pr-1 min-h-0 flex-1">
                {projectLogs.map((log) => (
                  <article key={log.id} className="rounded-xl border border-sentinel-green/10 bg-black/25 p-3">
                    {editingLogId === log.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingLogSummary}
                          onChange={(event) => setEditingLogSummary(event.target.value)}
                          rows={3}
                          className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm"
                        />
                        <textarea
                          value={editingLogRetro}
                          onChange={(event) => setEditingLogRetro(event.target.value)}
                          rows={2}
                          className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveLog(log)}
                            className="px-3 py-1.5 rounded-lg border border-sentinel-green/40 text-sentinel-green text-xs font-bold"
                          >
                            저장
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelEditLog}
                            className="px-3 py-1.5 rounded-lg border border-gray-500/40 text-gray-300 text-xs"
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-white font-semibold">{log.summary || '요약 없음'}</p>
                        <p className="text-xs text-gray-400 mt-1">{log.retro || '회고 없음'}</p>
                      </>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-[11px] text-gray-500">
                        {log.createdAt?.toMillis ? new Date(log.createdAt.toMillis()).toLocaleString() : '-'}
                      </p>
                      {canEditLog(log) && editingLogId !== log.id && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleStartEditLog(log)}
                            className="text-[11px] text-sentinel-green hover:underline"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteLog(log)}
                            className="text-[11px] text-red-400 hover:underline"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
                {!projectLogs.length && <p className="text-xs text-gray-500">아직 기록된 로그가 없습니다.</p>}
              </div>
            </section>
          </div>
        )}

        {toast.text && (
          <div
            className={`fixed bottom-5 right-5 rounded-xl px-4 py-2 text-sm font-bold ${
              toast.tone === 'error' ? 'bg-red-500 text-white' : 'bg-sentinel-green text-black'
            }`}
          >
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectThreadPage;
