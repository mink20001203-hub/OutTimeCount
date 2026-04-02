import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTimer } from './context/TimerContext';
import { useAuth } from './context/AuthContext';
import { db } from './firebase';
import { 
  collection, query, orderBy, limit, onSnapshot, collectionGroup,
  addDoc, serverTimestamp, where, getDocs, updateDoc, deleteDoc, doc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import AdminTerminal from './context/AdminTerminal';

// 서버 검증 엔드포인트: 로컬/배포 환경에서 .env로 주입
const PAYMENT_VERIFY_URL = import.meta.env.VITE_PAYMENT_VERIFY_URL || '';

const DEMO_PATRONS = [
  { id: 'demo_patron_admin', nickname: 'Admin', amount: 500000, to: 'UNICEF', badge: 'FOUNDING' },
  { id: 'demo_patron_fan', nickname: 'AhnYujinFan', amount: 300000, to: 'WWF', badge: 'VIP' },
  { id: 'demo_patron_operator', nickname: 'NightShiftObserver', amount: 150000, to: 'DOCTORS', badge: 'CORE' },
];

// 1차 레이아웃 개편용 샘플 데이터. 이후 Firestore 컬렉션으로 치환한다.
const SAMPLE_PROJECTS = [
  {
    id: 'project_lounge_dashboard',
    title: 'Realtime Lounge Dashboard',
    status: '진행 중',
    tags: ['REACT', 'FIREBASE'],
    todayLog: '프로젝트 단위 채팅과 몰입 랭킹 UI를 스캐폴딩했습니다.',
    retro: '채팅은 기록성, 랭킹은 몰입 리듬 중심으로 재정의합니다.',
    demoUrl: 'https://example.com/demo/lounge',
    repoUrl: 'https://github.com/example/lounge'
  },
  {
    id: 'project_prompt_suite',
    title: 'AI Prompt Engineering Suite',
    status: '진행 중',
    tags: ['NODE', 'OPENAI'],
    todayLog: '지식 공유용 참고 링크 메시지 타입을 설계했습니다.',
    retro: '질문-피드백-참고자료 구조로 회고 검색성을 높일 예정입니다.',
    demoUrl: 'https://example.com/demo/prompt',
    repoUrl: 'https://github.com/example/prompt-suite'
  },
  {
    id: 'project_focus_tracker',
    title: 'Focus Session Tracker',
    status: '검증 중',
    tags: ['ANALYTICS', 'TIMER'],
    todayLog: '오늘 몰입 시간과 연속 작업일 계산 규칙을 점검했습니다.',
    retro: '경쟁보다 지속성을 강조하는 랭킹 메시지로 교체합니다.',
    demoUrl: 'https://example.com/demo/focus',
    repoUrl: 'https://github.com/example/focus-tracker'
  }
];

const SAMPLE_THREAD_MESSAGES = [
  {
    id: 'msg_1',
    projectId: 'project_lounge_dashboard',
    author: '하용',
    type: '질문',
    text: '프로젝트 보드 카드에서 로그와 회고를 동시에 보여주면 가독성이 어떨까요?',
    time: '14:02'
  },
  {
    id: 'msg_2',
    projectId: 'project_lounge_dashboard',
    author: '민권',
    type: '피드백',
    text: '회고는 접기/펼치기로 두면 카드 높이 흔들림을 줄일 수 있습니다.',
    time: '14:05'
  },
  {
    id: 'msg_3',
    projectId: 'project_lounge_dashboard',
    author: 'Alex_Dev',
    type: '참고자료',
    text: 'https://firebase.google.com/docs/firestore/security/get-started',
    time: '14:08'
  },
  {
    id: 'msg_4',
    projectId: 'project_prompt_suite',
    author: '하용',
    type: '질문',
    text: '프롬프트 버전 관리는 태그 기반이 좋을까요?',
    time: '14:12'
  },
  {
    id: 'msg_5',
    projectId: 'project_focus_tracker',
    author: '민권',
    type: '일반',
    text: '오늘은 연속 4일차를 목표로 진행합니다.',
    time: '14:16'
  }
];

const SAMPLE_FOCUS_RANKING = [
  { id: 'rank_1', nickname: '하용', todayFocus: '08:42:12', streakDays: 12 },
  { id: 'rank_2', nickname: 'CodeNinja', todayFocus: '07:55:30', streakDays: 8 },
  { id: 'rank_3', nickname: '민권', todayFocus: '05:12:44', streakDays: 4 },
];

/**
 * 결제/후원 기록은 클라이언트가 Firestore에 직접 쓰지 않고
 * 서버 검증 함수에서만 기록하도록 강제한다.
 */
const requestDonationVerification = async ({ user, payload }) => {
  if (!PAYMENT_VERIFY_URL) {
    throw new Error('VITE_PAYMENT_VERIFY_URL 이 설정되지 않았습니다.');
  }

  const idToken = await user.getIdToken();
  const response = await fetch(PAYMENT_VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`서버 검증 실패: ${text}`);
  }

  return response.json();
};

// --- Components ---

/**
 * Module 01: System Status - 시스템 상태 모니터링
 * 위치: 대시보드 좌측 상단
 */
