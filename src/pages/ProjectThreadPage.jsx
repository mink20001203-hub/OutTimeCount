import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';

const ProjectThreadPage = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { user, profile } = useAuth();

  const [project, setProject] = useState(null);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [projectLogs, setProjectLogs] = useState([]);
  const [messageType, setMessageType] = useState('GENERAL');
  const [keyword, setKeyword] = useState('');
  const [recentLimit, setRecentLimit] = useState('100');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

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
      limit(20)
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
      setError('');
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

  const typeLabel = useMemo(() => ({
    GENERAL: '일반',
    QUESTION: '질문',
    FEEDBACK: '피드백',
    REFERENCE: '참고자료'
  }), []);

  const handleSend = async (event) => {
    event.preventDefault();
    if (!user || !projectId) return;
    const text = draft.trim();
    if (!text) return;

    let targetThread = thread;
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
      messageType,
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
    setDraft('');
  };

  return (
    <div className="min-h-screen bg-white dark:bg-sentinel-dark-bg text-black dark:text-white px-4 py-6 md:py-8">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => navigate('/')} className="px-3 py-2 rounded-xl border border-sentinel-green/40 text-sentinel-green text-sm">
            대시보드로 돌아가기
          </button>
          <p className="text-xs text-gray-500">프로젝트별 스레드 화면</p>
        </div>

        <section className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-5 space-y-3">
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <section className="lg:col-span-2 rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-4 md:p-5 flex flex-col min-h-[70vh]">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
              <select value={messageType} onChange={(event) => setMessageType(event.target.value)} className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm">
                <option value="ALL">전체 타입</option>
                <option value="GENERAL">일반</option>
                <option value="QUESTION">질문</option>
                <option value="FEEDBACK">피드백</option>
                <option value="REFERENCE">참고자료</option>
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
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-sentinel-green">{message.authorNickname || '게스트'}</span>
                    <span className="text-xs text-gray-500">
                      {message.createdAt?.toMillis ? new Date(message.createdAt.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                    </span>
                  </div>
                  <p className="text-xs text-sentinel-green/80 mb-1">{typeLabel[message.messageType] || '일반'}</p>
                  <p className="text-sm text-gray-300 break-words">{message.text}</p>
                </div>
              ))}
              {!messages.length && <p className="text-sm text-gray-500">조건에 맞는 메시지가 없습니다.</p>}
            </div>

            <form onSubmit={handleSend} className="mt-3 pt-3 border-t border-sentinel-green/20 flex flex-col sm:flex-row gap-2">
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="메시지를 입력하세요" className="flex-1 rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
              <button type="submit" className="px-4 py-2 rounded-xl border border-sentinel-green/50 text-sentinel-green font-bold text-sm">전송</button>
            </form>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          </section>

          <section className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-4 md:p-5 min-h-[70vh]">
            <h2 className="text-sm font-bold text-sentinel-green mb-3">최근 작업 로그</h2>
            <div className="space-y-3 max-h-[62vh] overflow-y-auto pr-1">
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
      </div>
    </div>
  );
};

export default ProjectThreadPage;
