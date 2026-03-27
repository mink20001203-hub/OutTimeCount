import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { useAuth } from './AuthContext';

const TimerContext = createContext();

export const useTimer = () => useContext(TimerContext);

const generateTabId = () => Math.random().toString(36).substring(2, 9);

export const TimerProvider = ({ children }) => {
  const { user } = useAuth();
  const [survivalTime, setSurvivalTime] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isTerminated, setIsTerminated] = useState(false);
  const [tabId] = useState(() => generateTabId());
  const channelRef = useRef(null);
  const lastSyncRef = useRef(0);

  // HH:mm:ss 포맷팅
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  // 자정(UTC+0) 초기화 로직
  const checkMidnightReset = () => {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
    const lastReset = localStorage.getItem('last_reset_utc');

    if (lastReset && parseInt(lastReset) < todayUTC) {
      setSurvivalTime(0);
      localStorage.setItem('survival_seconds', '0');
      if (user) {
        updateDoc(doc(db, 'users', user.uid), { survival_time: 0 });
      }
    }
    localStorage.setItem('last_reset_utc', todayUTC.toString());
  };

  // 1초마다 타이머 증가 및 DB 동기화
  useEffect(() => {
    const savedTime = localStorage.getItem('survival_seconds');
    if (savedTime) setSurvivalTime(parseInt(savedTime));
    
    // 자정 초기화 로직을 여기서도 호출
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
    const lastReset = localStorage.getItem('last_reset_utc');

    if (lastReset && parseInt(lastReset) < todayUTC) {
      setSurvivalTime(0);
      localStorage.setItem('survival_seconds', '0');
      if (user) {
        updateDoc(doc(db, 'users', user.uid), { survival_time: 0 });
      }
    }
    localStorage.setItem('last_reset_utc', todayUTC.toString());

    const interval = setInterval(() => {
      if (isActive && !isTerminated) {
        setSurvivalTime((prev) => {
          const next = prev + 1;
          localStorage.setItem('survival_seconds', next.toString());
          
          // 10초마다 DB 동기화 (트래픽 최적화 및 실시간성 강화)
          if (user && Date.now() - lastSyncRef.current > 10000) {
            updateDoc(doc(db, 'users', user.uid), {
              survival_time: next,
              status: 'ONLINE',
              last_updated: serverTimestamp()
            });
            lastSyncRef.current = Date.now();
          }
          return next;
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, isTerminated, user]);

  // DB 실시간 상태 모니터링 (강제 종료 등)
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.status === 'OFFLINE_TERMINATED') setIsTerminated(true);
      }
    });
    return () => unsubscribe();
  }, [user]);

  // 다중 탭 감지 (Rule 03)
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('sentinel_sync');
    channelRef.current = channel;

    // 새 탭이 열렸음을 알림
    channel.postMessage({ type: 'NEW_SESSION_START', id: tabId });

    const handleMessage = (e) => {
      if (e.data?.type === 'NEW_SESSION_START' && e.data.id !== tabId) {
        // 다른 탭이 열리면 현재 탭 중단
        setIsActive(false);
      }
      if (e.data?.type === 'FORCE_RESUME' && e.data.id !== tabId) {
        // 다른 탭에서 '계속하기'를 누르면 현재 탭 중단
        setIsActive(false);
      }
    };

    channel.onmessage = handleMessage;

    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [tabId]);

  const resumeHere = () => {
    setIsActive(true);
    // 현재 탭이 주도권을 가짐을 다른 탭에 알림
    channelRef.current?.postMessage({ type: 'FORCE_RESUME', id: tabId });
  };

  return (
    <TimerContext.Provider value={{ survivalTime, formatTime, isActive, isTerminated, resumeHere }}>
      {children}
    </TimerContext.Provider>
  );
};
