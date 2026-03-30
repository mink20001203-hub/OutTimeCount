import React, { createContext, useContext, useEffect, useState } from 'react';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const getCharacterLength = (value) => {
  if (!value) return 0;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
    return [...segmenter.segment(value)].length;
  }
  return Array.from(value).length;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNicknameModal, setShowNicknameModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);

      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setShowNicknameModal(false);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfile(data);
          setShowNicknameModal(!data.nickname);
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
            created_at: serverTimestamp(),
          };

          await setDoc(userRef, initialData);
          setProfile(initialData);
          setShowNicknameModal(true);
        }
      } catch (error) {
        console.error('Firestore Access Error:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    // 프로필 실시간 리스너 - 중복 리스너 방지
    const userRef = doc(db, 'users', user.uid);
    let unsubscribeSnapshot = null;

    const setupProfileListener = () => {
      try {
        unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
          if (!docSnap.exists()) return;

          const nextProfile = docSnap.data();
          setProfile(nextProfile);
          setShowNicknameModal(!nextProfile.nickname);
        }, (error) => {
          console.error('Profile Snapshot Error:', error);
          // Quota exceeded 에러 시 5초 후 재시도
          if (error.code === 'resource-exhausted' || error.message?.includes('429')) {
            setTimeout(() => setupProfileListener(), 5000);
          }
        });
      } catch (err) {
        console.error('Setup Profile Listener Error:', err);
      }
    };

    setupProfileListener();

    return () => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, [user?.uid]);

  const loginWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login Error:', error);
    }
  };

  const logout = () => signOut(auth);

  const updateNickname = async (newNickname) => {
    if (!user) {
      throw new Error('로그인이 필요합니다.');
    }

    const normalizedNickname = String(newNickname || '').trim();
    if (!normalizedNickname) {
      throw new Error('별명을 입력해주세요.');
    }

    if (/[\r\n\t]/.test(normalizedNickname)) {
      throw new Error('줄바꿈 또는 제어문자는 사용할 수 없습니다.');
    }

    const charLength = getCharacterLength(normalizedNickname);
    if (charLength < 2 || charLength > 12) {
      throw new Error('별명은 2자 이상 12자 이하로 설정해주세요.');
    }

    const now = Date.now();
    const cooldownMs = 24 * 60 * 60 * 1000;
    const lastChangeMs = profile?.last_nickname_change?.toMillis
      ? profile.last_nickname_change.toMillis()
      : Number(profile?.last_nickname_change || 0);

    if (lastChangeMs && now - lastChangeMs < cooldownMs) {
      const remainingHours = Math.ceil((cooldownMs - (now - lastChangeMs)) / (60 * 60 * 1000));
      throw new Error(`별명은 24시간마다 변경할 수 있습니다. (${remainingHours}시간 남음)`);
    }

    if (normalizedNickname === profile?.nickname) {
      setShowNicknameModal(false);
      return normalizedNickname;
    }

    const previousProfile = profile;
    const optimisticProfile = {
      ...(profile || {}),
      uid: user.uid,
      email: user.email,
      photoURL: profile?.photoURL || user.photoURL,
      nickname: normalizedNickname,
      last_nickname_change: now,
    };

    setProfile(optimisticProfile);
    setShowNicknameModal(false);

    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(
        userRef,
        {
          uid: optimisticProfile.uid,
          email: optimisticProfile.email,
          photoURL: optimisticProfile.photoURL,
          nickname: normalizedNickname,
          last_nickname_change: serverTimestamp(),
        },
        { merge: true }
      );

      return normalizedNickname;
    } catch (error) {
      setProfile(previousProfile || null);
      setShowNicknameModal(!(previousProfile?.nickname));
      console.error('Nickname update error:', error);
      throw new Error(`별명 변경에 실패했습니다: ${error.message}`);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        loginWithGoogle,
        logout,
        updateNickname,
        showNicknameModal,
        setShowNicknameModal,
        isAdmin: profile?.role === 'ADMIN',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
