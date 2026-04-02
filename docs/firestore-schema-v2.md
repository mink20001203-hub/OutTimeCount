# Firestore Schema v2 (Realtime Dev Lounge)

이 문서는 1차 개편 기준의 Firestore 컬렉션 구조를 정리한다.

## 1) users
- 목적: 사용자 프로필/권한 기본 정보
- 주요 필드
- `uid: string`
- `nickname: string (2~12자)`
- `email: string`
- `photoURL: string`
- `role: "USER" | "ADMIN"` (표시 용도)
- `lastNicknameUpdate: timestamp`

## 2) projects
- 목적: 작업물 공유의 최상위 엔티티
- 주요 필드
- `title: string`
- `description: string`
- `status: "진행 중" | "검증 중" | "완료"`
- `tags: string[]`
- `demoUrl: string`
- `repoUrl: string`
- `ownerUid: string`
- `members: string[]`
- `updatedAt: timestamp`

## 3) project_logs
- 목적: 오늘 작업 로그 / 회고 메모 기록
- 주요 필드
- `projectId: string`
- `authorUid: string`
- `summary: string`
- `retro: string`
- `links: string[]`
- `logType: "DAILY" | "RETRO"`
- `createdAt: timestamp`

## 4) project_threads
- 목적: 프로젝트 단위 협업 대화 채널
- 주요 필드
- `projectId: string`
- `title: string`
- `createdBy: string`
- `lastMessageAt: timestamp`

### 4-1) project_threads/{threadId}/messages
- 목적: 프로젝트 컨텍스트 메시지
- 주요 필드
- `authorUid: string`
- `authorNickname: string`
- `messageType: "GENERAL" | "QUESTION" | "FEEDBACK" | "REFERENCE"`
- `text: string (1~500자)`
- `linkUrl: string`
- `createdAt: timestamp` (클라이언트에서는 `serverTimestamp()`로 저장)

## 5) focus_sessions
- 목적: 몰입 시간 집계의 원천 데이터
- 주요 필드
- `userUid: string`
- `startedAt: timestamp`
- `endedAt: timestamp`
- `durationSec: number`
- `dateKey: string (YYYY-MM-DD)`

## 6) donations
- 목적: 서버 검증 완료 결제 기록
- 작성 주체
- Firebase Function(관리자 권한)에서만 생성/수정/삭제

## 인덱스 권장
- `project_logs`: `projectId ASC, createdAt DESC`
- `project_threads`: `projectId ASC, lastMessageAt DESC`
- `project_threads/{threadId}/messages`: `createdAt ASC`
- `focus_sessions`: `userUid ASC, dateKey DESC`
