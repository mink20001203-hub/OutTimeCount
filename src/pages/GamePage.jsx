import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTimer } from '../context/TimerContext';

const GamePage = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const { addBonusTime } = useTimer();
  const [score, setScore] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);

  const gameConfig = {
    'memory-hack': {
      title: '메모리 핵',
      icon: '🧠',
      desc: '데이터 조각 일치시키기',
      baseScore: 100,
      difficulty: 'MEDIUM',
      instructions: '화면에 나타나는 패턴을 기억하고 클릭하세요.'
    },
    'grid-run': {
      title: '그리드 런',
      icon: '🏃',
      desc: '패턴 장애물 회피',
      baseScore: 150,
      difficulty: 'HARD',
      instructions: '그리드에서 장애물을 피하고 목표에 도달하세요.'
    },
    'beat-tap': {
      title: '비트 탭',
      icon: '⚡',
      desc: '주파수 동기화 챌린지',
      baseScore: 200,
      difficulty: 'INSANE',
      instructions: '음악의 비트에 맞춰 버튼을 탭하세요.'
    }
  };

  const game = gameConfig[gameId] || gameConfig['memory-hack'];

  const handleStartGame = () => {
    setGameStarted(true);
    setScore(0);
    setGameEnded(false);

    // 게임 시뮬레이션 (5초 후 종료)
    setTimeout(() => {
      const finalScore = game.baseScore + Math.floor(Math.random() * 100);
      setScore(finalScore);
      setGameEnded(true);
    }, 5000);
  };

  const handleEndGame = () => {
    if (score > 0) {
      addBonusTime(score);
    }
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-white dark:bg-sentinel-dark-bg text-black dark:text-white p-6 flex flex-col items-center justify-center overflow-x-hidden">
      <header className="fixed top-0 left-0 w-full z-[100] px-6 py-4 flex justify-between items-center">
        <button
          onClick={() => navigate('/')}
          className="bg-black dark:bg-sentinel-green text-sentinel-green dark:text-black font-mono font-black px-4 py-2 rounded-xl text-xs uppercase tracking-tighter italic"
        >
          ← 돌아가기
        </button>
        <div className="bg-black dark:bg-sentinel-green text-sentinel-green dark:text-black font-mono font-black px-4 py-2 rounded-xl text-xs uppercase tracking-tighter italic">
          Sentinel v2.4 - Minigame
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full bg-black/5 dark:bg-sentinel-dark-card border border-sentinel-green/20 rounded-3xl p-8 text-center mt-24"
      >
        <div className="text-6xl mb-4">{game.icon}</div>
        <h1 className="text-3xl font-mono font-black mb-2 uppercase italic tracking-tight">{game.title}</h1>
        <p className="text-sentinel-green text-sm font-mono uppercase tracking-widest mb-2">{game.desc}</p>
        <div className="inline-block px-3 py-1 bg-sentinel-green/10 border border-sentinel-green/20 rounded-full mb-6">
          <span className="text-xs font-mono font-black text-sentinel-green uppercase">{game.difficulty}</span>
        </div>

        {!gameStarted ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-6"
          >
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{game.instructions}</p>
            <div className="p-6 bg-sentinel-green/5 border border-sentinel-green/20 rounded-2xl">
              <p className="text-xs text-gray-500 font-sans uppercase tracking-widest mb-2">획득 가능 보너스</p>
              <p className="text-4xl font-mono font-black text-sentinel-green">+{game.baseScore}</p>
              <p className="text-xs text-gray-400 font-sans uppercase tracking-widest mt-2">생존 시간</p>
            </div>
            <button
              onClick={handleStartGame}
              className="w-full py-4 bg-black dark:bg-sentinel-green dark:text-black text-white font-mono font-black text-sm uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all"
            >
              게임 시작
            </button>
          </motion.div>
        ) : !gameEnded ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="text-center">
              <p className="text-xs text-gray-500 font-sans uppercase tracking-widest mb-2">게임 진행 중...</p>
              <div className="inline-block p-6 bg-sentinel-green/10 border border-sentinel-green/20 rounded-2xl">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                  className="w-12 h-12 border-4 border-sentinel-green/30 border-t-sentinel-green rounded-full mx-auto"
                />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <div className="text-center">
              <p className="text-xs text-gray-500 font-sans uppercase tracking-widest mb-2">게임 완료!</p>
              <div className="p-8 bg-sentinel-green/10 border border-sentinel-green/20 rounded-2xl mb-6">
                <p className="text-xs text-gray-400 font-sans uppercase tracking-widest mb-2">최종 점수</p>
                <p className="text-5xl font-mono font-black text-sentinel-green">{score}</p>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                축하합니다! <span className="font-mono font-black text-sentinel-green">+{score}</span> 생존 시간을 획득했습니다.
              </p>
            </div>
            <button
              onClick={handleEndGame}
              className="w-full py-4 bg-black dark:bg-sentinel-green dark:text-black text-white font-mono font-black text-sm uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all"
            >
              대시보드로 돌아가기
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default GamePage;