const SystemStatus = ({ competitorCount, myRank }) => {
  const getSecurityLevel = () => {
    // 보안 등급 (오늘의 경쟁자 수에 기반)
    if (competitorCount >= 50) return { level: 'CRITICAL', color: 'bg-red-500', percent: 100 };
    if (competitorCount >= 30) return { level: 'HIGH', color: 'bg-orange-500', percent: 80 };
    if (competitorCount >= 15) return { level: 'MEDIUM', color: 'bg-yellow-500', percent: 60 };
    if (competitorCount >= 5) return { level: 'LOW', color: 'bg-blue-500', percent: 40 };
    return { level: 'SAFE', color: 'bg-sentinel-green', percent: 20 };
  };

  const security = getSecurityLevel();

  return (
    <div className="monitoring-panel bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-[32px] p-6 backdrop-blur-sm shadow-[0_0_22px_rgba(0,255,148,0.08)] font-sans text-left">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="module-header-text text-sentinel-green">Module_01: 시스템_상태</h3>
        <LiveDot />
      </div>
      
      <div className="space-y-4">
        {/* Competitor Count */}
        <div className="p-4 bg-sentinel-green/10 rounded-2xl border border-sentinel-green/20">
          <p className="text-xs text-gray-400 font-sans font-bold uppercase tracking-widest mb-2">오늘의 경쟁자</p>
          <p className="text-3xl font-mono font-black text-sentinel-green tracking-tighter">
            {competitorCount.toLocaleString()}
          </p>
        </div>

        {/* Security Grade */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400 font-sans font-bold uppercase tracking-widest">보안 등급</p>
            <span className={`text-xs font-mono font-black ${security.color.replace('bg-', 'text-')} uppercase italic`}>
              {security.level}
            </span>
          </div>
          <div className="w-full h-2 bg-black/10 dark:bg-white/5 rounded-full overflow-hidden border border-sentinel-green/10">
            <motion.div
              className={`h-full ${security.color} rounded-full shadow-lg`}
              initial={{ width: 0 }}
              animate={{ width: `${security.percent}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Module 02: Survival Timer - 생존 시간 카운트
 * 위치: 중앙 상단
 */
const SurvivalTimer = () => {
  const { survivalTime, formatTime, isActive } = useTimer();
  const [lastSyncTime, setLastSyncTime] = useState(Date.now());
  
  useEffect(() => {
    const syncIndicator = setInterval(() => {
      setLastSyncTime(Date.now());
    }, 10000);
    return () => clearInterval(syncIndicator);
  }, []);

  return (
    <div className="monitoring-panel bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-[32px] p-4 backdrop-blur-sm shadow-[0_0_22px_rgba(0,255,148,0.08)] font-sans text-left flex flex-col justify-center items-center">
      <div className="flex items-center justify-between w-full mb-3">
        <h3 className="module-header-text text-sentinel-green">Module_02: 생존_카운트</h3>
        <LiveDot />
      </div>

      <div className="flex flex-col justify-center items-center gap-2">
        {/* Timer Display - 70% size */}
        <div className="text-center">
          <div 
            className={`font-mono font-black italic tracking-tighter mb-1 transition-all duration-300 ${
              isActive 
                ? 'text-sentinel-green animate-pulse' 
                : 'text-gray-400'
            }`}
            style={{
              fontSize: '33.6px',
              textShadow: isActive 
                ? '0 0 10px rgba(0, 255, 148, 0.8), 0 0 20px rgba(0, 255, 148, 0.6), 0 0 30px rgba(0, 255, 148, 0.4), 0 0 40px rgba(0, 255, 148, 0.2)'
                : 'none'
            }}
          >
            {formatTime(survivalTime)}
          </div>
          <p className="text-xs text-gray-400 font-sans uppercase tracking-widest font-bold">생존 시간</p>
        </div>

        {/* Sync Status */}
        <div className="w-full pt-2 border-t border-sentinel-green/10">
          <motion.div
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-center text-[9px] text-gray-500 font-sans uppercase tracking-widest font-bold px-2 py-1 bg-sentinel-green/5 rounded-lg border border-sentinel-green/10"
          >
            ☁️ 동기화 중
          </motion.div>
        </div>
      </div>
    </div>
  );
};

const WelcomeSplash = ({ user, visible }) => {
  if (!user || !visible) return null;
  return (
    <motion.div 
      initial={{ opacity: 0, x: -100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      className="fixed top-24 left-6 z-[100] max-w-sm pointer-events-none"
    >
      <div className="bg-black/90 dark:bg-sentinel-green dark:text-black text-sentinel-green p-6 rounded-[32px] shadow-2xl border border-sentinel-green/20 backdrop-blur-xl">
        <h2 className="font-mono font-black text-xl mb-2 italic uppercase tracking-tight">환영합니다, 운영자님</h2>
        <p className="font-sans text-xs leading-relaxed font-bold opacity-90">
          디지털 센티널 시스템에 접속하신 것을 환영합니다.<br/>
          당신의 생존 기록은 곧 발표용 시스템의 핵심 지표가 됩니다.
        </p>
        <div className="mt-4 flex gap-1">
          <div className="w-8 h-1 bg-current rounded-full animate-pulse"></div>
          <div className="w-2 h-1 bg-current rounded-full opacity-30"></div>
          <div className="w-2 h-1 bg-current rounded-full opacity-30"></div>
        </div>
      </div>
    </motion.div>
  );
};

const UpdateNoteModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  const updates = [
    { category: '보안', title: '규칙 03: 세션 감지', desc: '오직 하나의 활성 탭만 타이머를 소유할 수 있습니다.' },
    { category: '기능', title: '미니게임 보너스 동기화', desc: '보너스 시간이 생존 타이머에 즉시 반영됩니다.' },
    { category: 'UI/UX', title: '레이아웃 및 타이포그래피 개선', desc: '라이브 채널, 후원 인터페이스, Noto Sans KR 정렬이 정재되었습니다.' },
    { category: '결제', title: '후원 증명서 갱신', desc: '총 기부금과 50% 공유 후원 문구가 이제 발표 준비 완료입니다.' },
  ];

  return (
    <div className="fixed inset-0 z-[400] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 font-sans" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-xl w-full bg-white dark:bg-[#0A0A0A] border border-sentinel-green/20 p-8 rounded-[40px] shadow-2xl overflow-hidden relative text-left"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-sentinel-green/30 shadow-sm"></div>
        <h2 className="text-2xl font-mono font-black mb-2 uppercase italic text-sentinel-green font-headline italic tracking-tight"><TypingText text="시스템 업데이트 노트" speed={60} /></h2>
        <p className="text-gray-400 text-[10px] font-mono mb-8 uppercase tracking-[0.2em] font-black">Sentinel-OS Version 2.4.0</p>
        
        <div className="space-y-6">
          {updates.map((upd, i) => (
            <div key={i} className="group">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-[10px] font-black font-mono text-sentinel-green bg-sentinel-green/10 px-2 py-0.5 rounded-full uppercase">{upd.category}</span>
                <h4 className="text-sm font-bold text-black dark:text-white group-hover:text-sentinel-green transition-colors">{upd.title}</h4>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 pl-1">{upd.desc}</p>
            </div>
          ))}
        </div>

        <button onClick={onClose} className="mt-10 w-full py-4 bg-black dark:bg-sentinel-green dark:text-black text-white font-mono font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-sentinel-green hover:text-black transition-all shadow-xl font-headline">업데이트 확인</button>
      </motion.div>
    </div>
  );
};

const SuccessToast = ({ message, visible }) => {
  if (!visible) return null;
  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed top-24 right-6 z-[600]"
    >
      <div className="bg-sentinel-green text-black px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(0,255,148,0.4)] flex items-center gap-3 border border-white/20">
        <span className="text-lg">OK</span>
        <span className="font-sans font-bold text-sm">{message}</span>
      </div>
    </motion.div>
  );
};

const InitializingScreen = ({ visible }) => {
  if (!visible) return null;
  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-[500] bg-black flex items-center justify-center"
    >
      <div className="text-center space-y-8">
        <div className="font-mono text-3xl md:text-4xl font-black tracking-[0.2em] text-sentinel-green animate-pulse italic uppercase">
          <TypingText text="SYSTEM INITIALIZING..." speed={80} />
        </div>
        <div className="flex justify-center gap-2">
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 0.8, delay: 0 }}
            className="w-3 h-3 bg-sentinel-green rounded-full"
          />
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }}
            className="w-3 h-3 bg-sentinel-green rounded-full"
          />
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }}
            className="w-3 h-3 bg-sentinel-green rounded-full"
          />
        </div>
      </div>
    </motion.div>
  );
};

const ProfileModal = ({ isOpen, onClose, onSuccessCallback }) => {
  const { profile, updateNickname, logout } = useAuth();
  const [nickname, setNickname] = useState(profile?.nickname || '');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    if (profile?.nickname) {
      setNickname(profile.nickname);
    }
  }, [profile?.nickname, isOpen]);
  const handleUpdateNickname = async () => {
    const nextNickname = nickname.trim();
    if (!nextNickname) {
      setError('별명을 입력해주세요.');
      return;
    }
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      const updatedNickname = await updateNickname(nextNickname);
      const successText = '별명이 즉시 동기화되었습니다.';
      setNickname(updatedNickname || nextNickname);
      setSuccess(successText);
      onSuccessCallback?.(successText);
      setIsSubmitting(false);
      setTimeout(() => {
        setSuccess('');
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message || '별명 변경에 실패했습니다.');
      setIsSubmitting(false);
    }
  };
  const handleLogout = () => {
    logout();
    onClose();
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 font-sans" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-[#0A0A0A] border border-sentinel-green/20 p-8 rounded-[32px] shadow-2xl overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-sentinel-green/30 shadow-sm"></div>
        <h2 className="text-xl font-mono font-black mb-2 uppercase italic text-sentinel-green font-headline tracking-tight">프로필_설정</h2>
        <p className="text-gray-400 text-[10px] font-sans mb-6 uppercase tracking-[0.2em] font-black">운영자 프로필 관리</p>
        <div className="space-y-6">
          <div className="space-y-3">
            <label className="block text-base font-semibold mb-3 text-black dark:text-white font-sans">별명</label>
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              maxLength="40"
              className="w-full px-4 py-4 bg-black/5 dark:bg-black/40 border border-sentinel-green/10 rounded-xl text-black dark:text-white placeholder:text-gray-400 font-sans text-base font-medium focus:ring-1 focus:ring-sentinel-green/50 outline-none transition-all"
              placeholder="별명 (2~12자)"
              disabled={isSubmitting}
            />
            <p className="text-sm font-medium text-gray-500 mt-2 font-sans">이모지/특수문자 포함 2~12자</p>
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-500 text-sm font-semibold font-sans">{error}</p>
              </div>
            )}
            {success && (
              <div className="p-3 bg-sentinel-green/10 border border-sentinel-green/20 rounded-lg">
                <p className="text-sentinel-green text-sm font-semibold font-sans">{success}</p>
              </div>
            )}
            <button
              onClick={handleUpdateNickname}
              disabled={isSubmitting}
              className="mt-4 w-full py-4 bg-sentinel-green text-black font-sans font-bold text-base rounded-xl hover:opacity-90 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '업데이트 중...' : '별명 변경'}
            </button>
          </div>
          <div className="relative py-3">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase font-mono text-gray-500 bg-white dark:bg-[#0A0A0A] px-2">또는</div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-4 bg-red-500/10 border border-red-500/20 text-red-500 font-sans font-bold text-sm uppercase tracking-widest rounded-xl hover:bg-red-500/20 transition-all"
          >
            로그아웃
          </button>
        </div>
        <button onClick={onClose} className="mt-6 w-full py-3 text-gray-500 font-sans font-bold text-xs uppercase tracking-widest hover:text-white transition-colors text-center">닫기</button>
      </motion.div>
      <SuccessToast message={success} visible={!!success} />
    </div>
  );
};
const TossPaymentSimulator = ({ isOpen, onClose, onDonationSuccess }) => {
  const [amount, setAmount] = useState(5000);
  const [step, setStep] = useState(1); // 1: 선택, 2: 결제 중, 3: 완료
  const { user, profile } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const donationTiers = [
    { icon: '☕', label: '소액 후원', amount: 5000 },
    { icon: '⚡', label: '파워 후원', amount: 10000 },
    { icon: '👑', label: 'VIP 후원', amount: 20000 },
  ];

  const handleSimulatePayment = async () => {
    if (!user) {
      alert('로그인이 필요합니다.');
      return;
    }
    
    if (!profile?.nickname) {
      alert('별명을 먼저 설정해주세요.');
      return;
    }

    setIsProcessing(true);
    setStep(2);

    // 결제 시뮬레이션 (2초) 후 서버 검증 함수에 기록 요청
    setTimeout(async () => {
      try {
        await requestDonationVerification({
          user,
          payload: {
            mode: 'SIMULATED',
            amount,
            to: 'DIGITAL_SENTINEL',
            nickname: profile.nickname || 'User'
          }
        });
        setStep(3);
        setIsProcessing(false);
      } catch (error) {
        console.error('Donation error:', error);
        alert(error.message || '후원 중 오류가 발생했습니다.');
        setStep(1);
        setIsProcessing(false);
      }
    }, 2000);
  };

  const handleConfirm = () => {
    onDonationSuccess?.();
    setStep(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 font-sans text-left" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-sm w-full bg-white dark:bg-[#0A0A0A] border border-sentinel-green/20 p-8 rounded-[32px] shadow-2xl overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-sentinel-green/30"></div>
        
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-mono font-black mb-2 uppercase italic text-sentinel-green font-headline tracking-tight">토스페이 후원</h2>
              <p className="text-gray-400 text-xs font-sans mb-6 uppercase tracking-widest">디지털 센티널 시스템 유지 기금</p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-mono font-bold text-gray-500 uppercase tracking-widest">후원 금액 선택</p>
              <div className="grid grid-cols-3 gap-3">
                {donationTiers.map(tier => (
                  <button 
                    key={tier.amount}
                    onClick={() => setAmount(tier.amount)}
                    className={`py-4 rounded-xl border text-center font-bold transition-all ${
                      amount === tier.amount 
                        ? 'bg-sentinel-green text-black border-sentinel-green shadow-[0_0_15px_rgba(0,255,148,0.3)]' 
                        : 'bg-transparent text-gray-500 border-white/10 hover:border-sentinel-green/50'
                    }`}
                  >
                    <div className="text-2xl mb-1">{tier.icon}</div>
                    <div className="text-[10px] font-sans">{tier.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 bg-sentinel-green/10 border border-sentinel-green/20 rounded-xl">
              <p className="text-xs text-gray-400 font-sans mb-1">후원액</p>
              <p className="text-2xl font-mono font-black text-sentinel-green">₩ {amount.toLocaleString()}</p>
            </div>

            <button 
              onClick={handleSimulatePayment}
              disabled={isProcessing}
              className="w-full py-4 bg-[#0064FF] text-white font-mono font-black text-sm uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all disabled:opacity-50"
            >
              💳 결제하기
            </button>

            <button onClick={onClose} className="w-full py-2 text-gray-500 font-sans font-bold text-xs uppercase hover:text-white transition-colors">닫기</button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 text-center">
            <div>
              <h2 className="text-xl font-mono font-black mb-2 uppercase italic text-sentinel-green font-headline">결제 진행 중</h2>
            </div>
            <div className="py-12 flex flex-col items-center gap-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                className="w-16 h-16 border-4 border-sentinel-green/30 border-t-sentinel-green rounded-full"
              />
              <p className="text-sm text-gray-400 font-sans">토스페이 결제 시뮬레이션 중...</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6 text-center">
            <div>
              <h2 className="text-xl font-mono font-black mb-2 uppercase italic text-sentinel-green font-headline">결제 완료 ✓</h2>
              <p className="text-gray-400 text-xs font-sans">후원해주셔서 감사합니다!</p>
            </div>
            <div className="py-8 space-y-3">
              <div className="text-4xl">🎉</div>
              <p className="text-sm text-gray-400 font-sans">₩ {amount.toLocaleString()} 후원</p>
              <p className="text-xs text-gray-500 font-mono">Order ID: TON_{Math.random().toString(36).substring(2, 11).toUpperCase()}</p>
            </div>
            <button 
              onClick={handleConfirm}
              className="w-full py-4 bg-sentinel-green text-black font-mono font-black text-sm uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all"
            >
              확인
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

const BonusToast = ({ pulse }) => {
  if (!pulse) return null;
  const formatBonus = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `+${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[500] pointer-events-none"
    >
      <div className="bg-sentinel-green text-black px-6 py-3 rounded-2xl shadow-[0_0_30px_rgba(0,255,148,0.4)] flex items-center gap-3 border border-white/20">
        <span className="font-mono font-black text-lg">{formatBonus(pulse.amount)}</span>
        <span className="font-sans font-bold text-xs uppercase tracking-tighter">보너스 생존 시간 획득</span>
      </div>
    </motion.div>
  );
};

const HallOfFame = () => {
  const { user } = useAuth();
  const [patrons, setPatrons] = useState([]);
  const [isPatron, setIsPatron] = useState(false);

  useEffect(() => {
    // 후원자 여부는 실시간 구독 대신 단건 조회로 판정해 읽기 비용을 줄인다.
    if (!user?.uid) {
      setIsPatron(false);
      return;
    }

    const checkPatronStatus = async () => {
      try {
        const eligibilityQuery = query(
          collection(db, 'donations'),
          where('uid', '==', user.uid),
          limit(1)
        );
        const snapshot = await getDocs(eligibilityQuery);
        setIsPatron(!snapshot.empty);
      } catch (error) {
        console.error('Patron eligibility load error:', error);
        setIsPatron(false);
      }
    };

    checkPatronStatus();
  }, [user?.uid]);

  useEffect(() => {
    // 후원자 목록도 실시간 스트림 대신 요청 시 조회로 제한한다.
    if (!isPatron) {
      setPatrons([]);
      return;
    }

    const loadTopPatrons = async () => {
      try {
        const q = query(collection(db, 'donations'), orderBy('amount', 'desc'), limit(5));
        const snapshot = await getDocs(q);
        setPatrons(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      } catch (error) {
        console.error('Top patrons load error:', error);
        setPatrons([]);
      }
    };

    loadTopPatrons();
  }, [isPatron]);

  if (!isPatron) {
    return (
      <div className="monitoring-panel bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-[32px] p-8 backdrop-blur-sm shadow-[0_0_22px_rgba(0,255,148,0.08)] h-full font-sans text-left">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h3 className="font-sans text-[12px] text-sentinel-green tracking-[0.14em] font-bold">명예로운 후원자</h3>
          <span className="font-sans text-[11px] tracking-[0.08em] text-gray-500">후원자 전용</span>
        </div>
        <div className="rounded-2xl border border-sentinel-green/20 bg-sentinel-green/5 px-5 py-6 text-center">
          <p className="text-[14px] text-gray-300 tracking-[0.02em] leading-[1.8]">
            후원 후 명예로운 후원자 명단을 확인하실 수 있습니다
          </p>
        </div>
      </div>
    );
  }

  const getPatronBadge = (amount) => {
    if (amount >= 300000) {
      return { label: '다이아', color: 'bg-cyan-300', text: 'text-cyan-300' };
    }
    if (amount >= 100000) {
      return { label: '골드', color: 'bg-amber-300', text: 'text-amber-300' };
    }
    return { label: '그린', color: 'bg-sentinel-green', text: 'text-sentinel-green' };
  };

  const mergedPatrons = [...patrons];
  for (const demoPatron of DEMO_PATRONS) {
    if (mergedPatrons.length >= 5) break;
    if (!mergedPatrons.some((patron) => patron.nickname === demoPatron.nickname)) {
      mergedPatrons.push(demoPatron);
    }
  }
  const topPatrons = mergedPatrons
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 5);

  return (
    <div className="monitoring-panel bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-[32px] p-8 backdrop-blur-sm shadow-[0_0_22px_rgba(0,255,148,0.08)] h-full font-sans text-left">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h3 className="font-sans text-[12px] text-sentinel-green tracking-[0.14em] font-bold">이달의 후원자 / 명예로운 후원자</h3>
        <span className="font-sans text-[11px] tracking-[0.08em] text-gray-500 font-bold">Patron Access</span>
      </div>
      <div className="space-y-5">
        {topPatrons.map((patron, i) => {
          const badge = getPatronBadge(patron.amount || 0);
          return (
          <div key={patron.id} className="flex items-center justify-between gap-4 p-5 rounded-2xl bg-sentinel-green/5 border border-sentinel-green/10 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-sentinel-green/30 group-hover:bg-sentinel-green transition-all shadow-sm"></div>
            <div className="flex items-center gap-4">
              <span className="font-mono font-black text-sentinel-green opacity-40">0{i + 1}</span>
              <div>
                <div className="flex items-center gap-2 font-sans font-bold text-sm text-black dark:text-white">
                  {patron.nickname}
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/20 px-2 py-0.5 text-[9px] font-sans font-bold">
                    <span className={`inline-block h-2 w-2 rounded-full ${badge.color}`}></span>
                    <span className={badge.text}>{badge.label}</span>
                  </span>
                </div>
                <div className="font-sans text-[9px] text-gray-500 uppercase tracking-[0.2em] font-bold">명예 후원자</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-sans tabular-nums font-bold text-sm text-sentinel-green">KRW {(patron.amount || 0).toLocaleString()}</div>
              <div className="font-sans text-[9px] text-gray-500 uppercase tracking-[0.2em] font-bold">{patron.to || 'UNICEF'}</div>
            </div>
          </div>
        )})}
      </div>
    </div>
  );
};
const DonationModal = ({ isOpen, onClose }) => {
  const [totalDonation, setTotalDonation] = useState(0);
  useEffect(() => {
    if (!isOpen) return;

    // 모달 오픈 시 1회 조회로 총액 계산 (구독 수를 줄여 쿼터 소모 완화)
    const loadTotalDonation = async () => {
      try {
        const q = query(collection(db, 'donations'));
        const snapshot = await getDocs(q);
        let total = 0;
        snapshot.forEach((item) => {
          total += (item.data().amount || 0);
        });
        setTotalDonation(total);
      } catch (error) {
        console.error('Donation total load error:', error);
        setTotalDonation(0);
      }
    };

    loadTotalDonation();
  }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 font-sans text-left" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-[#0A0A0A] border border-sentinel-green/20 p-8 rounded-[32px] shadow-2xl overflow-hidden relative shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-sentinel-green/30 shadow-sm"></div>
        <h2 className="text-xl font-mono font-black mb-6 uppercase italic text-sentinel-green border-b border-sentinel-green/10 pb-4 font-headline">기부 증서 (Rule 04)</h2>
        <div className="flex flex-col md:flex-row gap-8 items-center text-left">
          <div className="flex-1 space-y-4">
            <div className="p-6 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 shadow-inner">
              <p className="text-gray-400 font-sans text-[10px] uppercase tracking-widest mb-1 font-black">총 시스템 기부금</p>
              <p className="text-[1.8rem] font-sans font-bold text-black dark:text-white tracking-[-0.03em] text-left">
                총 기부금 <span className="text-sentinel-green tabular-nums">KRW {totalDonation.toLocaleString()}</span>
              </p>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-sans font-medium text-left">
                모든 후원 기록은 발표용 시스템의 총 기부금 집계에 반영됩니다.
                이 패널은 Noto Sans KR 기준으로 숫자와 설명이 안정적으로 정렬되도록 조정했습니다.
              </p>
              <div className="p-4 bg-sentinel-green/5 rounded-xl border border-sentinel-green/10">
                <p className="text-[12px] font-sans font-bold text-sentinel-green tracking-[-0.02em]">
                  누적 후원금의 50%: <span className="tabular-nums">KRW {Math.floor(totalDonation * 0.5).toLocaleString()}</span>
                </p>
              </div>
            </div>
          </div>
          <div className="w-full md:w-64 aspect-[3/4] bg-black/10 dark:bg-white/5 rounded-2xl border border-dashed border-sentinel-green/20 flex items-center justify-center relative group overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-[url('https://api.placeholder.com/300/400')] bg-cover bg-center opacity-20 grayscale group-hover:grayscale-0 transition-all duration-700 shadow-sm"></div>
            <span className="relative z-10 text-gray-500 font-sans text-[10px] uppercase tracking-widest text-center px-4 group-hover:text-sentinel-green transition-colors font-bold">CERTIFICATE_IMAGE_V2.4</span>
            <div className="absolute inset-0 bg-sentinel-green/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl shadow-sm"></div>
          </div>
        </div>
        <button onClick={onClose} className="mt-8 w-full py-4 bg-black dark:bg-sentinel-green dark:text-black text-white font-sans font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-sentinel-green hover:text-black transition-all shadow-xl font-headline">증서 닫기</button>
      </motion.div>
    </div>
  );
};
const LiveDot = () => (
  <div className="flex items-center gap-2 px-2 py-1 bg-black/5 dark:bg-white/5 rounded-full border border-black/5 dark:border-sentinel-green/10 shadow-sm">
    <div className="pulsing-green shadow-sm">
      <span className="relative inline-flex rounded-full h-2 w-2 bg-sentinel-green shadow-sm"></span>
    </div>
    <span className="font-mono text-[8px] font-bold text-sentinel-green tracking-widest uppercase animate-pulse font-headline shadow-sm">Live</span>
  </div>
);

/** Skeleton Loading Component */
const SkeletonRow = () => (
  <tr>
    <td className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-8 animate-pulse"></div></td>
    <td className="px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20 animate-pulse"></div>
      </div>
    </td>
    <td className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12 mx-auto animate-pulse"></div></td>
    <td className="px-4 py-3"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16 ml-auto animate-pulse"></div></td>
  </tr>
);

const TypingText = ({ text, className, speed = 100 }) => {
  const [displayedText, setDisplayedText] = useState('');
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.substring(0, i));
      i++;
      if (i > text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);
  return <span className={className}>{displayedText}</span>;
};

const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return (
    <button 
      onClick={() => setIsDark(!isDark)}
      className="p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-sentinel-green/20 transition-all group shadow-sm shadow-xl"
      title="테마 전환"
    >
      <div className="w-5 h-5 flex items-center justify-center shadow-sm">
        {isDark ? (
          <span className="text-sentinel-green text-sm shadow-sm">🌙</span>
        ) : (
          <span className="text-sentinel-green text-sm shadow-sm">☀️</span>
        )}
      </div>
    </button>
  );
};

const DonationSuccessModal = ({ step, onConfirm, onClose }) => {
  if (!step) return null;

  const isGratitudeStep = step === 2;

  return (
    <div className="fixed inset-0 z-[650] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6 font-sans" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md rounded-[28px] border border-sentinel-green/30 bg-[#0B0F0D] p-8 text-center shadow-[0_0_35px_rgba(0,255,148,0.16)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[20px] font-bold tracking-[0.02em] leading-relaxed text-sentinel-green">
          {isGratitudeStep ? '후원해주셔서 진심으로 감사합니다.' : '후원이 완료되었습니다.'}
        </h3>
        <p className="mt-3 text-[13px] text-gray-400 leading-relaxed tracking-[0.01em]">
          {isGratitudeStep ? '명예로운 후원자 기록에 반영되었습니다.' : '시스템이 후원 내역을 안전하게 처리했습니다.'}
        </p>
        <button
          onClick={onConfirm}
          className="mt-7 w-full rounded-2xl bg-sentinel-green py-3 text-sm font-bold text-black transition-opacity hover:opacity-90"
        >
          {isGratitudeStep ? '닫기' : '확인'}
        </button>
      </motion.div>
    </div>
  );
};

const MinigameHub = () => {
  const navigate = useNavigate();
  const { addBonusTime } = useTimer();
  const games = [
    { 
      id: 'memory-hack',
      title: '메모리 핵', 
      icon: '🧠', 
      desc: '데이터 조각 일치시키기', 
      baseScore: 100 
    },
    { 
      id: 'grid-run',
      title: '그리드 런', 
      icon: '🏃', 
      desc: '패턴 장애물 회피', 
      baseScore: 150 
    },
    { 
      id: 'beat-tap',
      title: '비트 탭', 
      icon: '⚡', 
      desc: '주파수 동기화 챌린지', 
      baseScore: 200 
    }
  ];

  const handlePlayGame = (gameId) => {
    navigate(`/game/${gameId}`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-left">
      {games.map((game, i) => (
        <motion.div 
          key={i} 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handlePlayGame(game.id)}
          className="monitoring-panel-sm bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/10 p-5 rounded-3xl hover:border-sentinel-green/30 transition-all group cursor-pointer relative overflow-hidden shadow-glow-green dark:shadow-glow-green-lg text-left"
        >
          <div className="absolute top-0 right-0 p-3 opacity-20 font-mono text-[10px] uppercase tracking-widest font-black shadow-sm text-right">v1.0</div>
          <div className="text-2xl mb-3 group-hover:scale-110 transition-transform inline-block shadow-sm">{game.icon}</div>
          <h4 className="font-mono font-black text-base text-black dark:text-white mb-1 uppercase tracking-tighter italic font-headline text-left">{game.title}</h4>
          <p className="text-xs text-gray-500 font-sans uppercase tracking-widest leading-tight font-bold text-left">{game.desc}</p>
          <div className="mt-4 flex items-center gap-1 text-sentinel-green/40 font-mono text-[8px] uppercase font-black group-hover:text-sentinel-green transition-colors text-left shadow-sm">
            <span>+{game.baseScore}초</span>
            <span className="animate-pulse shadow-sm">→</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

// Mock competitor data generator with preset demo data
const generateMockCompetitors = () => {
  // 발표 테스트용 가상 데이터 (지정된 5명)
  const presetData = [
    { nickname: '본인', survival_time: 6264, status: 'ONLINE' },        // 01:44:44
    { nickname: 'Sentinel_01', survival_time: 7815, status: 'ONLINE' },  // 02:10:15
    { nickname: 'Alpha_Bravo', survival_time: 6900, status: 'ONLINE' },  // 01:55:00
    { nickname: 'Cyber_Link', survival_time: 4830, status: 'ONLINE' },   // 01:20:30
    { nickname: 'User_99', survival_time: 2712, status: 'OFFLINE' },     // 00:45:12
  ];

  return presetData.map((data, idx) => ({
    id: `preset_${idx}`,
    nickname: data.nickname,
    photoURL: `https://i.pravatar.cc/32?img=${20 + idx}`,
    survival_time: data.survival_time,
    status: data.status
  })).sort((a, b) => b.survival_time - a.survival_time);
};

const ShortcutGuide = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 font-sans text-left" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-[#0A0A0A] border border-sentinel-green/20 p-8 rounded-[32px] shadow-2xl shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-mono font-black mb-6 uppercase italic text-sentinel-green border-b border-sentinel-green/10 pb-4 italic font-headline text-left">시스템 단축키 안내</h2>
        <div className="mb-5 rounded-2xl border border-sentinel-green/20 bg-sentinel-green/5 p-4 text-left">
          <p className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-200 font-sans">
            이 공간은 작업물을 공유하고, 채팅으로 지식을 나누며, 실시간 순위로 몰입 시간을 함께 만드는 협업 실험실입니다.
          </p>
        </div>
        <div className="space-y-4 font-mono text-sm text-left">
          <div className="flex justify-between items-center text-black dark:text-white">
            <span className="text-gray-400 font-bold text-left">명령어 터미널</span>
            <span className="bg-gray-100 dark:bg-white/10 px-3 py-1 rounded-lg border border-black/10 dark:border-white/10 font-black shadow-sm text-right">Shift + Q</span>
          </div>
          <div className="flex justify-between items-center text-black dark:text-white text-left">
            <span className="text-gray-400 font-bold text-left">도움말</span>
            <span className="bg-gray-100 dark:bg-white/10 px-3 py-1 rounded-lg border border-black/10 dark:border-white/10 font-black shadow-sm text-right">F1 / Alt + H</span>
          </div>
          <div className="flex justify-between items-center text-black dark:text-white text-left">
            <span className="text-gray-400 font-bold text-left">테마 전환</span>
            <span className="bg-gray-100 dark:bg-white/10 px-3 py-1 rounded-lg border border-black/10 dark:border-white/10 font-black shadow-sm text-right">Shift + T</span>
          </div>
        </div>
        <button onClick={onClose} className="mt-8 w-full py-4 bg-black dark:bg-sentinel-green dark:text-black text-white font-mono font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-sentinel-green hover:text-black transition-all shadow-lg font-headline shadow-xl text-center">시스템으로 복귀</button>
      </motion.div>
    </div>
  );
};

const NicknameModal = () => {
  const { updateNickname } = useAuth();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      await updateNickname(nickname);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6 font-sans text-left">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-sentinel-dark-card border border-sentinel-green/20 p-12 rounded-[40px] shadow-2xl relative overflow-hidden shadow-xl"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-sentinel-green/20 shadow-sm"></div>
        <h2 className="text-3xl font-mono font-black mb-2 italic uppercase tracking-tighter text-black dark:text-white font-headline tracking-tight text-left">ID Setup</h2>
        <p className="text-gray-400 text-sm font-sans mb-10 uppercase tracking-[0.2em] font-black text-left">운영자 코드 등록이 필요합니다</p>
        <form onSubmit={handleSubmit} className="space-y-8 text-left">
          <div className="relative text-left">
            <input 
              type="text" 
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="운영자 ID"
              className="w-full px-6 py-5 bg-black/5 dark:bg-black/40 border border-sentinel-green/10 rounded-2xl font-mono text-base focus:ring-1 focus:ring-sentinel-green/50 outline-none text-black dark:text-white placeholder:text-gray-300 transition-all font-black shadow-inner text-left"
              autoFocus
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-sentinel-green/20 rounded-full shadow-sm"></div>
          </div>
          {error && (
            <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl shadow-sm text-left">
              <p className="text-red-500 text-sm font-black font-sans uppercase tracking-widest leading-relaxed">오류: {error}</p>
            </div>
          )}
          <button 
            disabled={isSubmitting}
            className={`w-full bg-black dark:bg-sentinel-green dark:text-black text-sentinel-green font-mono font-black py-5 rounded-2xl hover:bg-sentinel-green hover:text-black transition-all uppercase tracking-[0.3em] text-base shadow-lg ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''} font-headline shadow-xl text-center`}
          >
            {isSubmitting ? '코드 등록 중...' : '프로토콜 배포'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const LeaderboardTable = ({ onRankUpdate, maxRank = 10 }) => {
  const { formatTime } = useTimer();
  const { user } = useAuth();
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [useMockData, setUseMockData] = useState(false);
  const [error, setError] = useState(null);
  const mockDataRef = useRef(null);
  const retryCountRef = useRef(0);
  const maxRetriesRef = useRef(3);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // 전체 users 실시간 구독은 쿼터 소모가 커서 제한 조회 + 주기 갱신으로 대체
    const loadLeaderboard = async () => {
      try {
        const q = query(collection(db, 'users'), orderBy('survival_time', 'desc'), limit(maxRank));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));

        // 데이터가 없으면 모의 데이터 사용
        if (data.length === 0) {
          if (!mockDataRef.current) {
            mockDataRef.current = generateMockCompetitors();
          }
          setCompetitors(mockDataRef.current.slice(0, maxRank));
          setUseMockData(true);
        } else {
          mockDataRef.current = null;
          setCompetitors(data);
          setUseMockData(false);
        }

        // 제한 조회 환경에서는 보이는 목록 안에서만 순위를 계산
        if (user && onRankUpdate) {
          const index = data.findIndex((item) => item.id === user.uid);
          onRankUpdate(index !== -1 ? index + 1 : '-', data.length);
        }

        setLoading(false);
        setError(null);
        retryCountRef.current = 0;
      } catch (err) {
        console.error('Leaderboard load error:', err);
        if (retryCountRef.current < maxRetriesRef.current) {
          retryCountRef.current += 1;
          setError(`데이터 로드 오류 (재시도 ${retryCountRef.current}/${maxRetriesRef.current})`);
        } else {
          if (!mockDataRef.current) {
            mockDataRef.current = generateMockCompetitors();
          }
          setCompetitors(mockDataRef.current.slice(0, maxRank));
          setUseMockData(true);
          setError('모의 데이터로 전환되었습니다.');
          setLoading(false);
        }
      }
    };

    loadLeaderboard();
    const intervalId = window.setInterval(loadLeaderboard, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user, maxRank, onRankUpdate]);

  return (
    <div className="monitoring-panel bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-3xl overflow-hidden backdrop-blur-sm shadow-glow-green dark:shadow-glow-green-lg h-[340px] flex flex-col font-sans text-left">
      {useMockData && (
        <div className="bg-sentinel-green/10 border-b border-sentinel-green/20 px-4 py-2 flex-shrink-0">
          <p className="text-xs font-sans text-sentinel-green font-black uppercase tracking-widest italic">
            📊 데모 모드
          </p>
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex-shrink-0">
          <p className="text-xs font-sans text-red-500 font-bold">
            ⚠️ {error}
          </p>
        </div>
      )}
      <table className="w-full text-left border-collapse shadow-sm flex-1 overflow-y-auto">
        <thead>
          <tr className="bg-sentinel-green/5 border-b border-sentinel-green/10 shadow-sm sticky top-0">
            <th className="px-4 py-3 font-mono text-[11px] whitespace-nowrap uppercase tracking-widest text-sentinel-green/60 font-black italic shadow-sm text-left">순위</th>
            <th className="px-4 py-3 font-mono text-[11px] whitespace-nowrap uppercase tracking-widest text-sentinel-green/60 font-black italic text-left shadow-sm">닉네임</th>
            <th className="px-4 py-3 font-mono text-[11px] whitespace-nowrap uppercase tracking-widest text-sentinel-green/60 text-center font-black italic shadow-sm">상태</th>
            <th className="px-4 py-3 font-mono text-[11px] whitespace-nowrap uppercase tracking-widest text-sentinel-green/60 text-right font-black italic shadow-sm">생존</th>
          </tr>
        </thead>
        <tbody className="relative text-left">
          <AnimatePresence mode="popLayout">
            {loading ? (
              // Skeleton Loading
              Array(5).fill(0).map((_, i) => <SkeletonRow key={`skeleton-${i}`} />)
            ) : competitors.length > 0 ? (
              competitors.map((comp, index) => {
                const isMe = user?.uid === comp.id;
                return (
                  <motion.tr 
                    key={comp.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ 
                      opacity: 1, 
                      y: 0,
                      backgroundColor: isMe ? "rgba(0, 255, 148, 0.05)" : "transparent"
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className={`border-b border-sentinel-green/5 group transition-all duration-300 hover:bg-sentinel-green/15 dark:hover:bg-sentinel-green/20 hover:shadow-[0_0_20px_rgba(0,255,148,0.3)] shadow-sm ${isMe ? 'ring-1 ring-inset ring-sentinel-green/20 shadow-[0_0_15px_rgba(0,255,148,0.05)]' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono font-black text-lg text-sentinel-green flex items-center gap-2 tracking-tighter shadow-sm text-left">
                      {index === 0 ? <span className="text-xl drop-shadow-lg shadow-sm">🥇</span> : `#${String(index + 1).padStart(2, '0')}`}
                    </td>
                    <td className="px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2 text-left shadow-sm">
                        <img src={comp.photoURL || 'https://via.placeholder.com/32'} className="w-6 h-6 rounded-full border border-sentinel-green/10 shadow-sm flex-shrink-0" />
                        <div className="text-left min-w-0">
                          <div className={`font-sans font-bold text-sm leading-tight text-left shadow-sm truncate ${isMe ? 'text-sentinel-green font-black' : 'text-black dark:text-white'}`}>
                            {comp.nickname || '알 수 없음'}
                            {isMe && <span className="ml-1 text-[7px] bg-sentinel-green/20 px-1 py-0.5 rounded uppercase tracking-tighter font-black font-sans shadow-sm">나</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center shadow-sm text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest font-headline shadow-sm ${
                        comp.status === 'ONLINE' ? 'bg-sentinel-green/10 text-sentinel-green shadow-[0_0_10px_rgba(0,255,148,0.1)]' : 'bg-gray-100 dark:bg-white/5 text-gray-400 opacity-50'
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${comp.status === 'ONLINE' ? 'bg-sentinel-green animate-pulse' : 'bg-gray-400'}`}></span>
                        {comp.status === 'ONLINE' ? '온' : '오프'}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold text-sm tracking-widest italic shadow-sm text-right ${isMe ? 'text-sentinel-green drop-shadow-[0_0_8px_rgba(0,255,148,0.4)]' : 'text-black dark:text-white'}`}>
                      {formatTime(comp.survival_time || 0)}
                    </td>
                  </motion.tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="4" className="px-8 py-12 text-center shadow-sm">
                  <div className="font-mono text-xs text-gray-400 uppercase tracking-[0.2em] font-black shadow-sm text-center shadow-sm font-sans">
                    {loading ? "로딩 중..." : "탐색 중..."}
                  </div>
                </td>
              </tr>
            )}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
};

const Chat = () => {
  const { user, profile, isAdmin } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [spamWarning, setSpamWarning] = useState('');
  const [chatError, setChatError] = useState(null);
  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const lastMessageRef = useRef({ text: '', timestamp: 0 });
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    const setupChatListener = () => {
      try {
        const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'), limit(50));
        unsubscribeRef.current = onSnapshot(q, (snapshot) => {
          setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setChatError(null);
        }, (error) => {
          console.error("Chat Snapshot Error:", error);
          // Quota exceeded 또는 권한 에러 처리
          if (error.code === 'resource-exhausted' || error.code === 'permission-denied') {
            setChatError('메시지를 로드할 수 없습니다. 잠시 후 다시 시도해 주세요.');
            // 5초 후 재시도
            setTimeout(() => setupChatListener(), 5000);
          }
        });
      } catch (err) {
        console.error("Setup Chat Listener Error:", err);
        setChatError('채팅 시스템 오류가 발생했습니다.');
      }
    };

    setupChatListener();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);

  useEffect(() => {
    if (!messages.length) return;
    // 페이지 전체 스크롤이 아니라 채팅 영역 내부 스크롤만 이동시킨다.
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !user) return;

    // Anti-Spam 1: 동일 메시지 반복 차단
    const trimmedInput = input.trim();
    const now = Date.now();

    // Anti-Spam 2: 너무 긴 메시지 차단
    if (trimmedInput.length > 300) {
      setChatError('메시지는 300자 이하로 입력해 주세요.');
      setTimeout(() => setChatError(null), 3000);
      return;
    }

    // Anti-Spam 3: 초단위 연속 전송 차단 (봇성 입력 완화)
    if (now - lastMessageRef.current.timestamp < 1200) {
      setSpamWarning('메시지는 1.2초 간격으로 전송할 수 있습니다.');
      setTimeout(() => setSpamWarning(''), 3000);
      return;
    }

    // Anti-Spam 4: 동일 문자 과다 반복 차단
    if (/(.)\1{14,}/.test(trimmedInput)) {
      setSpamWarning('동일 문자 반복이 너무 많습니다.');
      setTimeout(() => setSpamWarning(''), 3000);
      return;
    }
    
    if (trimmedInput === lastMessageRef.current.text && now - lastMessageRef.current.timestamp < 10000) {
      setSpamWarning('중복된 내용은 보낼 수 없습니다. 10초 후에 다시 시도하세요.');
      setTimeout(() => setSpamWarning(''), 4000);
      return;
    }

    try {
      await addDoc(collection(db, 'messages'), {
        text: trimmedInput, uid: user.uid, nickname: profile?.nickname || '게스트',
        role: isAdmin ? 'ADMIN' : 'USER', timestamp: serverTimestamp()
      });
      lastMessageRef.current = { text: trimmedInput, timestamp: now };
      setInput('');
      setSpamWarning('');
      setChatError(null);
    } catch (error) {
      console.error("Send Message Error:", error);
      // Quota exceeded 에러 처리
      if (error.code === 'resource-exhausted' || error.message?.includes('429')) {
        setChatError('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
      } else if (error.code === 'permission-denied') {
        setChatError('메시지를 보낼 권한이 없습니다.');
      } else {
        setChatError('메시지 전송 중 오류가 발생했습니다.');
      }
      setTimeout(() => setChatError(null), 4000);
    }
  };

  return (
    <aside className="w-full h-full min-h-0 flex flex-col bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-3xl overflow-hidden backdrop-blur-sm shadow-glow-green dark:shadow-glow-green-lg font-sans text-left">
      <div className="p-4 border-b border-sentinel-green/10 bg-sentinel-green/5 flex items-center justify-between shadow-sm shadow-xl shadow-sm flex-shrink-0">
        <h3 className="font-sans font-black text-xs tracking-widest flex items-center gap-2 uppercase italic text-sentinel-green font-headline tracking-tight text-left">
          라이브 채널
        </h3>
        <LiveDot />
      </div>
      <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto px-6 pt-4 pb-2 space-y-4 text-left shadow-inner">
        {messages.map(msg => (
          <div key={msg.id} className="space-y-1.5 text-left">
            <div className="flex items-center justify-between gap-3 text-left">
              <span className={`font-sans text-[11px] font-bold tracking-[-0.02em] leading-none ${msg.role === 'ADMIN' ? 'text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'text-sentinel-green'} text-left`}>{msg.nickname}</span>
              <span className="font-sans text-[10px] text-gray-500 font-medium opacity-70 tabular-nums text-right leading-none">{(msg.timestamp?.toMillis ? new Date(msg.timestamp.toMillis()) : new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <p className={`rounded-2xl border px-3 py-3 text-[13px] leading-[1.55] font-sans font-medium shadow-sm ${
              msg.role === 'ADMIN' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-black/20 dark:bg-black/40 border-sentinel-green/5 text-gray-700 dark:text-gray-300'
            }`}>
              {msg.text}
            </p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      {(spamWarning || chatError) && (
        <div className={`px-4 py-2 border-t font-sans font-medium text-center text-xs animate-pulse flex-shrink-0 ${
          spamWarning 
            ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400' 
            : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
        }`}>
          {spamWarning ? '⏳ ' + spamWarning : '❌ ' + chatError}
        </div>
      )}
      <div className="shrink-0 p-4 bg-sentinel-green/5 border-t border-sentinel-green/10 backdrop-blur-md shadow-xl shadow-sm">
        {user ? (
          <form onSubmit={sendMessage} className="flex gap-2">
            <input 
              value={input} onChange={e => setInput(e.target.value)}
              maxLength={300}
              className="flex-1 bg-black/10 dark:bg-black/40 border border-sentinel-green/20 px-4 py-3 rounded-xl text-[13px] focus:outline-none focus:ring-1 focus:ring-sentinel-green/50 transition-all font-sans text-black dark:text-white placeholder:text-gray-400 font-medium shadow-inner"
              placeholder="메시지를 입력하세요"
            />
            <button 
              type="submit"
              className="shrink-0 px-4 py-2 bg-black dark:bg-sentinel-green text-sentinel-green dark:text-black font-sans font-bold text-[11px] uppercase tracking-tight rounded-xl border border-sentinel-green/30 hover:shadow-[0_0_15px_rgba(0,255,148,0.3)] transition-all"
            >
              전송
            </button>
          </form>
        ) : (
          <div className="text-center py-2 text-center shadow-sm">
            <p className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest mb-3 italic font-black opacity-60 font-sans text-center">로그인이 필요합니다</p>
            <button onClick={() => window.scrollTo(0, 0)} className="w-full bg-black dark:bg-sentinel-green dark:text-black text-sentinel-green py-3 rounded-xl font-mono font-black text-[10px] uppercase border border-sentinel-green/20 hover:bg-sentinel-green hover:text-black transition-all shadow-lg font-headline shadow-xl text-center shadow-xl">로그인하러 가기</button>
          </div>
        )}
      </div>
    </aside>
  );
};

const SummaryCards = ({ projectCount, todayLogCount, focusTimeText }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-6 shadow-[0_0_20px_rgba(0,255,148,0.07)]">
        <p className="text-[11px] tracking-[0.2em] uppercase font-bold text-sentinel-green/80 mb-3">오늘 요약</p>
        <p className="text-5xl font-mono font-black text-sentinel-green mb-2">{projectCount}</p>
        <p className="text-sm text-gray-500 dark:text-gray-300">진행 중 프로젝트 수</p>
      </div>
      <div className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-6 shadow-[0_0_20px_rgba(0,255,148,0.07)]">
        <p className="text-[11px] tracking-[0.2em] uppercase font-bold text-sentinel-green/80 mb-3">활동 로그</p>
        <p className="text-5xl font-mono font-black text-sentinel-green mb-2">{todayLogCount}</p>
        <p className="text-sm text-gray-500 dark:text-gray-300">오늘 커밋/기록 수</p>
      </div>
      <div className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-6 shadow-[0_0_20px_rgba(0,255,148,0.07)]">
        <p className="text-[11px] tracking-[0.2em] uppercase font-bold text-sentinel-green/80 mb-3">현재 집중 세션</p>
        <p className="text-5xl font-mono font-black text-sentinel-green mb-2">{focusTimeText}</p>
        <p className="text-sm text-gray-500 dark:text-gray-300">몰입 시간 랭킹은 리듬을 위한 지표입니다.</p>
      </div>
    </div>
  );
};

const ProjectInputPanel = ({ projects, logs, onCreateProject, onUpdateProject, onCreateLog, onUpdateLog, onDeleteLog }) => {
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    status: '진행 중',
    tags: '',
    demoUrl: '',
    repoUrl: ''
  });
  const [editProjectId, setEditProjectId] = useState('');
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    status: '진행 중',
    tags: '',
    demoUrl: '',
    repoUrl: ''
  });
  const [logForm, setLogForm] = useState({
    projectId: '',
    summary: '',
    retro: '',
    links: ''
  });
  const [statusMessage, setStatusMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [editingLogId, setEditingLogId] = useState('');
  const [editingLogForm, setEditingLogForm] = useState({ summary: '', retro: '', links: '' });
  const [logPeriodFilter, setLogPeriodFilter] = useState('TODAY');

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
  const visibleLogs = logs.filter((log) => {
    const createdAtMs = log.createdAt?.toMillis ? log.createdAt.toMillis() : 0;
    if (logPeriodFilter === 'ALL') return true;
    if (logPeriodFilter === 'LAST_7_DAYS') return createdAtMs >= sevenDaysAgo;
    return createdAtMs >= startOfToday;
  });

  useEffect(() => {
    if (!projects.length) return;
    if (!editProjectId) {
      setEditProjectId(projects[0].id);
      setLogForm((prev) => ({ ...prev, projectId: projects[0].id }));
      return;
    }
    const selected = projects.find((project) => project.id === editProjectId);
    if (!selected) return;
    // 수정 대상 프로젝트를 바꿀 때 폼을 현재 값으로 동기화한다.
    setEditForm({
      title: selected.title || '',
      description: selected.description || '',
      status: selected.status || '진행 중',
      tags: Array.isArray(selected.tags) ? selected.tags.join(', ') : '',
      demoUrl: selected.demoUrl || '',
      repoUrl: selected.repoUrl || ''
    });
    setLogForm((prev) => ({ ...prev, projectId: selected.id }));
  }, [projects, editProjectId]);

  const handleCreateProject = async (event) => {
    event.preventDefault();
    if (!onCreateProject) return;
    try {
      setIsBusy(true);
      await onCreateProject(createForm);
      setCreateForm({ title: '', description: '', status: '진행 중', tags: '', demoUrl: '', repoUrl: '' });
      setStatusMessage('프로젝트 카드가 생성되었습니다.');
    } catch (error) {
      setStatusMessage(error.message || '프로젝트 생성 중 오류가 발생했습니다.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpdateProject = async (event) => {
    event.preventDefault();
    if (!onUpdateProject || !editProjectId) return;
    try {
      setIsBusy(true);
      await onUpdateProject(editProjectId, editForm);
      setStatusMessage('프로젝트 카드가 수정되었습니다.');
    } catch (error) {
      setStatusMessage(error.message || '프로젝트 수정 중 오류가 발생했습니다.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateLog = async (event) => {
    event.preventDefault();
    if (!onCreateLog || !logForm.projectId) return;
    try {
      setIsBusy(true);
      await onCreateLog(logForm);
      setLogForm((prev) => ({ ...prev, summary: '', retro: '', links: '' }));
      setStatusMessage('오늘 작업 로그가 저장되었습니다.');
    } catch (error) {
      setStatusMessage(error.message || '작업 로그 저장 중 오류가 발생했습니다.');
    } finally {
      setIsBusy(false);
    }
  };

  const startEditLog = (log) => {
    setEditingLogId(log.id);
    setEditingLogForm({
      summary: log.summary || '',
      retro: log.retro || '',
      links: Array.isArray(log.links) ? log.links.join(', ') : ''
    });
  };

  const cancelEditLog = () => {
    setEditingLogId('');
    setEditingLogForm({ summary: '', retro: '', links: '' });
  };

  const handleUpdateLog = async (event) => {
    event.preventDefault();
    if (!editingLogId || !onUpdateLog) return;
    try {
      setIsBusy(true);
      await onUpdateLog(editingLogId, editingLogForm);
      setStatusMessage('작업 로그가 수정되었습니다.');
      cancelEditLog();
    } catch (error) {
      setStatusMessage(error.message || '작업 로그 수정 중 오류가 발생했습니다.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDeleteLog = async (logId) => {
    if (!onDeleteLog || !logId) return;
    try {
      setIsBusy(true);
      await onDeleteLog(logId);
      setStatusMessage('작업 로그가 삭제되었습니다.');
      if (editingLogId === logId) cancelEditLog();
    } catch (error) {
      setStatusMessage(error.message || '작업 로그 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-5 md:p-6 shadow-[0_0_24px_rgba(0,255,148,0.08)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="module-header-text text-sentinel-green">입력형 라운지 폼</h3>
        <span className="text-xs text-sentinel-green/70 font-bold">생성 / 수정 / 로그</span>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <form onSubmit={handleCreateProject} className="rounded-2xl border border-sentinel-green/15 bg-black/20 p-4 space-y-2">
          <p className="text-sm font-bold text-sentinel-green">프로젝트 생성</p>
          <input value={createForm.title} onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="프로젝트 제목" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
          <input value={createForm.description} onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="설명" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
          <input value={createForm.tags} onChange={(event) => setCreateForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="태그(쉼표 구분)" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
          <input value={createForm.demoUrl} onChange={(event) => setCreateForm((prev) => ({ ...prev, demoUrl: event.target.value }))} placeholder="Demo URL" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
          <input value={createForm.repoUrl} onChange={(event) => setCreateForm((prev) => ({ ...prev, repoUrl: event.target.value }))} placeholder="Repo URL" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
          <button type="submit" disabled={isBusy} className="w-full rounded-xl border border-sentinel-green/50 px-3 py-2 text-sm font-bold text-sentinel-green disabled:opacity-50">생성</button>
        </form>

        <form onSubmit={handleUpdateProject} className="rounded-2xl border border-sentinel-green/15 bg-black/20 p-4 space-y-2">
          <p className="text-sm font-bold text-sentinel-green">프로젝트 수정</p>
          <select value={editProjectId} onChange={(event) => setEditProjectId(event.target.value)} className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm">
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
          <input value={editForm.title} onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="프로젝트 제목" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
          <input value={editForm.description} onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="설명" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
          <input value={editForm.tags} onChange={(event) => setEditForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="태그(쉼표 구분)" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
          <button type="submit" disabled={isBusy || !editProjectId} className="w-full rounded-xl border border-sentinel-green/50 px-3 py-2 text-sm font-bold text-sentinel-green disabled:opacity-50">수정</button>
        </form>

        <form onSubmit={handleCreateLog} className="rounded-2xl border border-sentinel-green/15 bg-black/20 p-4 space-y-2">
          <p className="text-sm font-bold text-sentinel-green">오늘 작업 로그</p>
          <select value={logForm.projectId} onChange={(event) => setLogForm((prev) => ({ ...prev, projectId: event.target.value }))} className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm">
            {projects.map((project) => <option key={`${project.id}_log`} value={project.id}>{project.title}</option>)}
          </select>
          <input value={logForm.summary} onChange={(event) => setLogForm((prev) => ({ ...prev, summary: event.target.value }))} placeholder="오늘 작업 내용" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
          <input value={logForm.retro} onChange={(event) => setLogForm((prev) => ({ ...prev, retro: event.target.value }))} placeholder="회고 메모" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
          <input value={logForm.links} onChange={(event) => setLogForm((prev) => ({ ...prev, links: event.target.value }))} placeholder="관련 링크(쉼표 구분)" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
          <button type="submit" disabled={isBusy || !logForm.projectId} className="w-full rounded-xl border border-sentinel-green/50 px-3 py-2 text-sm font-bold text-sentinel-green disabled:opacity-50">저장</button>
        </form>
      </div>
      <div className="mt-4 rounded-2xl border border-sentinel-green/15 bg-black/20 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-sentinel-green">오늘 로그 수정 / 삭제</p>
          <div className="flex items-center gap-2">
            <select
              value={logPeriodFilter}
              onChange={(event) => setLogPeriodFilter(event.target.value)}
              className="rounded-lg border border-sentinel-green/30 bg-black/20 px-2 py-1 text-xs text-sentinel-green"
            >
              <option value="TODAY">오늘</option>
              <option value="LAST_7_DAYS">7일</option>
              <option value="ALL">전체</option>
            </select>
            <span className="text-xs text-gray-400">{visibleLogs.length}개</span>
          </div>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {visibleLogs.map((log) => (
            <div key={log.id} className="rounded-xl border border-sentinel-green/10 bg-black/25 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-white truncate">{log.projectTitle || '프로젝트'}: {log.summary || '요약 없음'}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => startEditLog(log)} className="text-xs px-2 py-1 rounded-lg border border-sentinel-green/40 text-sentinel-green">수정</button>
                  <button type="button" onClick={() => handleDeleteLog(log.id)} className="text-xs px-2 py-1 rounded-lg border border-red-400/40 text-red-400">삭제</button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1">{log.retro || '회고 없음'}</p>
            </div>
          ))}
          {!visibleLogs.length && <p className="text-xs text-gray-500">선택한 기간에 해당하는 로그가 없습니다.</p>}
        </div>
        {editingLogId && (
          <form onSubmit={handleUpdateLog} className="mt-3 rounded-xl border border-sentinel-green/20 bg-black/25 p-3 space-y-2">
            {/* 수정 폼을 별도로 두어 기존 작성 폼과 충돌하지 않게 한다. */}
            <input value={editingLogForm.summary} onChange={(event) => setEditingLogForm((prev) => ({ ...prev, summary: event.target.value }))} placeholder="수정할 작업 내용" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
            <input value={editingLogForm.retro} onChange={(event) => setEditingLogForm((prev) => ({ ...prev, retro: event.target.value }))} placeholder="수정할 회고 메모" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
            <input value={editingLogForm.links} onChange={(event) => setEditingLogForm((prev) => ({ ...prev, links: event.target.value }))} placeholder="수정할 링크(쉼표 구분)" className="w-full rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button type="submit" disabled={isBusy} className="flex-1 rounded-xl border border-sentinel-green/50 px-3 py-2 text-sm font-bold text-sentinel-green disabled:opacity-50">수정 저장</button>
              <button type="button" onClick={cancelEditLog} className="flex-1 rounded-xl border border-gray-500/40 px-3 py-2 text-sm font-bold text-gray-300">취소</button>
            </div>
          </form>
        )}
      </div>
      {statusMessage && <p className="mt-3 text-xs text-sentinel-green/80">{statusMessage}</p>}
    </section>
  );
};

const ProjectBoardPanel = ({ projects }) => {
  const [statusFilter, setStatusFilter] = useState('전체');
  const [tagFilter, setTagFilter] = useState('전체');
  const statusOptions = ['전체', ...Array.from(new Set(projects.map((project) => project.status || '미분류')))];
  const tagOptions = ['전체', ...Array.from(new Set(projects.flatMap((project) => Array.isArray(project.tags) ? project.tags : [])))];
  const filteredProjects = statusFilter === '전체'
    ? projects
    : projects.filter((project) => (project.status || '미분류') === statusFilter);
  const filteredByTagProjects = tagFilter === '전체'
    ? filteredProjects
    : filteredProjects.filter((project) => Array.isArray(project.tags) && project.tags.includes(tagFilter));

  return (
    <section className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-5 md:p-6 shadow-[0_0_24px_rgba(0,255,148,0.08)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="module-header-text text-sentinel-green">Module_03: 프로젝트_보드</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-sentinel-green/70 font-bold">작업물 아카이브</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-sentinel-green/30 bg-black/20 px-2 py-1 text-xs text-sentinel-green"
          >
            {statusOptions.map((status) => <option key={`status_${status}`} value={status}>{status}</option>)}
          </select>
          <select
            value={tagFilter}
            onChange={(event) => setTagFilter(event.target.value)}
            className="rounded-lg border border-sentinel-green/30 bg-black/20 px-2 py-1 text-xs text-sentinel-green"
          >
            {tagOptions.map((tag) => <option key={`tag_${tag}`} value={tag}>{tag}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-4">
        {filteredByTagProjects.map((project) => (
          <article key={project.id} className="rounded-2xl border border-sentinel-green/15 bg-black/15 dark:bg-black/25 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-bold text-black dark:text-white">{project.title}</h4>
                <p className="text-xs text-sentinel-green mt-1">{project.status}</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                {project.tags.map((tag) => (
                  <span key={`${project.id}_${tag}`} className="text-[10px] px-2 py-1 rounded-lg border border-sentinel-green/30 text-sentinel-green/80">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              {/* 오늘 작업 로그와 회고를 분리해 발표 시 맥락 설명을 쉽게 만든다. */}
              <p><span className="text-sentinel-green font-bold">오늘 작업:</span> {project.todayLog}</p>
              <p><span className="text-sentinel-green font-bold">회고 메모:</span> {project.retro}</p>
            </div>
            <div className="mt-4 flex gap-3 text-xs">
              <a href={project.demoUrl} target="_blank" rel="noreferrer" className="text-sentinel-green hover:underline">Demo</a>
              <a href={project.repoUrl} target="_blank" rel="noreferrer" className="text-sentinel-green hover:underline">Repo</a>
            </div>
          </article>
        ))}
        {!filteredByTagProjects.length && (
          <div className="rounded-2xl border border-sentinel-green/10 bg-black/20 p-4 text-sm text-gray-500">
            선택한 상태에 해당하는 프로젝트가 없습니다.
          </div>
        )}
      </div>
    </section>
  );
};

const ProjectChatPanel = ({ projects, messages, onSendMessage, searchState, onSearchStateChange }) => {
  const [activeProjectId, setActiveProjectId] = useState(projects[0]?.id || '');
  const [draft, setDraft] = useState('');
  const [messageType, setMessageType] = useState('GENERAL');
  const [isSending, setIsSending] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState(searchState?.keyword || '');
  const [typeFilter, setTypeFilter] = useState(searchState?.type || 'ALL');
  const [recentLimit, setRecentLimit] = useState(String(searchState?.recentLimit || 150));

  useEffect(() => {
    if (!projects.length) {
      setActiveProjectId('');
      return;
    }
    const hasActiveProject = projects.some((project) => project.id === activeProjectId);
    if (!activeProjectId || !hasActiveProject) {
      setActiveProjectId(projects[0].id);
    }
  }, [projects, activeProjectId]);

  useEffect(() => {
    const nextKeyword = (searchKeyword || '').trim();
    const nextLimit = Number(recentLimit) || 150;
    if (!onSearchStateChange) return;
    // 검색 상태를 App으로 올려 서버 쿼리 조건으로 사용한다.
    onSearchStateChange({
      projectId: activeProjectId,
      keyword: nextKeyword,
      type: typeFilter,
      recentLimit: Math.min(Math.max(nextLimit, 20), 300)
    });
  }, [activeProjectId, searchKeyword, typeFilter, recentLimit, onSearchStateChange]);

  const filteredMessages = messages.filter((message) => {
    if (message.projectId !== activeProjectId) return false;
    if (typeFilter !== 'ALL' && message.type !== typeFilter && message.messageType !== typeFilter) return false;
    if (!searchKeyword.trim()) return true;
    const keyword = searchKeyword.trim().toLowerCase();
    return `${message.author} ${message.text} ${message.type}`.toLowerCase().includes(keyword);
  });
  const typeLabel = {
    GENERAL: '일반',
    QUESTION: '질문',
    FEEDBACK: '피드백',
    REFERENCE: '참고자료',
    질문: '질문',
    피드백: '피드백',
    참고자료: '참고자료',
    일반: '일반'
  };
  const typeClass = {
    GENERAL: 'bg-gray-500/10 text-gray-300 border-gray-400/30',
    QUESTION: 'bg-orange-500/10 text-orange-300 border-orange-400/30',
    FEEDBACK: 'bg-blue-500/10 text-blue-300 border-blue-400/30',
    REFERENCE: 'bg-purple-500/10 text-purple-300 border-purple-400/30',
    일반: 'bg-gray-500/10 text-gray-300 border-gray-400/30',
    질문: 'bg-orange-500/10 text-orange-300 border-orange-400/30',
    피드백: 'bg-blue-500/10 text-blue-300 border-blue-400/30',
    참고자료: 'bg-purple-500/10 text-purple-300 border-purple-400/30'
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !activeProjectId || !onSendMessage) return;

    try {
      setIsSending(true);
      // 스레드 메시지 저장은 부모(App)에서 Firestore 트랜잭션 흐름으로 처리한다.
      await onSendMessage({ projectId: activeProjectId, text, messageType });
      setDraft('');
      setMessageType('GENERAL');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="h-full min-h-0 rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-4 md:p-5 shadow-[0_0_24px_rgba(0,255,148,0.08)] flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="module-header-text text-sentinel-green">Module_04: 프로젝트_채팅</h3>
        <span className="text-xs text-sentinel-green/70 font-bold">기록형 협업</span>
      </div>
      <div className="grid grid-cols-1 gap-2 mb-3">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => setActiveProjectId(project.id)}
            className={`text-left rounded-xl px-3 py-2 border text-sm transition ${
              activeProjectId === project.id
                ? 'border-sentinel-green/60 bg-sentinel-green/10 text-sentinel-green'
                : 'border-sentinel-green/20 bg-black/20 text-gray-400'
            }`}
          >
            {project.title}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-xs text-black dark:text-white"
        >
          <option value="ALL">전체 타입</option>
          <option value="GENERAL">일반</option>
          <option value="QUESTION">질문</option>
          <option value="FEEDBACK">피드백</option>
          <option value="REFERENCE">참고자료</option>
        </select>
        <input
          value={searchKeyword}
          onChange={(event) => setSearchKeyword(event.target.value)}
          placeholder="메시지 검색"
          className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-xs text-black dark:text-white"
        />
        <select
          value={recentLimit}
          onChange={(event) => setRecentLimit(event.target.value)}
          className="rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-xs text-black dark:text-white"
        >
          <option value="50">최근 50개</option>
          <option value="100">최근 100개</option>
          <option value="150">최근 150개</option>
          <option value="300">최근 300개</option>
        </select>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
        {filteredMessages.map((message) => (
          <div key={message.id} className="rounded-xl border border-sentinel-green/10 bg-black/25 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-bold text-sentinel-green">{message.author}</span>
              <span className="text-[11px] text-gray-500">{message.time}</span>
            </div>
            <p className={`inline-flex px-2 py-0.5 rounded-md border text-[11px] mb-1 ${typeClass[message.type] || typeClass.GENERAL}`}>
              {typeLabel[message.type] || message.type}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 break-words">{message.text}</p>
          </div>
        ))}
        {!filteredMessages.length && (
          <div className="rounded-xl border border-sentinel-green/10 bg-black/20 p-3 text-sm text-gray-500">
            조건에 맞는 메시지가 없습니다.
          </div>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-sentinel-green/15">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <select
            value={messageType}
            onChange={(event) => setMessageType(event.target.value)}
            className="w-28 rounded-xl border border-sentinel-green/30 bg-black/20 px-2 py-2 text-xs text-black dark:text-white"
          >
            <option value="GENERAL">일반</option>
            <option value="QUESTION">질문</option>
            <option value="FEEDBACK">피드백</option>
            <option value="REFERENCE">참고자료</option>
          </select>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="질문, 피드백, 참고자료 링크를 입력하세요."
            className="flex-1 rounded-xl border border-sentinel-green/30 bg-black/20 px-3 py-2 text-sm text-black dark:text-white"
          />
          <button
            type="submit"
            disabled={isSending}
            className="px-3 py-2 rounded-xl border border-sentinel-green/50 text-sentinel-green text-sm font-bold disabled:opacity-50"
          >
            {isSending ? '전송 중' : '등록'}
          </button>
        </form>
      </div>
    </section>
  );
};

const FocusAidPanel = () => {
  return (
    <section className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-5 md:p-6 shadow-[0_0_24px_rgba(0,255,148,0.08)]">
      <h3 className="module-header-text text-sentinel-green mb-4">Module_05: 몰입_보조</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-sentinel-green/15 bg-black/20 p-4">
          <p className="text-sm font-bold text-white">로파이 라디오</p>
          <p className="text-xs text-gray-400 mt-1">작업 몰입을 위한 배경 사운드</p>
        </div>
        <div className="rounded-2xl border border-sentinel-green/15 bg-black/20 p-4">
          <p className="text-sm font-bold text-white">화이트 노이즈</p>
          <p className="text-xs text-gray-400 mt-1">환경 소음을 덮어주는 집중 모드</p>
        </div>
        <div className="rounded-2xl border border-sentinel-green/15 bg-black/20 p-4">
          <p className="text-sm font-bold text-white">집중 세션 시작</p>
          <p className="text-xs text-gray-400 mt-1">타이머를 시작하고 몰입 시간을 기록</p>
        </div>
      </div>
    </section>
  );
};

const FocusRankingPanel = ({ ranking }) => {
  return (
    <section className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-5 md:p-6 shadow-[0_0_24px_rgba(0,255,148,0.08)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="module-header-text text-sentinel-green">몰입 시간 랭킹</h3>
        <span className="text-xs text-sentinel-green/70 font-bold">성과 비교가 아닌 리듬 지표</span>
      </div>
      <div className="space-y-3">
        {ranking.map((row, index) => (
          <div key={row.id} className="rounded-2xl border border-sentinel-green/10 bg-black/20 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-sentinel-green font-mono font-black text-lg">{String(index + 1).padStart(2, '0')}</span>
              <span className="text-black dark:text-white font-bold">{row.nickname}</span>
            </div>
            <div className="text-right">
              <p className="font-mono font-black text-sentinel-green">{row.todayFocus}</p>
              <p className="text-xs text-gray-500">연속 {row.streakDays}일</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

// --- App Root ---

function App() {
  const { isActive, isTerminated, formatTime, survivalTime, resumeHere, bonusPulse } = useTimer();
  const { user, profile, showNicknameModal, isAdmin, loginWithGoogle } = useAuth();
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isDonationOpen, setIsDonationOpen] = useState(false);
  const [isSponsorshipOpen, setIsSponsorshipOpen] = useState(false);
  const [isUpdateNoteOpen, setIsUpdateNoteOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [competitorStats, setCompetitorStats] = useState({ count: 0, myRank: 'PENDING...' });
  const [successMessage, setSuccessMessage] = useState('');
  const [donationPopupStep, setDonationPopupStep] = useState(0);
  const [module04Height, setModule04Height] = useState(null);
  const leftModulesRef = useRef(null);
  const paymentHandledRef = useRef(false);
  const [projects, setProjects] = useState([]);
  const [projectLogs, setProjectLogs] = useState([]);
  const [projectThreads, setProjectThreads] = useState([]);
  const [threadMessages, setThreadMessages] = useState([]);
  const [focusSessions, setFocusSessions] = useState([]);
  const [loungeDataReady, setLoungeDataReady] = useState(false);
  const [chatQueryState, setChatQueryState] = useState({
    projectId: '',
    keyword: '',
    type: 'ALL',
    recentLimit: 150
  });

  const [showInitializing, setShowInitializing] = useState(false);
  const [hasPlayedWelcomeSequence, setHasPlayedWelcomeSequence] = useState(() => sessionStorage.getItem('sentinel_boot_sequence') === 'done');

  useEffect(() => {
    if (!user) {
      setShowSplash(false);
      setShowInitializing(false);
      return;
    }
    if (hasPlayedWelcomeSequence) return;

    setShowInitializing(true);
    const initTimer = setTimeout(() => {
      setShowInitializing(false);
      setShowSplash(true);
    }, 1800);
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
      setHasPlayedWelcomeSequence(true);
      sessionStorage.setItem('sentinel_boot_sequence', 'done');
    }, 5000);

    return () => {
      clearTimeout(initTimer);
      clearTimeout(splashTimer);
    };
  }, [user, hasPlayedWelcomeSequence]);

  // handleRankUpdate를 useCallback으로 메모이제이션하여 불필요한 의존성 재생성 방지
  const handleRankUpdate = useCallback((rank, count) => {
    setCompetitorStats({ count, myRank: rank });
  }, []);

  const handleDonationSuccessFlow = () => {
    setDonationPopupStep(1);
  };

  const handleDonationPopupConfirm = () => {
    if (donationPopupStep === 1) {
      setDonationPopupStep(2);
      return;
    }
    setDonationPopupStep(0);
  };

  const handleDonationPopupClose = () => {
    setDonationPopupStep(0);
  };
  // 토스 리다이렉트 성공 파라미터는 서버 검증 함수로 전달하고,
  // 클라이언트에서는 Firestore를 직접 쓰지 않는다.
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentKey = urlParams.get('paymentKey');
    const orderId = urlParams.get('orderId');
    const amount = urlParams.get('amount');
    const to = urlParams.get('to');

    if (paymentKey && orderId && amount && user && !paymentHandledRef.current) {
      paymentHandledRef.current = true;
      const recordDonation = async () => {
        try {
          await requestDonationVerification({
            user,
            payload: {
              paymentKey,
              orderId,
              amount: Number(amount),
              to: to || 'UNICEF'
            }
          });

          // URL 파라미터 제거
          window.history.replaceState({}, document.title, window.location.pathname);
          handleDonationSuccessFlow();
        } catch (error) {
          console.error('Donation recording failed:', error);
        }
      };
      recordDonation();
    }
  }, [user]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Shift + Q: admin terminal
      if (e.shiftKey && e.key.toUpperCase() === 'Q' && isAdmin) {
        setIsTerminalOpen(p => !p);
      }

      // F1 또는 Alt + H: shortcut guide
      if (e.key === 'F1' || (e.altKey && e.key.toUpperCase() === 'H')) {
        e.preventDefault();
        setIsGuideOpen(p => !p);
      }

      // Shift + T: theme toggle
      if (e.shiftKey && e.key.toUpperCase() === 'T') {
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark) {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('theme', 'light');
        } else {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAdmin]);

  useEffect(() => {
    if (!user) return;

    const syncModuleHeight = () => {
      if (window.innerWidth < 1024 || !leftModulesRef.current) {
        setModule04Height(null);
        return;
      }
      const nextHeight = Math.ceil(leftModulesRef.current.getBoundingClientRect().height);
      setModule04Height(nextHeight);
    };

    syncModuleHeight();
    requestAnimationFrame(syncModuleHeight);

    const observer = new ResizeObserver(syncModuleHeight);
    if (leftModulesRef.current) observer.observe(leftModulesRef.current);
    window.addEventListener('resize', syncModuleHeight);
    const timer = window.setInterval(syncModuleHeight, 600);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncModuleHeight);
      window.clearInterval(timer);
    };
  }, [user, showNicknameModal]);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setProjectLogs([]);
      setProjectThreads([]);
      setThreadMessages([]);
      setFocusSessions([]);
      setLoungeDataReady(false);
      return;
    }

    // 날짜 키는 focus_sessions 집계 필터에 사용한다.
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const unsubscribers = [];

    const projectsQuery = query(collection(db, 'projects'), orderBy('updatedAt', 'desc'), limit(20));
    unsubscribers.push(onSnapshot(projectsQuery, (snapshot) => {
      const next = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setProjects(next);
      setLoungeDataReady(true);
    }, () => setLoungeDataReady(true)));

    const logsQuery = query(
      collection(db, 'project_logs'),
      orderBy('createdAt', 'desc'),
      limit(300)
    );
    unsubscribers.push(onSnapshot(logsQuery, (snapshot) => {
      const next = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setProjectLogs(next);
    }));

    const threadsQuery = query(collection(db, 'project_threads'), orderBy('lastMessageAt', 'desc'), limit(50));
    unsubscribers.push(onSnapshot(threadsQuery, (snapshot) => {
      const next = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setProjectThreads(next);
    }));

    // 최근 N개 + 타입 + 키워드 토큰(가능할 때) 기준으로 서버 쿼리를 최소화한다.
    const messageConstraints = [];
    if (chatQueryState.projectId) {
      messageConstraints.push(where('projectId', '==', chatQueryState.projectId));
    }
    if (chatQueryState.type && chatQueryState.type !== 'ALL') {
      messageConstraints.push(where('messageType', '==', chatQueryState.type));
    }
    const keywordToken = (chatQueryState.keyword || '').trim().toLowerCase();
    if (keywordToken.length >= 2) {
      messageConstraints.push(where('messageKeywords', 'array-contains', keywordToken));
    }
    messageConstraints.push(orderBy('createdAt', 'desc'));
    messageConstraints.push(limit(chatQueryState.recentLimit || 150));

    const primaryMessagesQuery = query(collectionGroup(db, 'messages'), ...messageConstraints);
    const fallbackConstraints = [
      ...(chatQueryState.projectId ? [where('projectId', '==', chatQueryState.projectId)] : []),
      ...(chatQueryState.type && chatQueryState.type !== 'ALL' ? [where('messageType', '==', chatQueryState.type)] : []),
      orderBy('createdAt', 'desc'),
      limit(chatQueryState.recentLimit || 150)
    ];
    const fallbackMessagesQuery = query(collectionGroup(db, 'messages'), ...fallbackConstraints);

    let fallbackUnsubscribe = null;
    const primaryUnsubscribe = onSnapshot(primaryMessagesQuery, (snapshot) => {
      const next = snapshot.docs.map((entry) => {
        const threadId = entry.ref.parent.parent?.id || '';
        return { id: entry.id, threadId, ...entry.data() };
      });
      setThreadMessages(next);
    }, () => {
      // 인덱스 미생성/제약 충돌 시 키워드 조건 없이 폴백한다.
      if (fallbackUnsubscribe) return;
      fallbackUnsubscribe = onSnapshot(fallbackMessagesQuery, (snapshot) => {
        const next = snapshot.docs.map((entry) => {
          const threadId = entry.ref.parent.parent?.id || '';
          return { id: entry.id, threadId, ...entry.data() };
        });
        setThreadMessages(next);
      });
    });
    unsubscribers.push(() => {
      primaryUnsubscribe();
      if (fallbackUnsubscribe) fallbackUnsubscribe();
    });

    const focusQuery = query(
      collection(db, 'focus_sessions'),
      where('dateKey', '==', todayKey),
      limit(500)
    );
    unsubscribers.push(onSnapshot(focusQuery, (snapshot) => {
      const next = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      setFocusSessions(next);
    }));

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [user, chatQueryState.projectId, chatQueryState.type, chatQueryState.keyword, chatQueryState.recentLimit]);

  const projectList = projects.length ? projects : SAMPLE_PROJECTS;
  const threadToProjectMap = new Map(projectThreads.map((thread) => [thread.id, thread.projectId]));
  const mappedMessages = threadMessages
    .map((message) => ({
      ...message,
      projectId: message.projectId || threadToProjectMap.get(message.threadId) || '',
      author: message.authorNickname || message.author || '게스트',
      type: message.messageType || message.type || 'GENERAL',
      text: message.text || '',
      time: message.createdAt?.toMillis
        ? new Date(message.createdAt.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : (message.time || '--:--')
    }))
    .filter((message) => Boolean(message.projectId))
    .reverse();
  const chatMessages = mappedMessages.length ? mappedMessages : SAMPLE_THREAD_MESSAGES;

  useEffect(() => {
    if (!projectList.length) return;
    if (chatQueryState.projectId) return;
    setChatQueryState((prev) => ({ ...prev, projectId: projectList[0].id }));
  }, [projectList, chatQueryState.projectId]);

  const latestLogsByProject = new Map();
  projectLogs.forEach((entry) => {
    if (!entry.projectId || latestLogsByProject.has(entry.projectId)) return;
    latestLogsByProject.set(entry.projectId, entry);
  });

  const projectCards = projectList.map((project) => {
    const latestLog = latestLogsByProject.get(project.id);
    return {
      ...project,
      todayLog: latestLog?.summary || project.todayLog || '오늘 작업 로그를 작성해 주세요.',
      retro: latestLog?.retro || project.retro || '회고 메모를 남겨 성장 과정을 기록해 보세요.'
    };
  });

  const focusAggregation = new Map();
  focusSessions.forEach((session) => {
    const key = session.userUid || session.nickname || session.id;
    if (!focusAggregation.has(key)) {
      focusAggregation.set(key, {
        id: key,
        nickname: session.nickname || `사용자_${String(key).slice(0, 4)}`,
        totalSeconds: 0,
        streakDays: session.streakDays || 1
      });
    }
    const row = focusAggregation.get(key);
    row.totalSeconds += Number(session.durationSec || 0);
    row.streakDays = Math.max(row.streakDays, Number(session.streakDays || 1));
  });

  const rankingFromFirestore = Array.from(focusAggregation.values())
    .sort((a, b) => b.totalSeconds - a.totalSeconds)
    .slice(0, 10)
    .map((row) => ({
      id: row.id,
      nickname: row.nickname,
      todayFocus: formatTime(row.totalSeconds),
      streakDays: row.streakDays
    }));
  const focusRanking = rankingFromFirestore.length ? rankingFromFirestore : SAMPLE_FOCUS_RANKING;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayLogCountFromFirestore = projectLogs.filter((entry) => {
    if (!entry.createdAt?.toMillis) return false;
    return entry.createdAt.toMillis() >= todayStart.getTime();
  }).length;
  const projectCount = projectCards.length;
  const todayLogCount = todayLogCountFromFirestore || SAMPLE_PROJECTS.length * 2;
  const focusTimeText = formatTime(survivalTime);
  const recentLogsForEditor = (projectLogs.length ? projectLogs : [])
    .slice(0, 20)
    .map((log) => ({
      ...log,
      projectTitle: projectList.find((project) => project.id === log.projectId)?.title || '프로젝트'
    }));

  const handleSendProjectMessage = async ({ projectId, text, messageType }) => {
    if (!user || !projectId) return;
    const normalizedText = text.trim();
    if (!normalizedText) return;

    // 프로젝트별 기본 스레드를 생성/재사용해서 메시지를 기록한다.
    let thread = projectThreads.find((entry) => entry.projectId === projectId);
    if (!thread) {
      const created = await addDoc(collection(db, 'project_threads'), {
        projectId,
        title: '기본 스레드',
        createdBy: user.uid,
        lastMessageAt: serverTimestamp()
      });
      thread = { id: created.id, projectId };
    }

    await addDoc(collection(db, 'project_threads', thread.id, 'messages'), {
      projectId,
      authorUid: user.uid,
      authorNickname: profile?.nickname || '게스트',
      messageType,
      text: normalizedText,
      // 서버 키워드 검색을 위해 토큰 배열을 함께 저장한다.
      messageKeywords: Array.from(new Set(
        normalizedText
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 2)
      )).slice(0, 20),
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, 'project_threads', thread.id), {
      lastMessageAt: serverTimestamp()
    });
  };

  const handleCreateProject = async (payload) => {
    if (!user) throw new Error('로그인이 필요합니다.');
    const title = (payload.title || '').trim();
    if (!title) throw new Error('프로젝트 제목을 입력해 주세요.');

    const tags = (payload.tags || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    await addDoc(collection(db, 'projects'), {
      title,
      description: (payload.description || '').trim(),
      status: payload.status || '진행 중',
      tags,
      demoUrl: (payload.demoUrl || '').trim(),
      repoUrl: (payload.repoUrl || '').trim(),
      ownerUid: user.uid,
      members: [user.uid],
      updatedAt: serverTimestamp()
    });
  };

  const handleUpdateProject = async (projectId, payload) => {
    if (!user || !projectId) throw new Error('수정할 프로젝트를 선택해 주세요.');
    const title = (payload.title || '').trim();
    if (!title) throw new Error('프로젝트 제목을 입력해 주세요.');

    const tags = (payload.tags || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    await updateDoc(doc(db, 'projects', projectId), {
      title,
      description: (payload.description || '').trim(),
      status: payload.status || '진행 중',
      tags,
      demoUrl: (payload.demoUrl || '').trim(),
      repoUrl: (payload.repoUrl || '').trim(),
      updatedAt: serverTimestamp()
    });
  };

  const handleCreateProjectLog = async (payload) => {
    if (!user) throw new Error('로그인이 필요합니다.');
    const projectId = payload.projectId;
    const summary = (payload.summary || '').trim();
    if (!projectId) throw new Error('로그 대상 프로젝트를 선택해 주세요.');
    if (!summary) throw new Error('오늘 작업 내용을 입력해 주세요.');

    const links = (payload.links || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    await addDoc(collection(db, 'project_logs'), {
      projectId,
      authorUid: user.uid,
      authorNickname: profile?.nickname || '게스트',
      summary,
      retro: (payload.retro || '').trim(),
      links,
      logType: 'DAILY',
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, 'projects', projectId), {
      updatedAt: serverTimestamp()
    });
  };

  const handleUpdateProjectLog = async (logId, payload) => {
    if (!user || !logId) throw new Error('수정할 로그를 선택해 주세요.');
    const summary = (payload.summary || '').trim();
    if (!summary) throw new Error('수정할 작업 내용을 입력해 주세요.');

    const links = (payload.links || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    await updateDoc(doc(db, 'project_logs', logId), {
      summary,
      retro: (payload.retro || '').trim(),
      links
    });
  };

  const handleDeleteProjectLog = async (logId) => {
    if (!user || !logId) throw new Error('삭제할 로그를 선택해 주세요.');
    await deleteDoc(doc(db, 'project_logs', logId));
  };

  return (
    <div className="min-h-screen bg-white dark:bg-sentinel-dark-bg text-black dark:text-white selection:bg-sentinel-green selection:text-black antialiased transition-colors duration-500 font-sans text-left overflow-x-hidden shadow-sm">
      <WelcomeSplash user={user} visible={showSplash} />
      <InitializingScreen visible={showInitializing} />
      
      {(!isActive || isTerminated) && (
        <div className="fixed inset-0 z-[200] bg-white/95 dark:bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 text-center shadow-2xl shadow-xl">
          <div className="max-w-md w-full space-y-6 rounded-[32px] border border-sentinel-green/15 bg-white/80 p-8 font-sans text-center shadow-2xl dark:bg-[#050505]/90">
            <div className={`w-24 h-24 rounded-3xl mx-auto flex items-center justify-center shadow-2xl rotate-12 ${isTerminated ? 'bg-red-500 shadow-red-500/20' : 'bg-sentinel-green shadow-sentinel-green/20 shadow-xl shadow-xl shadow-sm shadow-sm shadow-sm'}`}>
              <span className="text-4xl drop-shadow-xl shadow-sm">!</span>
            </div>
            <div className="text-center shadow-sm">
              <p className="mb-3 text-[11px] font-sans font-bold uppercase tracking-[0.28em] text-sentinel-green">
                {isTerminated ? '규칙 04' : '규칙 03'}
              </p>
              <h2 className="text-3xl font-sans font-bold mb-2 tracking-[-0.03em] text-black dark:text-white drop-shadow-sm shadow-xl shadow-xl shadow-sm shadow-sm shadow-sm">
                {isTerminated ? '세션 종료됨' : '다른 세션이 실행 중입니다'}
              </h2>
              <p className="text-gray-400 font-sans text-[12px] leading-relaxed whitespace-pre-line font-medium opacity-90 shadow-sm">
                {isTerminated 
                  ? '관리자 명령으로 현재 세션이 종료되었습니다.'
                  : '다른 탭에서 이미 활성 세션이 실행 중입니다.\n이 탭을 계속 사용하려면 아래 버튼으로 세션을 가져오세요.'}
              </p>
            </div>
            {!isTerminated && (
              <button 
                onClick={resumeHere}
                className="w-full py-4 bg-black dark:bg-sentinel-green dark:text-black text-white font-sans font-bold text-sm tracking-[0.08em] rounded-2xl hover:scale-[1.02] transition-all shadow-lg hover:shadow-sentinel-green/20 shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm"
              >
                이 탭에서 계속하기
              </button>
            )}
          </div>
        </div>
      )}

      <header className="fixed top-0 left-0 w-full z-[100] px-6 py-4 flex justify-between items-center pointer-events-none shadow-sm shadow-sm">
        <div className="pointer-events-auto shadow-sm">
          <div className="bg-black dark:bg-sentinel-green text-sentinel-green dark:text-black font-mono font-black px-4 py-2 rounded-xl text-xs uppercase tracking-tighter italic shadow-2xl shadow-xl font-headline tracking-tight shadow-sm text-left shadow-sm">
            센티넬 v2.4
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-3 shadow-xl shadow-xl shadow-sm shadow-sm">
          <button 
            onClick={() => setIsUpdateNoteOpen(true)}
            className="px-4 py-2 text-gray-400 font-sans font-black text-[10px] uppercase tracking-widest hover:text-sentinel-green transition-all font-bold shadow-sm text-center"
          >
            📋 업데이트 내역
          </button>
          <button 
            onClick={() => setIsSponsorshipOpen(true)}
            className="px-4 py-2 rounded-xl border border-sentinel-green/50 text-sentinel-green font-sans font-black text-[10px] uppercase tracking-widest hover:bg-sentinel-green hover:text-black transition-all shadow-xl font-headline shadow-inner shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm text-center shadow-xl shadow-xl shadow-xl flex items-center gap-1.5"
          >
            <span className="text-sm animate-pulse">🫶</span>
            후원하기
          </button>
          <ThemeToggle />
          <button 
            onClick={() => setIsGuideOpen(true)}
            className="p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-sentinel-green/20 transition-all group shadow-sm text-black dark:text-white font-black text-sm shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm text-center shadow-xl shadow-xl shadow-xl shadow-xl"
          >
            ?
          </button>
          <button 
            onClick={() => setIsProfileOpen(true)}
            className="p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-sentinel-green/20 transition-all group shadow-sm"
          >
            <span className="text-sentinel-green text-lg">👤</span>
          </button>
        </div>
      </header>

      {user ? (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: !showNicknameModal ? 0.3 : 0 }}
          className="max-w-7xl mx-auto px-4 pt-24 pb-12 space-y-5"
        >
          <section className="rounded-3xl border border-sentinel-green/20 bg-black/10 dark:bg-sentinel-dark-card p-6 shadow-[0_0_24px_rgba(0,255,148,0.08)]">
            <h2 className="text-3xl md:text-4xl font-black text-black dark:text-white leading-tight tracking-tight">
              작업물을 공유하고 함께 발전시키는 <span className="text-sentinel-green">실시간 개발 공간</span>
            </h2>
            <p className="mt-3 text-base text-gray-600 dark:text-gray-300">
              채팅으로 지식을 나누고, 기록으로 성장 과정을 남기세요.
            </p>
            <p className="mt-1 text-sm text-sentinel-green/80">
              몰입 시간 랭킹으로 서로의 작업 리듬을 자극합니다.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              데이터 소스: {loungeDataReady && projects.length > 0 ? '실시간 Firestore' : '샘플 스캐폴딩'}
            </p>
          </section>

          <SummaryCards
            projectCount={projectCount}
            todayLogCount={todayLogCount}
            focusTimeText={focusTimeText}
          />

          <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch gap-4">
            <div ref={leftModulesRef} className="lg:col-span-8 space-y-4">
              <ProjectInputPanel
                projects={projectCards}
                logs={recentLogsForEditor}
                onCreateProject={handleCreateProject}
                onUpdateProject={handleUpdateProject}
                onCreateLog={handleCreateProjectLog}
                onUpdateLog={handleUpdateProjectLog}
                onDeleteLog={handleDeleteProjectLog}
              />
              <ProjectBoardPanel projects={projectCards} />
              <FocusAidPanel />
              <FocusRankingPanel ranking={focusRanking} />
            </div>
            <div
              className="lg:col-span-4 min-h-0"
              style={
                module04Height
                  ? { height: `${module04Height}px`, maxHeight: 'calc(100vh - 120px)' }
                  : { maxHeight: 'calc(100vh - 120px)' }
              }
            >
              <ProjectChatPanel
                projects={projectCards}
                messages={chatMessages}
                onSendMessage={handleSendProjectMessage}
                searchState={chatQueryState}
                onSearchStateChange={setChatQueryState}
              />
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-sentinel-green/10 dark:from-sentinel-green/5 via-transparent to-transparent relative font-sans text-center overflow-x-hidden text-center text-center text-center text-center text-center text-center text-center shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-sm shadow-sm shadow-sm shadow-sm">
          <div className="max-w-md w-full bg-white dark:bg-sentinel-dark-card border border-gray-100 dark:border-sentinel-green/10 rounded-[48px] shadow-2xl p-12 text-center relative overflow-hidden shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm shadow-sm shadow-sm shadow-sm">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-sentinel-green shadow-[0_0_15px_rgba(0,255,148,0.5)] shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm shadow-sm shadow-sm"></div>
            <div className="w-24 h-24 bg-black dark:bg-sentinel-green rounded-[32px] mx-auto flex items-center justify-center mb-10 shadow-2xl rotate-6 transition-transform hover:rotate-12 duration-500 shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm">
              <span className="text-4xl dark:grayscale drop-shadow-xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm">!</span>
            </div>
            <h2 className="text-4xl font-mono font-black mb-4 uppercase italic tracking-tighter text-black dark:text-white italic tracking-tight font-headline shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm text-center shadow-sm">디지털 센티넬</h2>
            <p className="text-gray-500 dark:text-gray-400 font-sans text-base uppercase tracking-[0.3em] mb-12 leading-relaxed italic font-black opacity-80 text-center">접근 권한이 필요합니다<br/>보안 프로토콜을 초기화하세요</p>
            <button
              className="w-full py-5 bg-black dark:bg-sentinel-green dark:text-black hover:bg-sentinel-green dark:hover:bg-sentinel-green/80 text-white hover:text-black font-mono font-black text-sm rounded-[24px] transition-all duration-500 uppercase tracking-widest shadow-[0_10px_30px_rgba(0,0,0,0.1)] hover:shadow-sentinel-green/30 active:scale-95 font-headline shadow-lg shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm shadow-sm text-center shadow-xl shadow-xl shadow-xl"
              onClick={loginWithGoogle}
            >
              Google로 접속
            </button>
            <p className="mt-10 font-mono text-[9px] text-gray-300 dark:text-gray-600 uppercase tracking-[0.5em] font-black opacity-40 italic font-sans text-center text-center text-center text-center text-center text-center text-center text-center text-center font-medium opacity-40 italic font-medium opacity-40 italic font-medium opacity-40 italic font-medium opacity-40 italic font-medium opacity-40 italic font-medium opacity-40 italic shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm">SENTINEL_SYSTEM_V2.4</p>
          </div>
        </div>
      )}

      {showNicknameModal && !showInitializing && <NicknameModal />}
      {isAdmin && <AdminTerminal isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />}
      <ShortcutGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
      <DonationModal isOpen={isDonationOpen} onClose={() => setIsDonationOpen(false)} />
      <TossPaymentSimulator 
        isOpen={isSponsorshipOpen} 
        onClose={() => setIsSponsorshipOpen(false)}
        onDonationSuccess={handleDonationSuccessFlow}
      />
      <UpdateNoteModal isOpen={isUpdateNoteOpen} onClose={() => setIsUpdateNoteOpen(false)} />
      <ProfileModal 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)}
        onSuccessCallback={(msg) => {
          setSuccessMessage(msg);
          setTimeout(() => setSuccessMessage(''), 3000);
        }}
      />
      <DonationSuccessModal
        step={donationPopupStep}
        onConfirm={handleDonationPopupConfirm}
        onClose={handleDonationPopupClose}
      />
      <BonusToast pulse={bonusPulse} />
      <SuccessToast message={successMessage} visible={!!successMessage} />
    </div>
  );
}

export default App;

