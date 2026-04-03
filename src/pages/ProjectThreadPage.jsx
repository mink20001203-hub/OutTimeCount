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

const ProjectThreadPage = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { user, profile, isAdmin } = useAuth();

  const [project, setProject] = useState(null);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [projectLogs, setProjectLogs] = useState([]);
  const [memberProfiles, setMemberProfiles] = useState([]);
  const [messageType, setMessageType] = useState('ALL');
  const [keyword, setKeyword] = useState('');
  const [recentLimit, setRecentLimit] = useState('100');
  const [draft, setDraft] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [toast, setToast] = useState({ text: '', tone: 'ok' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastMessageRef = useRef({ text: '', sentAt: 0 });

  const showToast = (text, tone = 'ok') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast({ text: '', tone: 'ok' }), 2500);
  };

  const canManageMembers = Boolean(user && project && (isAdmin || project.ownerUid === user.uid));

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
    if (!projectId) return;
    const logsQuery = query(
      collection(db, 'project_logs'),
      where('projectId', '==', projectId),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const next = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setProjectLogs(next);
    });
    return () => unsubscribe();
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
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
  }, [projectId]);

  useEffect(() => {
    if (!thread?.id) {
      setMessages([]);
      return;
    }

    const constraints = [];
    if (messageType !== 'ALL') constraints.push(where('messageType', '==', messageType));
    const token = keyword.trim().toLowerCase();
    if (token.length >= 2) constraints.push(where('messageKeywords', 'array-contains', token));
    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(limit(Number(recentLimit) || 100));

    const primaryQuery = query(collection(db, 'project_threads', thread.id, 'messages'), ...constraints);
    const fallbackQuery = query(
      collection(db, 'project_threads', thread.id, 'messages'),
      ...(messageType !== 'ALL' ? [where('messageType', '==', messageType)] : []),
      orderBy('createdAt', 'desc'),
      limit(Number(recentLimit) || 100)
    );

    let fallbackUnsubscribe = null;
    const primaryUnsubscribe = onSnapshot(primaryQuery, (snapshot) => {
      const next = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setMessages(next.reverse());
    }, () => {
      if (fallbackUnsubscribe) return;
      fallbackUnsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
        const next = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        setMessages(next.reverse());
      });
    });

    return () => {
      primaryUnsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    };
  }, [thread?.id, messageType, keyword, recentLimit]);

  useEffect(() => {
    if (!project?.members?.length) {
      setMemberProfiles([]);
      return;
    }

    // 사용자 프로필은 소수 인원 기준으로 개별 쿼리한다.
    const unsubscribers = project.members.map((uid) => onSnapshot(doc(db, 'users', uid), (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : { uid, nickname: uid };
      setMemberProfiles((prev) => {
        const next = prev.filter((entry) => entry.uid !== uid);
        next.push({ uid, ...data });
        return next;
      });
    }));

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [project?.members]);

  const typeLabel = useMemo(() => ({
    GENERAL: '일반',
    QUESTION: '질문',
    FEEDBACK: '피드백',
    REFERENCE: '참고자료'
  }), []);

  const linkify = (text) => {
    const chunks = String(text || '').split(/(https?:\/\/[^\s]+)/g);
    return chunks.map((chunk, index) => {
      if (/^https?:\/\/[^\s]+$/.test(chunk)) {
        return <a key={`${chunk}_${index}`} href={chunk} target="_blank" rel="noreferrer" className="text-sentinel-green underline break-all">{chunk}</a>;
      }
      return <span key={`${chunk}_${index}`}>{chunk}</span>;
    });
  };

  const handleSend = async (event) => {
    event.preventDefault();
    if (!user || !projectId) return;
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
      showToast('중복 메시지는 잠시 후에 다시 전송할 수 있습니다.', 'error');
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
        messageType: messageType === 'ALL' ? 'GENERAL' : messageType,
        text,
        messageKeywords: Array.from(new Set(
          text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .split(/\s+/)
            .map((entry) => entry.trim())
            .filter((entry) => entry.length >= 2)
        )).slice(0, 20),
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

  const handleDeleteMessage = async (message) => {
    if (!thread?.id || !user) return;
    if (!(isAdmin || message.authorUid === user.uid)) return;
    await deleteDoc(doc(db, 'project_threads', thread.id, 'messages', message.id));
    showToast('메시지가 삭제되었습니다.', 'ok');
  };

  const handleInviteMember = async (event) => {
    event.preventDefault();
    if (!canManageMembers || !inviteEmail.trim() || !project?.id) return;

    const normalizedEmail = inviteEmail.trim().toLowerCase();
    setIsSubmitting(true);
    try {
      const userQuery = query(
        collection(db, 'users'),
        where('email', '==', normalizedEmail),
        limit(1)
      );
      const result = await getDocs(userQuery);
      if (result.empty) {
        showToast('해당 이메일 사용자를 찾을 수 없습니다.', 'error');
        return;
      }
      const targetUser = result.docs[0].data();
      await updateDoc(doc(db, 'projects', project.id), {
        members: arrayUnion(targetUser.uid),
        updatedAt: serverTimestamp()
      });
      setInviteEmail('');
      showToast('멤버를 초대했습니다.', 'ok');
    } catch {
      showToast('멤버 초대 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMember = async (uid) => {
    if (!canManageMembers || !project?.id) return;
    if (uid === project.ownerUid) {
      showToast('오너는 제거할 수 없습니다.', 'error');
      return;
    }
    await updateDoc(doc(db, 'projects', project.id), {
      members: arrayRemove(uid),
      updatedAt: serverTimestamp()
    });
    showToast('멤버를 제거했습니다.', 'ok');
  };

  return (
    <div className="min-h-screen bg-white dark:bg-sentinel-dark-bg text-black dark:text-white px-3 py-5 sm:px-4 md:py-8">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => navigate('/')} className="px-3 py-2 rounded-xl border border-sentinel-green/40 text-sentinel-green text-sm">
            대시보드로 돌아가기
          </button>
          <p className="text-xs text-gray-500">프로젝트 상세 · 스레드</p>
        </div>

        <section className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-4 sm:p-5 space-y-3">
          <h1 className="text-2xl font-black text-sentinel-green">{project?.title || '프로젝트 로딩 중'}</h1>
          <p className="text-sm text-gray-400">{project?.description || '프로젝트 설명이 없습니다.'}</p>
          <div className="flex flex-wrap gap-2">
            {(project?.tags || []).map((tag) => (
              <span key={tag} className="text-[11px] px-2 py-1 rounded-lg border border-sentinel-green/30 text-sentinel-green/80">{tag}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {project?.demoUrl && <a href={project.demoUrl} target="_blank" rel="noreferrer" className="text-sentinel-green hover:underline">Demo</a>}
            {project?.repoUrl && <a href={project.repoUrl} target="_blank" rel="noreferrer" className="text-sentinel-green hover:underline">Repo</a>}
            <span className="text-gray-500">멤버 {Array.isArray(project?.members) ? project.members.length : 0}명</span>
            <span className="text-gray-500">최근 로그 {projectLogs.length}개</span>
          </div>
        </section>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <section className="xl:col-span-2 rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-4 md:p-5 flex flex-col min-h-[66vh] sm:min-h-[70vh]">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
              <select value={messageType} onChange={(event) => setMessageType(event.target.value)} className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm">
                {MESSAGE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type === 'ALL' ? '전체 타입' : typeLabel[type]}
                  </option>
                ))}
              </select>
              <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="메시지 검색" className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
              <select value={recentLimit} onChange={(event) => setRecentLimit(event.target.value)} className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm">
                <option value="50">최근 50개</option>
                <option value="100">최근 100개</option>
                <option value="150">최근 150개</option>
              </select>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
              {messages.map((message) => (
                <div key={message.id} className="rounded-xl border border-sentinel-green/10 bg-black/25 p-3">
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <span className="text-sm font-bold text-sentinel-green">{message.authorNickname || '게스트'}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {message.createdAt?.toMillis ? new Date(message.createdAt.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </span>
                      {(isAdmin || message.authorUid === user?.uid) && (
                        <button type="button" onClick={() => handleDeleteMessage(message)} className="text-[11px] text-red-400 hover:underline">
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-sentinel-green/80 mb-1">{typeLabel[message.messageType] || '일반'}</p>
                  <p className="text-sm text-gray-300 break-words">{linkify(message.text)}</p>
                </div>
              ))}
              {!messages.length && <p className="text-sm text-gray-500">조건에 맞는 메시지가 없습니다.</p>}
            </div>

            <form onSubmit={handleSend} className="mt-3 pt-3 border-t border-sentinel-green/20 flex flex-col sm:flex-row gap-2">
              <input value={draft} maxLength={500} onChange={(event) => setDraft(event.target.value)} placeholder="메시지를 입력하세요 (최대 500자)" className="flex-1 rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
              <button disabled={isSubmitting} type="submit" className="px-4 py-2 rounded-xl border border-sentinel-green/50 text-sentinel-green font-bold text-sm disabled:opacity-50">
                {isSubmitting ? '전송 중' : '전송'}
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-4 md:p-5 min-h-[66vh] sm:min-h-[70vh]">
            <h2 className="text-sm font-bold text-sentinel-green mb-3">멤버 / 최근 로그</h2>
            <div className="rounded-xl border border-sentinel-green/10 bg-black/25 p-3 mb-3">
              <p className="text-xs text-gray-400 mb-2">프로젝트 멤버</p>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {memberProfiles.map((member) => (
                  <div key={member.uid} className="flex items-center justify-between gap-2">
                    <p className="text-sm text-white truncate">
                      {member.nickname || member.email || member.uid}
                      {member.uid === project?.ownerUid ? ' (오너)' : ''}
                    </p>
                    {canManageMembers && member.uid !== project?.ownerUid && (
                      <button type="button" onClick={() => handleRemoveMember(member.uid)} className="text-[11px] text-red-400 hover:underline">
                        제거
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {canManageMembers && (
                <form onSubmit={handleInviteMember} className="mt-3 flex gap-2">
                  <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="초대할 사용자 이메일" className="flex-1 rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-xs" />
                  <button type="submit" disabled={isSubmitting} className="px-3 py-2 rounded-xl border border-sentinel-green/50 text-sentinel-green text-xs font-bold disabled:opacity-50">
                    초대
                  </button>
                </form>
              )}
            </div>
            <div className="space-y-3 max-h-[42vh] overflow-y-auto pr-1">
              {projectLogs.map((log) => (
                <article key={log.id} className="rounded-xl border border-sentinel-green/10 bg-black/25 p-3">
                  <p className="text-sm text-white font-semibold">{log.summary || '요약 없음'}</p>
                  <p className="text-xs text-gray-400 mt-1">{log.retro || '회고 없음'}</p>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {log.createdAt?.toMillis ? new Date(log.createdAt.toMillis()).toLocaleString() : '-'}
                  </p>
                </article>
              ))}
              {!projectLogs.length && <p className="text-xs text-gray-500">아직 기록된 로그가 없습니다.</p>}
            </div>
          </section>
        </div>

        {toast.text && (
          <div className={`fixed bottom-5 right-5 rounded-xl px-4 py-2 text-sm font-bold ${toast.tone === 'error' ? 'bg-red-500 text-white' : 'bg-sentinel-green text-black'}`}>
            {toast.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectThreadPage;
