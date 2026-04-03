import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getIdTokenResult, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

// 사용자 입력 길이는 이모지/복합 문자를 고려해 grapheme 단위로 계산한다.
const getCharacterLength = (value) => {
  if (!value) return 0;
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
    return [...segmenter.segment(value)].length;
  }
  return Array.from(value).length;
};

const adminUidAllowlist = (import.meta.env.VITE_ADMIN_UIDS || '')
  .split(',')
  .map((uid) => uid.trim())
  .filter(Boolean);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLoginPending, setIsLoginPending] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [isAdminClaim, setIsAdminClaim] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);

      if (!firebaseUser) {
        setUser(null);
        setProfile(null);
        setShowNicknameModal(false);
        setIsAdminClaim(false);
        setIsLoginPending(false);
        setLoading(false);
        return;
      }

      setUser(firebaseUser);

      try {
        // 관리자 판정은 profile.role이 아니라 인증 토큰 claim으로 확인한다.
        const tokenResult = await getIdTokenResult(firebaseUser, true);
        const isClaimAdmin = tokenResult?.claims?.admin === true;
        const isAllowlistAdmin = adminUidAllowlist.includes(firebaseUser.uid);
        setIsAdminClaim(isClaimAdmin || isAllowlistAdmin);

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
            last_nickname_change: null,
            created_at: serverTimestamp(),
          };

          await setDoc(userRef, initialData);
          setProfile(initialData);
          setShowNicknameModal(true);
        }
      } catch (error) {
        console.error('Auth init error:', error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    const userRef = doc(db, 'users', user.uid);
    const unsubscribeProfile = onSnapshot(
      userRef,
      (docSnap) => {
        if (!docSnap.exists()) return;
        const nextProfile = docSnap.data();
        setProfile(nextProfile);
        setShowNicknameModal(!nextProfile.nickname);
      },
      (error) => {
        console.error('Profile snapshot error:', error);
      }
    );

    return () => unsubscribeProfile();
  }, [user]);

  const loginWithGoogle = async () => {
    setAuthError('');
    setIsLoginPending(true);
    try {
      // 운영에서는 계정 선택을 강제해 계정 혼선을 줄인다.
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login error:', error);
      if (error?.code === 'auth/popup-closed-by-user') {
        setAuthError('로그인 창이 닫혀 인증이 취소되었습니다.');
      } else if (error?.code === 'auth/popup-blocked') {
        setAuthError('브라우저 팝업이 차단되었습니다. 팝업 허용 후 다시 시도해 주세요.');
      } else if (error?.code === 'auth/cancelled-popup-request') {
        setAuthError('이전 로그인 요청이 취소되었습니다. 다시 시도해 주세요.');
      } else {
        setAuthError('Google 로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      setIsLoginPending(false);
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

    // 제어문자/줄바꿈은 금지하고, 이모지/특수문자는 허용한다.
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

    // UX 지연을 줄이기 위해 낙관적 업데이트를 먼저 반영한다.
    const previousProfile = profile;
    const optimisticProfile = {
      ...(profile || {}),
      uid: user.uid,
      email: user.email,
      photoURL: profile?.photoURL || user.photoURL,
      nickname: normalizedNickname,
      last_nickname_change: now
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
          last_nickname_change: serverTimestamp()
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

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      isLoginPending,
      authError,
      loginWithGoogle,
      logout,
      updateNickname,
      showNicknameModal,
      setShowNicknameModal,
      isAdmin: isAdminClaim
    }),
    [user, profile, loading, isLoginPending, authError, showNicknameModal, isAdminClaim]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
