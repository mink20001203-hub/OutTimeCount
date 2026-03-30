# Digital Sentinel v2.4.0 - Future Roadmap

## Next Phase Development Plan

### 1. Real-time Statistics Synchronization (MODULE_01 Enhancement)

**Current Issue:**
- "오늘의 경쟁자 수" (Competitor Count)
- "나의 현재 순위" (My Current Rank)
- 현재 단순 텍스트로만 표시되며 초기 로드 시에만 업데이트

**Proposed Implementation:**

```javascript
// Real-time listener for database statistics
useEffect(() => {
  // 1. Competitors count: Real-time onSnapshot
  const q = query(collection(db, 'users'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    setCompetitorStats(prev => ({
      ...prev,
      count: snapshot.size
    }));
  });
  
  // 2. My rank: Real-time calculation
  const rankQ = query(
    collection(db, 'users'),
    orderBy('survival_time', 'desc')
  );
  const rankUnsubscribe = onSnapshot(rankQ, (snapshot) => {
    const myRank = snapshot.docs.findIndex(doc => doc.id === user?.uid) + 1;
    setCompetitorStats(prev => ({
      ...prev,
      myRank: myRank || 'PENDING...'
    }));
  });
  
  return () => {
    unsubscribe();
    rankUnsubscribe();
  };
}, [user]);
```

**Benefits:**
- ✅ Real-time rank updates (no page refresh needed)
- ✅ Dynamic competitor count monitoring
- ✅ Instant feedback on ranking changes

---

### 2. Real-time Donation Sum Animation (기부 증서 Enhancement)

**Current Issue:**
- `DonationModal`에서 총 기부금이 정적으로 표시됨
- 새로운 기부 발생 시 자동 갱신 안 됨

**Proposed Implementation:**

```javascript
// Add to DonationModal component
const [totalDonation, setTotalDonation] = useState(0);
const [displayedDonation, setDisplayedDonation] = useState(0);

useEffect(() => {
  if (!isOpen) return;
  
  // Real-time listener
  const q = query(collection(db, 'donations'));
  const unsubscribe = onSnapshot(q, (snapshot) => {
    let total = 0;
    snapshot.forEach(doc => total += (doc.data().amount || 0));
    
    // Animate number increase
    animateDonationCount(displayedDonation, total);
    setTotalDonation(total);
  });
  
  return () => unsubscribe();
}, [isOpen]);

// Number animation function
const animateDonationCount = (start, end) => {
  const duration = 1000; // 1 second animation
  const startTime = Date.now();
  
  const animate = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const current = Math.floor(start + (end - start) * progress);
    setDisplayedDonation(current);
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };
  
  requestAnimationFrame(animate);
};
```

**UI Enhancement:**
```jsx
<motion.div 
  key={totalDonation}
  initial={{ scale: 1 }}
  animate={{ scale: 1.1 }}
  transition={{ type: "spring", stiffness: 300 }}
  className="text-sentinel-green font-black"
>
  ₩{displayedDonation.toLocaleString()}
</motion.div>
```

**Benefits:**
- ✅ Real-time donation tracking
- ✅ Satisfying number increment animation
- ✅ Visual feedback on contribution impact

---

### 3. Admin Panel Activation (관리자 권한 강화)

**Proposed Features:**

#### 3.1 Midnight Auto-Reset Function

```javascript
// In AdminTerminal.jsx
const performMidnightReset = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Reset all users' daily stats
  const usersRef = collection(db, 'users');
  const q = query(usersRef);
  const snapshot = await getDocs(q);
  
  const batch = writeBatch(db);
  snapshot.forEach(doc => {
    batch.update(doc.ref, {
      daily_survival_time: 0,
      last_reset: serverTimestamp()
    });
  });
  
  await batch.commit();
  console.log('Midnight reset completed');
};

// Schedule for daily execution
useEffect(() => {
  const now = new Date();
  const tonight = new Date(now);
  tonight.setHours(24, 0, 0, 0);
  
  const timeUntilMidnight = tonight - now;
  const timeout = setTimeout(() => {
    performMidnightReset();
    // Set interval for daily execution
    setInterval(performMidnightReset, 24 * 60 * 60 * 1000);
  }, timeUntilMidnight);
  
  return () => clearTimeout(timeout);
}, []);
```

#### 3.2 Force Terminate User Session

```javascript
const forceTerminateUser = async (userId) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, {
    is_terminated: true,
    terminated_at: serverTimestamp(),
    termination_reason: 'Admin forced termination'
  });
};

// UI for admin panel
<div className="space-y-4">
  <h3 className="font-bold">User Management</h3>
  {users.map(user => (
    <div key={user.id} className="flex justify-between items-center p-3 bg-gray-100 rounded">
      <span>{user.nickname}</span>
      <button 
        onClick={() => forceTerminateUser(user.id)}
        className="px-3 py-1 bg-red-500 text-white rounded text-sm"
      >
        Force Terminate
      </button>
    </div>
  ))}
</div>
```

#### 3.3 Admin Dashboard Statistics

```javascript
// Real-time admin statistics
const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDonations: 0,
    averageSurvivalTime: 0,
    onlineCount: 0
  });

  useEffect(() => {
    // Users
    onSnapshot(collection(db, 'users'), snap => {
      setStats(prev => ({
        ...prev,
        totalUsers: snap.size,
        onlineCount: snap.docs.filter(d => d.data().status === 'ONLINE').length
      }));
    });

    // Donations
    onSnapshot(collection(db, 'donations'), snap => {
      let total = 0;
      snap.forEach(doc => total += doc.data().amount || 0);
      setStats(prev => ({ ...prev, totalDonations: total }));
    });
  }, []);

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard label="Total Users" value={stats.totalUsers} />
      <StatCard label="Online Now" value={stats.onlineCount} />
      <StatCard label="Total Donations" value={`₩${stats.totalDonations.toLocaleString()}`} />
      <StatCard label="Avg Survival Time" value={formatTime(stats.averageSurvivalTime)} />
    </div>
  );
};
```

**Benefits:**
- ✅ Automated daily system maintenance
- ✅ Admin control over user sessions
- ✅ Real-time monitoring dashboard

---

## Implementation Priority

1. **High Priority**: Real-time statistics (quick wins, improves UX)
2. **Medium Priority**: Donation animation (visual enhancement)
3. **Low Priority**: Admin panel (security considerations needed)

---

## Security Considerations

⚠️ Before implementing admin features:
- Add role-based access control (RBAC)
- Implement audit logging for admin actions
- Add verification steps for destructive operations
- Use Firebase Security Rules to restrict admin operations

---

## Estimated Timeline

- **Phase 1 (Real-time Stats)**: 2-3 hours
- **Phase 2 (Donation Animation)**: 1-2 hours  
- **Phase 3 (Admin Panel)**: 4-6 hours (with security review)

**Total**: ~8-11 hours of development

---

**Last Updated**: 2026-03-30
**Version**: v2.4.0 Roadmap
