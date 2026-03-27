import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { 
  collection, query, orderBy, limit, onSnapshot, 
  addDoc, serverTimestamp, updateDoc, doc, getDocs, 
  writeBatch 
} from 'firebase/firestore';
import { useAuth } from './AuthContext';

const AdminTerminal = ({ isOpen, onClose }) => {
  const { isAdmin } = useAuth();
  const [logs, setLogs] = useState([
    { type: 'SYSTEM', text: 'SENTINEL SECURITY SYSTEM INITIALIZED' },
    { type: 'SYSTEM', text: 'ADMIN TERMINAL READY. WAITING FOR COMMAND...' }
  ]);
  const [input, setInput] = useState('');
  const logEndRef = useRef(null);
  const inputRef = useRef(null);

  const addLog = (type, text) => {
    setLogs(prev => [...prev.slice(-49), { type, text, time: new Date().toLocaleTimeString() }]);
  };

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // 실시간 사용자 접속 감지 로그
  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, 'users'), orderBy('last_updated', 'desc'), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          addLog('INFO', `User_${data.uid.substring(0, 5)} Sync: ${data.nickname || 'Unknown'}`);
        }
      });
    });
    return () => unsubscribe();
  }, [isAdmin]);

  const executeCommand = async (e) => {
    e.preventDefault();
    if (!input.trim() || !isAdmin) return;

    const cmd = input.trim();
    addLog('INPUT', `admin@sentinel:~$ ${cmd}`);
    setInput('');

    try {
      // 1. reset --midnight
      if (cmd === 'reset --midnight') {
        const batch = writeBatch(db);
        const usersSnapshot = await getDocs(collection(db, 'users'));
        usersSnapshot.forEach((userDoc) => {
          batch.update(doc(db, 'users', userDoc.id), { 
            survival_time: 0,
            status: 'ONLINE' 
          });
        });
        await batch.commit();
        addLog('SUCCESS', 'All survival timers reset to 0 (UTC+0 Protocol)');
      } 
      // 2. broadcast --msg "[내용]"
      else if (cmd.startsWith('broadcast --msg')) {
        const msg = cmd.match(/"([^"]+)"/)?.[1] || cmd.split('--msg ')[1];
        if (msg) {
          await addDoc(collection(db, 'messages'), {
            text: msg,
            uid: 'admin_broadcast',
            nickname: 'SYSTEM ADMIN',
            role: 'ADMIN',
            timestamp: serverTimestamp()
          });
          addLog('SUCCESS', `Broadcast message sent: ${msg}`);
        }
      } 
      // 3. terminate --user [ID]
      else if (cmd.startsWith('terminate --user')) {
        const targetId = cmd.split('--user ')[1];
        if (targetId) {
          await updateDoc(doc(db, 'users', targetId), {
            status: 'OFFLINE_TERMINATED'
          });
          addLog('ALERT', `Session for user ${targetId} has been terminated.`);
        }
      } 
      else if (cmd === 'clear') {
        setLogs([]);
      }
      else {
        addLog('ERROR', `Unknown command: ${cmd.split(' ')[0]}`);
      }
    } catch (err) {
      addLog('ERROR', `Execution failed: ${err.message}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-md flex items-center justify-center p-10 font-mono"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl h-[600px] bg-[#0A0A0A] border border-gray-800 shadow-2xl flex flex-col rounded-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-[#1A1A1A] px-4 py-2 border-b border-gray-800 flex justify-between items-center">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Sentinel-OS Terminal v1.0.4</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-1 text-sm scrollbar-hide">
          {logs.map((log, i) => (
            <div key={i} className={`flex gap-3 ${
              log.type === 'ERROR' ? 'text-red-500' : 
              log.type === 'ALERT' ? 'text-yellow-500' : 
              log.type === 'SUCCESS' ? 'text-sentinel-green' : 
              log.type === 'INPUT' ? 'text-white' : 'text-[#00FF94]/60'
            }`}>
              {log.time && <span className="opacity-40">[{log.time}]</span>}
              <span className="font-bold">[{log.type}]</span>
              <span>{log.text}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        <form onSubmit={executeCommand} className="p-4 bg-[#111] border-t border-gray-800 flex items-center gap-3">
          <span className="text-sentinel-green font-bold">admin@sentinel:~$</span>
          <input 
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-white focus:ring-0 placeholder-gray-700"
            placeholder="enter command (reset, broadcast, terminate, clear)..."
          />
        </form>
      </div>
    </div>
  );
};

export default AdminTerminal;
