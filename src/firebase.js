import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL
};

// 필수 설정 확인
if (!firebaseConfig.projectId || firebaseConfig.projectId === "YOUR_PROJECT") {
  console.error("Firebase Project ID is missing. Please check your .env file (VITE_FIREBASE_PROJECT_ID).");
}

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Firestore 초기화 (캐시 및 에러 처리 강화)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache()
});

export const rtdb = getDatabase(app);

// 연결 상태 감시 (선택적)
export const checkDbConnection = async () => {
  try {
    // 헬스체크용 간단한 호출
    const { getDoc, doc } = await import("firebase/firestore");
    await getDoc(doc(db, "system", "health"));
    return true;
  } catch (error) {
    console.error("Firestore Connection Error:", error);
    if (error.code === 'failed-precondition') {
      // 다중 탭 등의 이슈
    } else if (error.code === 'permission-denied') {
      // 권한 이슈
    }
    return false;
  }
};
