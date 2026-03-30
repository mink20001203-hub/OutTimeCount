import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, googleProvider, db } from '../firebase';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNicknameModal, setShowNicknameModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userRef);

          if (userDoc.exists()) {
            const data = userDoc.data();
            setProfile(data);
            if (!data.nickname) setShowNicknameModal(true);
          } else {
            const initialData = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              nickname: '',
              photoURL: firebaseUser.photoURL,
              survival_time: 0,
              status: 'ONLINE',
              role: 'USER',
              last_nickname_change: null,
              created_at: serverTimestamp()
            };
            await setDoc(userRef, initialData);
            setProfile(initialData);
            setShowNicknameModal(true);
          }
        } catch (error) {
          console.error("Firestore Access Error:", error);
          // 데이터베이스 연결 실패 시 사용자 알림 로직 (선택적)
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time profile listener
  useEffect(() => {
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data());
      }
    });
    return () => unsubscribe();
  }, [user]);

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login Error:", error);
    }
  };

  const logout = () => signOut(auth);

  const updateNickname = async (newNickname) => {
    if (!user) {
      throw new Error("로그인이 필요합니다.");
    }
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000; // 24시간
    const lastChange = profile?.last_nickname_change?.toMillis ? profile.last_nickname_change.toMillis() : (profile?.last_nickname_change || 0);

    if (lastChange && (now - lastChange < cooldown)) {
      const remaining = Math.ceil((cooldown - (now - lastChange)) / (60 * 60 * 1000));
      throw new Error(`별명은 24시간마다 변경 가능합니다. (${remaining}시간 남음)`);
    }

    const nicknameRegex = /^[a-zA-Z0-9_가-힣]{2,12}$/;
    if (!nicknameRegex.test(newNickname)) {
      throw new Error("별명은 2~12자 한글, 영문, 숫자, 언더바(_)만 가능합니다.");
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        nickname: newNickname,
        last_nickname_change: serverTimestamp()
      });
      
      // Immediately update local profile
      setProfile(prev => ({ 
        ...prev, 
        nickname: newNickname,
        last_nickname_change: now 
      }));
      
      // Close nickname modal
      setShowNicknameModal(false);
      
      console.log("✅ Nickname updated successfully:", newNickname);
    } catch (error) {
      console.error("❌ Nickname update error:", error);
      throw new Error(`별명 변경 실패: ${error.message}`);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, profile, loading, loginWithGoogle, logout, 
      updateNickname, showNicknameModal, setShowNicknameModal,
      isAdmin: profile?.role === 'ADMIN'
    }}>
      {children}
    </AuthContext.Provider>
  );
};
