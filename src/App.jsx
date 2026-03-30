import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTimer } from './context/TimerContext';
import { useAuth } from './context/AuthContext';
import { db } from './firebase';
import { 
  collection, query, orderBy, limit, onSnapshot, 
  addDoc, serverTimestamp, getCountFromServer, where
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import AdminTerminal from './context/AdminTerminal';

import { loadTossPayments } from '@tosspayments/payment-sdk';

const DEMO_PATRONS = [
  { id: 'demo_patron_admin', nickname: 'Admin', amount: 500000, to: 'UNICEF', badge: 'FOUNDING' },
  { id: 'demo_patron_fan', nickname: 'AhnYujinFan', amount: 300000, to: 'WWF', badge: 'VIP' },
  { id: 'demo_patron_operator', nickname: 'NightShiftObserver', amount: 150000, to: 'DOCTORS', badge: 'CORE' },
];

// --- Components ---

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
    { category: 'SECURITY', title: 'Rule 03 session detection', desc: 'Only one active tab can own the timer at a time.' },
    { category: 'FEATURE', title: 'Minigame bonus sync', desc: 'Bonus time now lands in the survival timer immediately.' },
    { category: 'UI/UX', title: 'Layout and typography pass', desc: 'Live channel, donation surfaces, and Noto Sans KR alignment were refined.' },
    { category: 'PAYMENT', title: 'Donation certificate refresh', desc: 'Total donation and the 50 percent shared donation copy are now presentation-ready.' },
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
        <h2 className="text-2xl font-mono font-black mb-2 uppercase italic text-sentinel-green font-headline italic tracking-tight">시스템 업데이트 노트</h2>
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
        <h2 className="text-xl font-mono font-black mb-2 uppercase italic text-sentinel-green font-headline tracking-tight">Profile_Settings</h2>
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
            <div className="relative flex justify-center text-[10px] uppercase font-mono text-gray-500 bg-white dark:bg-[#0A0A0A] px-2">or</div>
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
const SponsorshipModal = ({ isOpen, onClose, onDonationSuccess }) => {
  const [amount, setAmount] = useState(5000);
  const [destination, setDestination] = useState('UNICEF');
  const { user, profile } = useAuth();

  if (!isOpen) return null;

  const destinations = [
    { id: 'UNICEF', name: '유니세프 (아동 구호)', icon: 'U' },
    { id: 'WWF', name: 'WWF (환경 보호)', icon: 'W' },
    { id: 'DOCTORS', name: '국경없는의사회 (의료)', icon: 'D' },
  ];

  const handleTossPayment = async () => {
    const clientKey = 'test_ck_D5akZ081ROnLz7V5vL7VrsW4u0yx';
    const tossPayments = await loadTossPayments(clientKey);

    try {
      await tossPayments.requestPayment('카드', {
        amount: amount,
        orderId: `don_${Math.random().toString(36).substring(2, 11)}`,
        orderName: '디지털 센티널 시스템 후원',
        customerName: profile?.nickname || 'Guest',
        successUrl: `${window.location.origin}?payment=success&amount=${amount}&to=${destination}`,
        failUrl: `${window.location.origin}?payment=fail`,
      });
    } catch (error) {
      console.error('Payment error:', error);
    }
  };

  const handleVirtualDonation = async () => {
    if (!user) {
      alert('로그인이 필요합니다. 상단의 Google 로그인 버튼을 눌러주세요.');
      return;
    }
    
    if (!profile?.nickname) {
      alert('먼저 별명을 설정해주세요.');
      return;
    }

    try {
      await addDoc(collection(db, 'donations'), {
        uid: user.uid,
        nickname: profile.nickname,
        photoURL: profile.photoURL || user.photoURL,
        amount: amount,
        to: destination,
        timestamp: serverTimestamp()
      });
      onClose();
      onDonationSuccess?.();
    } catch (error) {
      console.error('Virtual donation error:', error);
      alert(`가상 후원 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 font-sans text-left" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-[#0A0A0A] border border-sentinel-green/20 p-8 rounded-[32px] shadow-2xl overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-sentinel-green/30"></div>
        <h2 className="text-xl font-mono font-black mb-2 uppercase italic text-sentinel-green italic font-headline tracking-tight">Sponsorship_Protocol</h2>
        <p className="text-gray-400 text-[10px] font-sans mb-8 uppercase tracking-[0.2em] font-black">시스템 유지 및 기부를 위한 후원</p>
        
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest px-1">후원 금액 선택</p>
            <div className="grid grid-cols-3 gap-3">
              {[5000, 10000, 20000].map(amt => (
                <button 
                  key={amt}
                  onClick={() => setAmount(amt)}
                  className={`py-3 rounded-xl border font-mono font-bold text-xs transition-all ${
                    amount === amt ? 'bg-sentinel-green text-black border-sentinel-green shadow-[0_0_15px_rgba(0,255,148,0.3)]' : 'bg-transparent text-gray-500 border-white/10 hover:border-sentinel-green/50'
                  }`}
                >
                  KRW {amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest px-1">기부 대상 선택</p>
            <div className="space-y-2">
              {destinations.map(dest => (
                <button
                  key={dest.id}
                  onClick={() => setDestination(dest.id)}
                  className={`w-full p-4 rounded-2xl border text-left flex items-center gap-4 transition-all ${
                    destination === dest.id ? 'bg-sentinel-green/10 border-sentinel-green' : 'bg-black/5 dark:bg-white/5 border-transparent hover:border-sentinel-green/30'
                  }`}
                >
                  <span className="text-xl">{dest.icon}</span>
                  <span className="font-sans font-bold text-xs text-black dark:text-white">{dest.name}</span>
                  {destination === dest.id && <div className="ml-auto w-2 h-2 bg-sentinel-green rounded-full animate-pulse"></div>}
                </button>
              ))}
            </div>
          </div>

          <button 
            onClick={handleTossPayment}
            className="w-full py-4 bg-[#0064FF] text-white font-mono font-black text-sm uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <span className="text-lg">TP</span> 토스페이 결제
          </button>

          <button 
            onClick={handleVirtualDonation}
            className="w-full py-4 bg-sentinel-green text-black font-mono font-black text-sm uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <span className="text-lg">SIM</span> 가상 후원 테스트
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5 shadow-sm"></div></div>
            <div className="relative flex justify-center text-[8px] uppercase font-mono text-gray-600 bg-white dark:bg-[#0A0A0A] px-2 tracking-[0.3em] font-bold">International Support</div>
          </div>

          <a 
            href="https://www.buymeacoffee.com/noguen" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full py-4 bg-[#FFDD00] text-black font-mono font-black text-sm uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-2 font-sans shadow-lg font-bold"
          >
            <span className="text-lg">COF</span> Buy Me a Coffee
          </a>
        </div>

        <button onClick={onClose} className="mt-6 w-full py-3 text-gray-500 font-sans font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors text-center">닫기</button>
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
    if (!user?.uid) {
      setIsPatron(false);
      return;
    }

    const eligibilityQuery = query(
      collection(db, 'donations'),
      where('uid', '==', user.uid),
      limit(1)
    );

    const unsubscribe = onSnapshot(eligibilityQuery, (snapshot) => {
      setIsPatron(!snapshot.empty);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!isPatron) {
      setPatrons([]);
      return;
    }

    const q = query(collection(db, 'donations'), orderBy('amount', 'desc'), limit(5));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatrons(data);
    });
    return () => unsubscribe();
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
    const q = query(collection(db, 'donations'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let total = 0;
      snapshot.forEach(doc => total += (doc.data().amount || 0));
      setTotalDonation(total);
    });
    return () => unsubscribe();
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
  const { addBonusTime } = useTimer();
  const games = [
    { title: '메모리 핵', icon: '🧠', desc: '데이터 조각 일치시키기', baseScore: 100 },
    { title: '그리드 런', icon: '🏃', desc: '패턴 장애물 회피', baseScore: 150 },
    { title: '비트 탭', icon: '⚡', desc: '주파수 동기화 챌린지', baseScore: 200 }
  ];

  const handleSimulateWin = (game) => {
    const score = game.baseScore + Math.floor(Math.random() * 50);
    addBonusTime(score);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 text-left">
      {games.map((game, i) => (
        <div 
          key={i} 
          onClick={() => handleSimulateWin(game)}
          className="monitoring-panel-sm bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/10 p-5 rounded-3xl hover:border-sentinel-green/30 transition-all group cursor-pointer relative overflow-hidden shadow-glow-green dark:shadow-glow-green-lg active:scale-95 text-left"
        >
          <div className="absolute top-0 right-0 p-3 opacity-20 font-mono text-[10px] uppercase tracking-widest font-black shadow-sm text-right">v1.0</div>
          <div className="text-2xl mb-3 group-hover:scale-110 transition-transform inline-block shadow-sm"> {game.icon}</div>
          <h4 className="font-mono font-black text-base text-black dark:text-white mb-1 uppercase tracking-tighter italic font-headline text-left">{game.title}</h4>
          <p className="text-xs text-gray-500 font-sans uppercase tracking-widest leading-tight font-bold text-left">{game.desc}</p>
          <div className="mt-4 flex items-center gap-1 text-sentinel-green/40 font-mono text-[8px] uppercase font-black group-hover:text-sentinel-green transition-colors text-left shadow-sm">
            <span>Click to complete</span>
            <span className="animate-pulse shadow-sm">_</span>
          </div>
        </div>
      ))}
    </div>
  );
};

// Mock competitor data generator
const generateMockCompetitors = () => {
  const mockNames = [
    'CipherFox',
    'NeonRiver',
    'OrbitZero',
    'SignalBloom',
    'VectorLime',
    'NightRelay',
    'StaticWave',
    'EchoFrame'
  ];
  
  const mockData = [];
  for (let i = 0; i < 6; i++) {
    const baseTime = Math.random() * 86400000; // 0 to 24 hours in ms
    const variance = Math.random() * 7200000; // 0 to 2 hours variance
    mockData.push({
      id: `mock_${i}`,
      nickname: mockNames[i % mockNames.length],
      photoURL: `https://i.pravatar.cc/32?img=${Math.floor(Math.random() * 70) + 1}`,
      survival_time: baseTime + variance,
      status: Math.random() > 0.3 ? 'ONLINE' : 'OFFLINE'
    });
  }
  return mockData.sort((a, b) => b.survival_time - a.survival_time);
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
        <div className="space-y-4 font-mono text-sm text-left">
          <div className="flex justify-between items-center text-black dark:text-white">
            <span className="text-gray-400 font-bold text-left">명령어 터미널</span>
            <span className="bg-gray-100 dark:bg-white/10 px-3 py-1 rounded-lg border border-black/10 dark:border-white/10 font-black shadow-sm text-right">Shift + Q</span>
          </div>
          <div className="flex justify-between items-center text-black dark:text-white text-left">
            <span className="text-gray-400 font-bold text-left">도움말</span>
            <span className="bg-gray-100 dark:bg-white/10 px-3 py-1 rounded-lg border border-black/10 dark:border-white/10 font-black shadow-sm text-right">Shift + /</span>
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
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // 기존 리스너 정리
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    // 실시간 순위 업데이트 리스너
    const setupLeaderboardListener = () => {
      try {
        const q = query(collection(db, 'users'), orderBy('survival_time', 'desc'));
        unsubscribeRef.current = onSnapshot(q, (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          // 데이터가 없으면 모의 데이터 사용
          if (data.length === 0) {
            if (!mockDataRef.current) {
              mockDataRef.current = generateMockCompetitors();
            }
            setCompetitors(mockDataRef.current.slice(0, maxRank));
            setUseMockData(true);
          } else {
            mockDataRef.current = null;
            setCompetitors(data.slice(0, maxRank));
            setUseMockData(false);
          }
          
          // 사용자 순위 업데이트 (콜백은 useCallback으로 메모이제이션됨)
          if (user && onRankUpdate) {
            const index = data.findIndex(u => u.id === user.uid);
            onRankUpdate(index !== -1 ? index + 1 : 'PENDING...', data.length);
          }
          
          setLoading(false);
          setError(null);
        }, (error) => {
          console.error("Leaderboard Snapshot Error:", error);
          // Quota exceeded 에러 처리
          if (error.code === 'resource-exhausted' || error.message?.includes('429')) {
            setError('데이터 로드 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
            setLoading(false);
            // 5초 후 재시도
            setTimeout(() => setupLeaderboardListener(), 5000);
          } else {
            setError('데이터를 불러올 수 없습니다.');
            setLoading(false);
          }
        });
      } catch (err) {
        console.error("Setup Leaderboard Listener Error:", err);
        setError('시스템 오류가 발생했습니다.');
        setLoading(false);
      }
    };

    setupLeaderboardListener();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [user]); // user만 의존성으로 설정

  return (
    <div className="monitoring-panel bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-3xl overflow-hidden backdrop-blur-sm shadow-glow-green dark:shadow-glow-green-lg h-full font-sans text-left flex flex-col">
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
      <table className="w-full text-left border-collapse shadow-sm flex-1 overflow-auto">
        <thead>
          <tr className="bg-sentinel-green/5 border-b border-sentinel-green/10 shadow-sm">
            <th className="px-4 py-4 font-mono text-[11px] whitespace-nowrap uppercase tracking-widest text-sentinel-green/60 font-black italic shadow-sm text-left">순위</th>
            <th className="px-4 py-4 font-mono text-[11px] whitespace-nowrap uppercase tracking-widest text-sentinel-green/60 font-black italic text-left shadow-sm">Nickname</th>
            <th className="px-4 py-4 font-mono text-[11px] whitespace-nowrap uppercase tracking-widest text-sentinel-green/60 text-center font-black italic shadow-sm">상태</th>
            <th className="px-4 py-4 font-mono text-[11px] whitespace-nowrap uppercase tracking-widest text-sentinel-green/60 text-right font-black italic shadow-sm">생존 시간</th>
          </tr>
        </thead>
        <tbody className="relative min-h-[200px] text-left">
          <AnimatePresence mode="popLayout">
            {competitors.length > 0 ? (
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
                    className={`border-b border-sentinel-green/5 group transition-colors hover:bg-sentinel-green/5 dark:hover:bg-sentinel-green/10 shadow-sm ${isMe ? 'ring-1 ring-inset ring-sentinel-green/20 shadow-[0_0_15px_rgba(0,255,148,0.05)]' : ''} shadow-sm`}
                  >
                    <td className="px-4 py-4 font-mono font-black text-lg text-sentinel-green flex items-center gap-2 tracking-tighter shadow-sm text-left">
                      {index === 0 ? <span className="text-xl drop-shadow-lg shadow-sm">🥇</span> : `#${String(index + 1).padStart(2, '0')}`}
                    </td>
                    <td className="px-4 py-4 shadow-sm">
                      <div className="flex items-center gap-3 text-left shadow-sm">
                        <img src={comp.photoURL || 'https://via.placeholder.com/32'} className="w-7 h-7 rounded-full border border-sentinel-green/10 shadow-sm shadow-xl shadow-sm" />
                        <div className="text-left">
                          <div className={`font-sans font-bold text-sm leading-none mb-0.5 text-left shadow-sm ${isMe ? 'text-sentinel-green font-black' : 'text-black dark:text-white'}`}>
                            {comp.nickname || 'Unknown'}
                            {isMe && <span className="ml-2 text-[9px] bg-sentinel-green/20 px-1.5 py-0.5 rounded uppercase tracking-tighter font-black font-sans shadow-sm">나</span>}
                          </div>
                          <div className="font-mono text-[7px] text-gray-400 uppercase tracking-widest font-black opacity-60 text-left shadow-sm">{comp.id.substring(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center shadow-sm text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest font-headline shadow-sm shadow-xl ${
                        comp.status === 'ONLINE' ? 'bg-sentinel-green/10 text-sentinel-green shadow-[0_0_10px_rgba(0,255,148,0.1)] shadow-sm' : 'bg-gray-100 dark:bg-white/5 text-gray-400 opacity-50 shadow-sm'
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${comp.status === 'ONLINE' ? 'bg-sentinel-green animate-pulse shadow-[0_0_5px_rgba(0,255,148,0.8)] shadow-sm' : 'bg-gray-400 shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm'}`}></span>
                        {comp.status === 'ONLINE' ? '온라인' : '오프라인'}
                      </span>
                    </td>
                    <td className={`px-4 py-4 text-right font-mono font-bold text-sm tracking-widest italic shadow-sm text-right ${isMe ? 'text-sentinel-green drop-shadow-[0_0_8px_rgba(0,255,148,0.4)] shadow-sm' : 'text-black dark:text-white shadow-sm'}`}>
                      {formatTime(comp.survival_time || 0)}
                    </td>
                  </motion.tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="4" className="px-8 py-20 text-center shadow-sm">
                  <div className="font-mono text-base text-gray-400 uppercase tracking-[0.3em] font-black shadow-sm text-center shadow-sm font-sans">
                    {loading ? "데이터 로딩 중..." : <TypingText text="생존자를 탐색 중입니다..." className="font-sans text-base" />}
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
  const scrollRef = useRef(null);
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !user) return;

    // Anti-Spam: 동일한 메시지 연속 전송 방지
    const trimmedInput = input.trim();
    const now = Date.now();
    
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
    <aside className="monitoring-panel w-full h-full flex min-h-0 flex-1 flex-col bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-3xl overflow-hidden backdrop-blur-sm shadow-glow-green dark:shadow-glow-green-lg font-sans text-left">
      <div className="p-6 border-b border-sentinel-green/10 bg-sentinel-green/5 flex items-center justify-between shadow-sm shadow-xl shadow-sm">
        <h3 className="font-sans font-black text-xs tracking-widest flex items-center gap-2 uppercase italic text-sentinel-green font-headline tracking-tight text-left">
          라이브 채널
        </h3>
        <LiveDot />
      </div>
      <div ref={scrollRef} className="chat-scroll-area min-h-0 flex-1 overflow-y-auto px-6 pt-6 pb-2 space-y-4 text-left shadow-inner">
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
        <div className={`px-6 py-2 border-t font-sans font-medium text-center text-xs animate-pulse ${
          spamWarning 
            ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400' 
            : 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
        }`}>
          {spamWarning || chatError}
        </div>
      )}
      <div className="shrink-0 p-6 bg-sentinel-green/5 border-t border-sentinel-green/10 backdrop-blur-md shadow-xl shadow-sm">
        {user ? (
          <form onSubmit={sendMessage} className="flex gap-2">
            <input 
              value={input} onChange={e => setInput(e.target.value)}
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
            <p className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest mb-3 italic font-black opacity-60 font-sans text-center">메시지를 보내려면 로그인이 필요합니다.</p>
            <button onClick={() => window.scrollTo(0, 0)} className="w-full bg-black dark:bg-sentinel-green dark:text-black text-sentinel-green py-3 rounded-xl font-mono font-black text-[10px] uppercase border border-sentinel-green/20 hover:bg-sentinel-green hover:text-black transition-all shadow-lg font-headline shadow-xl text-center shadow-xl">로그인하러 가기</button>
          </div>
        )}
      </div>
    </aside>
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

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const coll = collection(db, 'users');
        const snapshot = await getCountFromServer(coll);
        setCompetitorStats(prev => ({ ...prev, count: snapshot.data().count }));
      } catch (error) {
        console.error("Fetch stats error:", error);
      }
    };
    fetchStats();
  }, []);

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
  // 결제 결과 확인 및 기록
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('payment');
    const amount = urlParams.get('amount');
    const to = urlParams.get('to');

    if (status === 'success' && amount && user && !paymentHandledRef.current) {
      paymentHandledRef.current = true;
      const recordDonation = async () => {
        try {
          await addDoc(collection(db, 'donations'), {
            uid: user.uid,
            nickname: profile?.nickname || 'Anonymous',
            amount: parseInt(amount),
            to: to || 'UNICEF',
            timestamp: serverTimestamp()
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
  }, [user, profile]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Shift + Q: admin terminal
      if (e.shiftKey && e.key.toUpperCase() === 'Q' && isAdmin) {
        setIsTerminalOpen(p => !p);
      }

      // Shift + /: shortcut guide
      if (e.shiftKey && e.key === '?') {
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
                {isTerminated ? 'Rule 04' : 'Rule 03'}
              </p>
              <h2 className="text-3xl font-sans font-bold mb-2 tracking-[-0.03em] text-black dark:text-white drop-shadow-sm shadow-xl shadow-xl shadow-sm shadow-sm shadow-sm">
                {isTerminated ? 'Session Terminated' : 'Another Session Detected'}
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
            Sentinel v2.4
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-3 shadow-xl shadow-xl shadow-sm shadow-sm">
          <button 
            onClick={() => setIsUpdateNoteOpen(true)}
            className="px-4 py-2 text-gray-400 font-sans font-black text-[10px] uppercase tracking-widest hover:text-sentinel-green transition-all font-bold shadow-sm text-center"
          >
            업데이트 노트
          </button>
          <button 
            onClick={() => setIsSponsorshipOpen(true)}
            className="px-4 py-2 rounded-xl border border-sentinel-green/50 text-sentinel-green font-sans font-black text-[10px] uppercase tracking-widest hover:bg-sentinel-green hover:text-black transition-all shadow-xl font-headline shadow-inner shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm text-center shadow-xl shadow-xl shadow-xl"
          >
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
          className="max-w-7xl mx-auto px-4 pt-24 pb-12 grid grid-cols-1 lg:grid-cols-12 items-stretch gap-6 min-h-screen text-left text-left text-left text-left shadow-sm"
        >
          {/* Left Column: Leaderboard (5위) + Minigame Hub */}
          <div ref={leftModulesRef} className="lg:col-span-8 flex flex-col self-stretch text-left text-left shadow-sm gap-0">
            {/* Module 3: Live Leaderboard (Top 5 Only) */}
            <div className="space-y-2 text-left font-sans text-left text-left text-left text-left shadow-sm flex-shrink-0">
              <div className="flex items-center justify-between px-4 font-sans font-black font-sans font-black font-sans font-black font-sans font-black shadow-sm shadow-sm shadow-sm shadow-sm">
                <h3 className="module-header-text text-gray-400 dark:text-gray-500 text-left shadow-sm shadow-sm shadow-sm">Module_03: 실시간_순위</h3>
                <span className="font-sans text-[9px] text-sentinel-green/60 uppercase italic tracking-widest font-headline italic italic italic italic italic italic shadow-sm shadow-sm shadow-sm text-right shadow-sm shadow-sm shadow-sm shadow-sm">TOP 5</span>
              </div>
              <LeaderboardTable onRankUpdate={handleRankUpdate} maxRank={5} />
            </div>

            {/* Module 5: Minigame Hub (Flex-grow) */}
            <div className="flex-1 flex flex-col min-h-0 font-sans text-left text-left text-left text-left text-left shadow-sm shadow-sm shadow-sm shadow-sm pt-3">
              <div className="flex items-center justify-between px-4 mb-2 flex-shrink-0 shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm">
                <h3 className="module-header-text text-gray-400 dark:text-gray-500 text-left shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm">Module_05: 미니게임_허브</h3>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <MinigameHub />
              </div>
            </div>
          </div>

          {/* Right Column: Communication */}
          <div
            className="lg:col-span-4 h-full flex min-h-0 self-stretch flex-col space-y-2 overflow-hidden font-sans text-left text-left text-left text-left text-left text-left shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm shadow-sm shadow-sm"
            style={module04Height ? { height: `${module04Height}px`, maxHeight: `${module04Height}px` } : undefined}
          >
            <div className="flex items-center justify-between px-2 text-left text-left text-left text-left text-left text-left text-left text-left shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm">
              <h3 className="module-header-text text-gray-400 dark:text-gray-500 text-left shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm">Module_04: 시스템_통신</h3>
              <span className="font-sans text-[9px] text-sentinel-green/60 uppercase italic font-headline tracking-widest opacity-60 italic italic italic italic italic italic italic italic shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm text-right shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm">보안 링크 활성</span>
            </div>
            <Chat />
          </div>
        </motion.div>
      ) : (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-sentinel-green/10 dark:from-sentinel-green/5 via-transparent to-transparent relative font-sans text-center overflow-x-hidden text-center text-center text-center text-center text-center text-center text-center shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-sm shadow-sm shadow-sm shadow-sm">
          <div className="max-w-md w-full bg-white dark:bg-sentinel-dark-card border border-gray-100 dark:border-sentinel-green/10 rounded-[48px] shadow-2xl p-12 text-center relative overflow-hidden shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm shadow-sm shadow-sm shadow-sm">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-sentinel-green shadow-[0_0_15px_rgba(0,255,148,0.5)] shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm shadow-sm shadow-sm"></div>
            <div className="w-24 h-24 bg-black dark:bg-sentinel-green rounded-[32px] mx-auto flex items-center justify-center mb-10 shadow-2xl rotate-6 transition-transform hover:rotate-12 duration-500 shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-xl shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm">
              <span className="text-4xl dark:grayscale drop-shadow-xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-2xl shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm">!</span>
            </div>
            <h2 className="text-4xl font-mono font-black mb-4 uppercase italic tracking-tighter text-black dark:text-white italic tracking-tight font-headline shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm shadow-sm text-center shadow-sm">DIGITAL SENTINEL</h2>
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
      <SponsorshipModal 
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

