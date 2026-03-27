import React, { useState, useEffect, useRef } from 'react';
import { useTimer } from './context/TimerContext';
import { useAuth } from './context/AuthContext';
import { db } from './firebase';
import { 
  collection, query, orderBy, limit, onSnapshot, 
  addDoc, serverTimestamp 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import AdminTerminal from './context/AdminTerminal';

import { loadTossPayments } from '@tosspayments/payment-sdk';

// --- Components ---

const SponsorshipModal = ({ isOpen, onClose }) => {
  const [amount, setAmount] = useState(5000);
  const [destination, setDestination] = useState('UNICEF');
  const { user, profile } = useAuth();

  if (!isOpen) return null;

  const destinations = [
    { id: 'UNICEF', name: '유니세프 (아동 구호)', icon: '💙' },
    { id: 'WWF', name: 'WWF (자연 보호)', icon: '🐼' },
    { id: 'DOCTORS', name: '국경없는의사회 (의료)', icon: '🏥' },
  ];

  const handleTossPayment = async () => {
    const clientKey = 'test_ck_D5akZ081ROnLz7V5vL7VrsW4u0yx';
    const tossPayments = await loadTossPayments(clientKey);

    try {
      await tossPayments.requestPayment('카드', {
        amount: amount,
        orderId: `don_${Math.random().toString(36).substring(2, 11)}`,
        orderName: 'Digital Sentinel 시스템 후원',
        customerName: profile?.nickname || 'Guest',
        successUrl: `${window.location.origin}?payment=success&amount=${amount}&to=${destination}`,
        failUrl: `${window.location.origin}?payment=fail`,
      });
    } catch (error) {
      console.error('Payment error:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 font-sans text-left" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full bg-white dark:bg-[#0A0A0A] border border-sentinel-green/20 p-8 rounded-[32px] shadow-2xl overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-sentinel-green/30"></div>
        <h2 className="text-xl font-mono font-black mb-2 uppercase italic text-sentinel-green italic font-headline tracking-tight">Sponsorship_Protocol</h2>
        <p className="text-gray-400 text-[10px] font-sans mb-8 uppercase tracking-[0.2em] font-black">시스템 유지 및 기부를 위한 후원</p>
        
        <div className="space-y-6 text-left">
          <div className="space-y-3">
            <p className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest px-1">Amount_Selection</p>
            <div className="grid grid-cols-3 gap-3">
              {[5000, 10000, 20000].map(amt => (
                <button 
                  key={amt}
                  onClick={() => setAmount(amt)}
                  className={`py-3 rounded-xl border font-mono font-bold text-xs transition-all ${
                    amount === amt ? 'bg-sentinel-green text-black border-sentinel-green shadow-[0_0_15px_rgba(0,255,148,0.3)]' : 'bg-transparent text-gray-500 border-white/10 hover:border-sentinel-green/50'
                  }`}
                >
                  ₩{amt.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest px-1">Donation_Destination</p>
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
            <span className="text-lg">💳</span> 토스 페이먼츠 결제
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
            <div className="relative flex justify-center text-[8px] uppercase font-mono text-gray-600 bg-white dark:bg-[#0A0A0A] px-2 tracking-[0.3em] font-bold">International Support</div>
          </div>

          <a 
            href="https://www.buymeacoffee.com/noguen" 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full py-4 bg-[#FFDD00] text-black font-mono font-black text-sm uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-2 font-sans shadow-lg font-bold"
          >
            <span className="text-lg">☕</span> Buy Me a Coffee
          </a>
        </div>

        <button onClick={onClose} className="mt-6 w-full py-3 text-gray-500 font-sans font-bold text-[10px] uppercase tracking-widest hover:text-white transition-colors text-center">취소</button>
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
        <span className="font-sans font-bold text-xs uppercase tracking-tighter">보너스 생존 시간 획득!</span>
      </div>
    </motion.div>
  );
};

const HallOfFame = () => {
  const [patrons, setPatrons] = useState([]);

  useEffect(() => {
    const q = query(collection(db, 'donations'), orderBy('amount', 'desc'), limit(5));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatrons(data);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-[40px] p-8 backdrop-blur-sm shadow-sm h-full font-sans text-left">
      <h3 className="font-mono text-[10px] text-sentinel-green uppercase tracking-[0.3em] italic font-black mb-6 font-headline">Honorable_Patrons</h3>
      <div className="space-y-4">
        {patrons.length > 0 ? (
          patrons.map((patron, i) => (
            <div key={patron.id} className="flex items-center justify-between p-4 rounded-2xl bg-sentinel-green/5 border border-sentinel-green/10 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-sentinel-green/30 group-hover:bg-sentinel-green transition-all"></div>
              <div className="flex items-center gap-4 text-left">
                <span className="font-mono font-black text-sentinel-green opacity-40">0{i+1}</span>
                <div>
                  <div className="font-sans font-bold text-sm text-black dark:text-white flex items-center gap-2">
                    {patron.nickname}
                    <span className="text-xs">🎖️</span>
                  </div>
                  <div className="font-sans text-[8px] text-gray-500 uppercase tracking-widest font-bold">명예로운 운영자</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-xs text-sentinel-green italic">₩{patron.amount.toLocaleString()}</div>
                <div className="font-mono text-[7px] text-gray-500 uppercase font-black">{patron.to || 'UNICEF'}</div>
              </div>
            </div>
          ))
        ) : (
          <div className="py-12 text-center text-gray-500 font-mono text-[10px] uppercase tracking-widest animate-pulse italic">명예로운 후원자를 기다립니다...</div>
        )}
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
        className="max-w-2xl w-full bg-white dark:bg-[#0A0A0A] border border-sentinel-green/20 p-8 rounded-[32px] shadow-2xl overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-sentinel-green/30"></div>
        <h2 className="text-xl font-mono font-black mb-6 uppercase italic text-sentinel-green border-b border-sentinel-green/10 pb-4 italic font-headline">기부 증서 (Rule 04)</h2>
        
        <div className="flex flex-col md:flex-row gap-8 items-center text-left">
          <div className="flex-1 space-y-4">
            <div className="p-6 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 shadow-inner">
              <p className="text-gray-400 font-sans text-[10px] uppercase tracking-widest mb-1 font-black">Total System Donation</p>
              <p className="text-2xl font-mono font-black text-black dark:text-white uppercase italic tracking-tighter text-left">총 기부금: <span className="text-sentinel-green">₩{totalDonation.toLocaleString()}</span></p>
            </div>
            <div className="space-y-3 text-left">
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-sans font-medium">
                모든 생존 기록과 여러분의 소중한 후원금은 시스템의 가상 기부금으로 환산됩니다. 
                축적된 기록은 분기별로 실제 사회 공헌 활동에 사용됩니다.
              </p>
              <div className="p-4 bg-sentinel-green/5 rounded-xl border border-sentinel-green/10 text-left">
                <p className="text-[11px] font-mono font-black text-sentinel-green uppercase tracking-tighter italic font-headline">
                  여러분의 후원금 중 50%인 ₩{(totalDonation * 0.5).toLocaleString()}이 기부되었습니다
                </p>
              </div>
            </div>
          </div>
          
          <div className="w-full md:w-64 aspect-[3/4] bg-black/10 dark:bg-white/5 rounded-2xl border border-dashed border-sentinel-green/20 flex items-center justify-center relative group overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-[url('https://api.placeholder.com/300/400')] bg-cover bg-center opacity-20 grayscale group-hover:grayscale-0 transition-all duration-700"></div>
            <span className="relative z-10 text-gray-500 font-mono text-[10px] uppercase tracking-widest text-center px-4 group-hover:text-sentinel-green transition-colors font-black">CERTIFICATE_IMAGE_V2.4</span>
            <div className="absolute inset-0 bg-sentinel-green/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"></div>
          </div>
        </div>

        <button onClick={onClose} className="mt-8 w-full py-4 bg-black dark:bg-sentinel-green dark:text-black text-white font-mono font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-sentinel-green hover:text-black transition-all shadow-xl font-headline">확인 및 복귀</button>
      </motion.div>
    </div>
  );
};

const LiveDot = () => (
  <div className="flex items-center gap-2 px-2 py-1 bg-black/5 dark:bg-white/5 rounded-full border border-black/5 dark:border-sentinel-green/10">
    <div className="pulsing-green">
      <span className="relative inline-flex rounded-full h-2 w-2 bg-sentinel-green"></span>
    </div>
    <span className="font-mono text-[8px] font-bold text-sentinel-green tracking-widest uppercase animate-pulse font-headline">Live</span>
  </div>
);

const TypingText = ({ text, className }) => {
  const [displayedText, setDisplayedText] = useState('');
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.substring(0, i));
      i++;
      if (i > text.length) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [text]);
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
      <div className="w-5 h-5 flex items-center justify-center">
        {isDark ? (
          <span className="text-sentinel-green text-sm">🌙</span>
        ) : (
          <span className="text-sentinel-green text-sm">☀️</span>
        )}
      </div>
    </button>
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
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
      {games.map((game, i) => (
        <div 
          key={i} 
          onClick={() => handleSimulateWin(game)}
          className="bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/10 p-5 rounded-3xl hover:border-sentinel-green/30 transition-all group cursor-pointer relative overflow-hidden shadow-sm active:scale-95 text-left"
        >
          <div className="absolute top-0 right-0 p-3 opacity-20 font-mono text-[10px] uppercase tracking-widest font-black">v1.0</div>
          <div className="text-2xl mb-3 group-hover:scale-110 transition-transform inline-block">{game.icon}</div>
          <h4 className="font-mono font-black text-sm text-black dark:text-white mb-1 uppercase tracking-tighter italic font-headline">{game.title}</h4>
          <p className="text-[10px] text-gray-500 font-sans uppercase tracking-widest leading-tight font-bold">{game.desc}</p>
          <div className="mt-4 flex items-center gap-1 text-sentinel-green/40 font-mono text-[8px] uppercase font-black group-hover:text-sentinel-green transition-colors">
            <span>Click to complete</span>
            <span className="animate-pulse">_</span>
          </div>
        </div>
      ))}
    </div>
  );
};

const ShortcutGuide = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 font-sans text-left" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full bg-white dark:bg-[#0A0A0A] border border-sentinel-green/20 p-8 rounded-[32px] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-mono font-black mb-6 uppercase italic text-sentinel-green border-b border-sentinel-green/10 pb-4 italic font-headline">시스템 단축키 안내</h2>
        <div className="space-y-4 font-mono text-sm">
          <div className="flex justify-between items-center text-black dark:text-white">
            <span className="text-gray-400 font-bold">명령어 터미널</span>
            <span className="bg-gray-100 dark:bg-white/10 px-3 py-1 rounded-lg border border-black/10 dark:border-white/10 font-black">Shift + Q</span>
          </div>
          <div className="flex justify-between items-center text-black dark:text-white">
            <span className="text-gray-400 font-bold">도움말</span>
            <span className="bg-gray-100 dark:bg-white/10 px-3 py-1 rounded-lg border border-black/10 dark:border-white/10 font-black">Shift + /</span>
          </div>
          <div className="flex justify-between items-center text-black dark:text-white">
            <span className="text-gray-400 font-bold">테마 전환</span>
            <span className="bg-gray-100 dark:bg-white/10 px-3 py-1 rounded-lg border border-black/10 dark:border-white/10 font-black">Shift + T</span>
          </div>
        </div>
        <button onClick={onClose} className="mt-8 w-full py-4 bg-black dark:bg-sentinel-green dark:text-black text-white font-mono font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-sentinel-green hover:text-black transition-all shadow-lg font-headline">시스템으로 복귀</button>
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
        className="max-w-md w-full bg-white dark:bg-sentinel-dark-card border border-sentinel-green/20 p-12 rounded-[40px] shadow-2xl relative overflow-hidden shadow-xl"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-sentinel-green/20"></div>
        <h2 className="text-3xl font-mono font-black mb-2 italic uppercase tracking-tighter text-black dark:text-white font-headline italic tracking-tight text-left">ID 초기화</h2>
        <p className="text-gray-400 text-[10px] font-sans mb-10 uppercase tracking-[0.2em] font-black text-left">운영자 코드 등록이 필요합니다</p>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="relative">
            <input 
              type="text" 
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="운영자_ID"
              className="w-full px-6 py-5 bg-black/5 dark:bg-black/40 border border-sentinel-green/10 rounded-2xl font-mono text-sm focus:ring-1 focus:ring-sentinel-green/50 outline-none text-black dark:text-white placeholder:text-gray-300 transition-all font-black shadow-inner"
              autoFocus
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-sentinel-green/20 rounded-full"></div>
          </div>
          {error && (
            <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl shadow-sm text-left">
              <p className="text-red-500 text-[10px] font-black font-sans uppercase tracking-widest leading-relaxed">오류: {error}</p>
            </div>
          )}
          <button 
            disabled={isSubmitting}
            className={`w-full bg-black dark:bg-sentinel-green dark:text-black text-sentinel-green font-mono font-black py-5 rounded-2xl hover:bg-sentinel-green hover:text-black transition-all uppercase tracking-[0.3em] text-xs shadow-lg ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''} font-headline`}
          >
            {isSubmitting ? '코드 등록 중...' : '프로토콜 배포'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const LeaderboardTable = () => {
  const { formatTime } = useTimer();
  const { user } = useAuth();
  const [competitors, setCompetitors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('survival_time', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setCompetitors(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, (error) => {
      console.error("Leaderboard Snapshot Error:", error);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-3xl overflow-hidden backdrop-blur-sm shadow-sm h-full font-sans text-left">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-sentinel-green/5 border-b border-sentinel-green/10">
            <th className="px-8 py-5 font-mono text-[10px] uppercase tracking-widest text-sentinel-green/60 font-black italic">순위</th>
            <th className="px-8 py-5 font-mono text-[10px] uppercase tracking-widest text-sentinel-green/60 font-black italic text-left">운영자</th>
            <th className="px-8 py-5 font-mono text-[10px] uppercase tracking-widest text-sentinel-green/60 text-center font-black italic">상태</th>
            <th className="px-8 py-5 font-mono text-[10px] uppercase tracking-widest text-sentinel-green/60 text-right font-black italic">생존 시간</th>
          </tr>
        </thead>
        <tbody className="relative min-h-[400px]">
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
                    className={`border-b border-sentinel-green/5 group transition-colors hover:bg-sentinel-green/5 dark:hover:bg-sentinel-green/10 shadow-sm ${isMe ? 'ring-1 ring-inset ring-sentinel-green/20' : ''}`}
                  >
                    <td className="px-8 py-6 font-mono font-black text-xl text-sentinel-green flex items-center gap-2 tracking-tighter">
                      {index === 0 ? <span className="text-2xl drop-shadow-lg">🥇</span> : `#${String(index + 1).padStart(2, '0')}`}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4 text-left">
                        <img src={comp.photoURL || 'https://via.placeholder.com/32'} className="w-8 h-8 rounded-full border border-sentinel-green/10 shadow-sm" />
                        <div>
                          <div className={`font-sans font-bold text-sm leading-none mb-1 ${isMe ? 'text-sentinel-green' : 'text-black dark:text-white'}`}>
                            {comp.nickname || 'Unknown'}
                            {isMe && <span className="ml-2 text-[10px] bg-sentinel-green/20 px-1.5 py-0.5 rounded uppercase tracking-tighter font-black">You</span>}
                          </div>
                          <div className="font-mono text-[8px] text-gray-400 uppercase tracking-widest font-black opacity-60 text-left">{comp.id.substring(0, 10)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest font-headline shadow-sm ${
                        comp.status === 'ONLINE' ? 'bg-sentinel-green/10 text-sentinel-green' : 'bg-gray-100 dark:bg-white/5 text-gray-400 opacity-50'
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${comp.status === 'ONLINE' ? 'bg-sentinel-green animate-pulse shadow-[0_0_5px_rgba(0,255,148,0.8)]' : 'bg-gray-400'}`}></span>
                        {comp.status === 'ONLINE' ? '실시간' : '오프라인'}
                      </span>
                    </td>
                    <td className={`px-8 py-6 text-right font-mono font-bold text-sm tracking-widest italic ${isMe ? 'text-sentinel-green scale-110' : 'text-black dark:text-white'}`}>
                      {formatTime(comp.survival_time || 0)}
                    </td>
                  </motion.tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="4" className="px-8 py-20 text-center">
                  <div className="font-mono text-sm text-gray-400 uppercase tracking-[0.3em] font-black shadow-sm text-center">
                    {loading ? '데이터 동기화 중...' : <TypingText text="생존자를 탐색 중입니다..." />}
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
  const scrollRef = useRef();

  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 100);
    }, (error) => {
      console.error("Chat Snapshot Error:", error);
    });
    return () => unsubscribe();
  }, []);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || !user) return;
    try {
      await addDoc(collection(db, 'messages'), {
        text: input, uid: user.uid, nickname: profile?.nickname || 'Guest',
        role: isAdmin ? 'ADMIN' : 'USER', timestamp: serverTimestamp()
      });
      setInput('');
    } catch (error) {
      console.error("Send Message Error:", error);
    }
  };

  return (
    <aside className="w-full lg:w-80 flex flex-col bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-3xl overflow-hidden h-full backdrop-blur-sm shadow-sm font-sans text-left text-left shadow-xl">
      <div className="p-6 border-b border-sentinel-green/10 bg-sentinel-green/5 flex items-center justify-between">
        <h3 className="font-mono font-black text-xs tracking-tighter flex items-center gap-2 uppercase italic text-sentinel-green font-headline tracking-tight">
          라이브 채널
        </h3>
        <LiveDot />
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide text-left">
        {messages.map(msg => (
          <div key={msg.id} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className={`font-mono text-[9px] font-black uppercase tracking-tighter ${msg.role === 'ADMIN' ? 'text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'text-sentinel-green'}`}>{msg.nickname}</span>
              <span className="font-mono text-[8px] text-gray-500 font-bold opacity-60 font-sans">{(msg.timestamp?.toMillis ? new Date(msg.timestamp.toMillis()) : new Date()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            <p className={`p-3 rounded-2xl text-xs leading-relaxed border font-sans font-black ${
              msg.role === 'ADMIN' ? 'bg-red-500/10 border-red-500/20 text-red-500 font-bold shadow-sm' : 'bg-black/20 dark:bg-black/40 border-sentinel-green/5 text-gray-700 dark:text-gray-300 shadow-sm'
            }`}>
              {msg.text}
            </p>
          </div>
        ))}
      </div>
      <div className="p-6 bg-sentinel-green/5 border-t border-sentinel-green/10">
        {user ? (
          <form onSubmit={sendMessage}>
            <input 
              value={input} onChange={e => setInput(e.target.value)}
              className="w-full bg-black/10 dark:bg-black/40 border border-sentinel-green/20 px-4 py-3 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-sentinel-green/50 transition-all font-mono text-black dark:text-white placeholder:text-gray-400 font-black shadow-inner"
              placeholder="시스템 통신 브로드캐스트..."
            />
          </form>
        ) : (
          <div className="text-center py-2 text-center">
            <p className="text-[10px] font-mono font-bold text-gray-500 uppercase tracking-widest mb-3 italic font-black opacity-60 font-sans">통신을 위해 권한이 필요합니다</p>
            <button onClick={() => window.scrollTo(0, 0)} className="w-full bg-black dark:bg-sentinel-green dark:text-black text-sentinel-green py-3 rounded-xl font-mono font-black text-[10px] uppercase border border-sentinel-green/20 hover:bg-sentinel-green hover:text-black transition-all shadow-lg font-headline">보안 엑세스</button>
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

  // 결제 결과 확인 및 기록
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('payment');
    const amount = urlParams.get('amount');
    const to = urlParams.get('to');

    if (status === 'success' && amount && user) {
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
          alert('기부 증서 발급 완료!');
          setIsDonationOpen(true);
        } catch (error) {
          console.error('Donation recording failed:', error);
        }
      };
      recordDonation();
    }
  }, [user, profile]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Shift + Q: 터미널
      if (e.shiftKey && e.key.toUpperCase() === 'Q' && isAdmin) {
        setIsTerminalOpen(p => !p);
      }
      // Shift + /: 도움말
      if (e.shiftKey && e.key === '?') {
        setIsGuideOpen(p => !p);
      }
      // 테마 토글 (Shift + T)
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

  return (
    <div className="min-h-screen bg-white dark:bg-sentinel-dark-bg text-black dark:text-white selection:bg-sentinel-green selection:text-black antialiased transition-colors duration-500 font-sans text-left overflow-x-hidden">
      {(!isActive || isTerminated) && (
        <div className="fixed inset-0 z-[200] bg-white/95 dark:bg-black/95 backdrop-blur-xl flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full space-y-8 font-sans text-center">
            <div className={`w-24 h-24 rounded-3xl mx-auto flex items-center justify-center shadow-2xl rotate-12 ${isTerminated ? 'bg-red-500 shadow-red-500/20' : 'bg-sentinel-green shadow-sentinel-green/20'}`}>
              <span className="text-4xl drop-shadow-xl">{isTerminated ? '🚫' : '⚠️'}</span>
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-mono font-black mb-2 tracking-tighter uppercase italic text-black dark:text-white font-headline drop-shadow-sm">
                {isTerminated ? '종료됨' : '이미 실행 중'}
              </h2>
              <p className="text-gray-400 font-sans text-[10px] uppercase tracking-widest leading-relaxed whitespace-pre-line font-black opacity-80 italic">
                {isTerminated 
                  ? '관리자 명령에 의해 세션이 강제 종료되었습니다.' 
                  : 'Rule-03 위반: 다른 탭에서 이미 실행 중입니다.\n이 탭에서 계속하려면 아래 버튼을 누르세요.'}
              </p>
            </div>
            {!isTerminated && (
              <button 
                onClick={resumeHere}
                className="w-full py-4 bg-black dark:bg-sentinel-green dark:text-black text-white font-mono font-black text-xs uppercase tracking-widest rounded-2xl hover:scale-[1.02] transition-all font-headline shadow-lg hover:shadow-sentinel-green/20 shadow-xl"
              >
                이 탭에서 계속하기
              </button>
            )}
          </div>
        </div>
      )}

      <header className="fixed top-0 left-0 w-full z-[100] px-6 py-4 flex justify-between items-center pointer-events-none">
        <div className="pointer-events-auto">
          <div className="bg-black dark:bg-sentinel-green text-sentinel-green dark:text-black font-mono font-black px-4 py-2 rounded-xl text-xs uppercase tracking-tighter italic shadow-2xl font-headline tracking-tight">
            Sentinel v2.4
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-3">
          <button 
            onClick={() => setIsSponsorshipOpen(true)}
            className="px-4 py-2 rounded-xl border border-sentinel-green/50 text-sentinel-green font-sans font-black text-[10px] uppercase tracking-widest hover:bg-sentinel-green hover:text-black transition-all shadow-xl font-headline shadow-inner"
          >
            후원하기
          </button>
          <ThemeToggle />
          <button 
            onClick={() => setIsGuideOpen(true)}
            className="p-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 hover:bg-sentinel-green/20 transition-all group shadow-sm text-black dark:text-white font-black text-sm shadow-xl"
          >
            ?
          </button>
        </div>
      </header>

      {user ? (
        <div className="max-w-7xl mx-auto px-4 pt-24 pb-12 grid grid-cols-1 lg:grid-cols-12 gap-8 min-h-screen text-left">
          {/* Left Column */}
          <div className="lg:col-span-8 space-y-8">
            {/* Modules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
              {/* Module 1: Status */}
              <div className="bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-[40px] p-8 backdrop-blur-sm relative overflow-hidden group shadow-sm transition-all hover:shadow-sentinel-green/5 text-left font-sans shadow-xl">
                <div className="flex justify-between items-start mb-6">
                  <h3 className="font-mono text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest italic font-black font-headline tracking-tight">Module_01: 시스템_상태</h3>
                  <LiveDot />
                </div>
                <h1 className="text-3xl font-mono font-black tracking-tighter uppercase italic text-black dark:text-white mb-2 font-headline italic">디지털 센티널</h1>
                <div className="flex flex-wrap items-center gap-4 text-left">
                  <p className="font-sans text-[10px] text-gray-500 uppercase tracking-widest font-black opacity-80">
                    오늘의 경쟁자: <span className="text-sentinel-green font-black">1,248명</span>
                  </p>
                  <div className="h-4 w-px bg-gray-200 dark:bg-white/10"></div>
                  <button 
                    onClick={() => setIsDonationOpen(true)}
                    className="font-sans text-[10px] text-sentinel-green hover:underline uppercase tracking-widest font-black italic font-headline"
                  >
                    기부 확인증
                  </button>
                </div>
                <div className="mt-8 flex gap-1.5 shadow-inner">
                  {[...Array(15)].map((_, i) => (
                    <div key={i} className={`h-1.5 w-full rounded-full transition-all duration-1000 ${i < 10 ? 'bg-sentinel-green shadow-[0_0_8px_rgba(0,255,148,0.5)]' : 'bg-gray-100 dark:bg-white/5'}`}></div>
                  ))}
                </div>
              </div>

              {/* Module 2: Survival Timer */}
              <div className="bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-[40px] p-8 backdrop-blur-sm relative shadow-sm hover:shadow-sentinel-green/5 transition-all text-left shadow-xl">
                <div className="flex justify-between items-start mb-6 font-sans">
                  <h3 className="font-mono text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest italic font-black font-headline tracking-tight text-left">Module_02: 생존_카운트</h3>
                  <LiveDot />
                </div>
                <div className="flex flex-col justify-center py-2 text-left">
                  <p className={`font-mono text-5xl font-black tracking-[0.2em] glow-green drop-shadow-2xl italic transition-all duration-300 ${bonusPulse ? 'text-white scale-110 shadow-[0_0_30px_rgba(0,255,148,0.6)]' : 'text-sentinel-green'}`}>
                    {formatTime(survivalTime)}
                  </p>
                  <p className="font-mono text-[8px] text-gray-400 dark:text-gray-500 mt-4 uppercase tracking-[0.2em] font-black font-sans italic opacity-60">10초마다 데이터 클라우드 동기화 중...</p>
                </div>
              </div>
            </div>

            {/* Module 3: Hall of Fame & Leaderboard (Swapped) */}
            <div className="space-y-4 text-left font-sans">
              <div className="flex items-center justify-between px-4 font-sans font-black">
                <h3 className="font-mono text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest italic font-black font-headline tracking-tight">Module_03: 실시간_데이터_센터</h3>
                <span className="font-mono text-[9px] text-sentinel-green/60 uppercase italic tracking-widest font-headline italic">NETWORK_ACTIVE</span>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-stretch">
                <div className="space-y-4 order-2 xl:order-1 h-full shadow-lg">
                  <p className="font-mono text-[8px] text-gray-500 uppercase px-2 tracking-widest font-black font-headline opacity-60 text-left">Patron_Hall_of_Fame</p>
                  <HallOfFame />
                </div>
                <div className="space-y-4 order-1 xl:order-2 h-full shadow-lg">
                  <p className="font-mono text-[8px] text-gray-500 uppercase px-2 tracking-widest font-black font-headline opacity-60 text-left">Live_Survival_Rank</p>
                  <LeaderboardTable />
                </div>
              </div>
            </div>

            {/* Minigame Hub */}
            <div className="pt-4 font-sans text-left">
              <div className="flex items-center justify-between px-4 mb-4">
                <h3 className="font-mono text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest italic font-black font-headline tracking-tight">Module_05: 미니게임_허브</h3>
              </div>
              <MinigameHub />
            </div>
          </div>

          {/* Right Column: Communication */}
          <div className="lg:col-span-4 h-full flex flex-col space-y-4 font-sans text-left">
            <div className="flex items-center justify-between px-2 text-left">
              <h3 className="font-mono text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest italic font-black font-headline tracking-tight">Module_04: 시스템_통신</h3>
              <span className="font-mono text-[9px] text-sentinel-green/60 uppercase italic font-headline tracking-widest opacity-60 italic">Secure Link Active</span>
            </div>
            <Chat />
          </div>
        </div>
      ) : (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-sentinel-green/10 dark:from-sentinel-green/5 via-transparent to-transparent relative font-sans text-center overflow-x-hidden">
          <div className="max-w-md w-full bg-white dark:bg-sentinel-dark-card border border-gray-100 dark:border-sentinel-green/10 rounded-[48px] shadow-2xl p-12 text-center relative overflow-hidden shadow-2xl">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-sentinel-green shadow-[0_0_15px_rgba(0,255,148,0.5)]"></div>
            <div className="w-24 h-24 bg-black dark:bg-sentinel-green rounded-[32px] mx-auto flex items-center justify-center mb-10 shadow-2xl rotate-6 transition-transform hover:rotate-12 duration-500 shadow-xl">
              <span className="text-4xl dark:grayscale drop-shadow-xl shadow-2xl">🛡️</span>
            </div>
            <h2 className="text-4xl font-mono font-black mb-4 uppercase italic tracking-tighter text-black dark:text-white italic tracking-tight font-headline">DIGITAL SENTINEL</h2>
            <p className="text-gray-500 dark:text-gray-400 font-sans text-[11px] uppercase tracking-[0.3em] mb-12 leading-relaxed italic font-black opacity-80 text-center">권한이 필요합니다<br/>보안 프로토콜 초기화 중</p>
            <button
              className="w-full py-5 bg-black dark:bg-sentinel-green dark:text-black hover:bg-sentinel-green dark:hover:bg-sentinel-green/80 text-white hover:text-black font-mono font-black text-sm rounded-[24px] transition-all duration-500 uppercase tracking-widest shadow-[0_10px_30px_rgba(0,0,0,0.1)] hover:shadow-sentinel-green/30 active:scale-95 font-headline"
              onClick={loginWithGoogle}
            >
              Google로 접속
            </button>
            <p className="mt-10 font-mono text-[9px] text-gray-300 dark:text-gray-600 uppercase tracking-[0.5em] font-black opacity-40 italic font-sans text-center">SENTINEL_SYSTEM_V2.4</p>
          </div>
        </div>
      )}

      {showNicknameModal && <NicknameModal />}
      {isAdmin && <AdminTerminal isOpen={isTerminalOpen} onClose={() => setIsTerminalOpen(false)} />}
      <ShortcutGuide isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
      <DonationModal isOpen={isDonationOpen} onClose={() => setIsDonationOpen(false)} />
      <SponsorshipModal isOpen={isSponsorshipOpen} onClose={() => setIsSponsorshipOpen(false)} />
      <BonusToast pulse={bonusPulse} />
    </div>
  );
}

export default App;
