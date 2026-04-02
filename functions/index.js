import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';

initializeApp();

const db = getFirestore();

// CORS 허용 출처 목록: 환경변수 없으면 GitHub Pages/localhost 기본 허용
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.length > 0) return allowedOrigins.includes(origin);
  return /localhost|127\.0\.0\.1|github\.io$/i.test(origin);
};

const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin || '';
  if (isAllowedOrigin(origin)) {
    res.set('Access-Control-Allow-Origin', origin || '*');
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
};

// 요청 헤더의 Firebase ID 토큰을 검증하고 uid를 반환
const getVerifiedUser = async (authorizationHeader) => {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED');
  }
  const idToken = authorizationHeader.replace('Bearer ', '');
  const decoded = await getAuth().verifyIdToken(idToken);
  return decoded;
};

// 실제 결제는 서버에서 Toss confirm API를 검증한 뒤 후원 기록을 생성
export const verifyTossPayment = onRequest({ region: 'asia-northeast3' }, async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  try {
    const user = await getVerifiedUser(req.headers.authorization || '');
    const { paymentKey, orderId, amount, to, mode } = req.body || {};

    // mode=SIMULATED는 발표/개발 테스트용으로 서버가 기록만 대행
    if (mode === 'SIMULATED') {
      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        res.status(400).json({ ok: false, message: 'Invalid amount' });
        return;
      }
      await db.collection('donations').add({
        uid: user.uid,
        nickname: user.name || 'User',
        amount: Number(amount),
        to: to || 'DIGITAL_SENTINEL',
        source: 'SIMULATED',
        timestamp: FieldValue.serverTimestamp()
      });
      res.status(200).json({ ok: true, source: 'SIMULATED' });
      return;
    }

    // 실결제 검증: paymentKey/orderId/amount 필수
    if (!paymentKey || !orderId || !Number.isFinite(Number(amount))) {
      res.status(400).json({ ok: false, message: 'Missing payment payload' });
      return;
    }

    const tossSecretKey = process.env.TOSS_SECRET_KEY;
    if (!tossSecretKey) {
      res.status(500).json({ ok: false, message: 'TOSS_SECRET_KEY is not configured' });
      return;
    }

    const authToken = Buffer.from(`${tossSecretKey}:`).toString('base64');
    const confirmResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount: Number(amount)
      })
    });

    if (!confirmResponse.ok) {
      const errorBody = await confirmResponse.text();
      res.status(400).json({ ok: false, message: 'Toss payment verification failed', detail: errorBody });
      return;
    }

    const payment = await confirmResponse.json();
    await db.collection('donations').add({
      uid: user.uid,
      nickname: user.name || 'User',
      amount: Number(payment.totalAmount || amount),
      to: to || 'UNICEF',
      source: 'TOSS',
      orderId,
      paymentKey,
      timestamp: FieldValue.serverTimestamp()
    });

    res.status(200).json({ ok: true, source: 'TOSS', approvedAt: payment.approvedAt || null });
  } catch (error) {
    if (error.message === 'UNAUTHORIZED') {
      res.status(401).json({ ok: false, message: 'Unauthorized' });
      return;
    }
    console.error('verifyTossPayment error:', error);
    res.status(500).json({ ok: false, message: 'Internal server error' });
  }
});
