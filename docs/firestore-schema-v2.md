# Firestore Schema v2 (Realtime Dev Lounge)

이 문서는 실시간 개발 라운지 구조에 맞춘 Firestore 컬렉션 설계를 정리합니다.

## 1) users
- 목적: 사용자 기본 프로필과 권한 정보
- 주요 필드
- `uid: string`
- `nickname: string` (최대 12자, 최초 생성 시 빈 문자열 허용)
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
- `members: string[]` (접근/수정 권한 판정에 사용)
- `updatedAt: timestamp`

## 3) project_logs
- 목적: 오늘 작업 로그와 회고 기록
- 주요 필드
- `projectId: string`
- `authorUid: string`
- `authorNickname: string`
- `summary: string`
- `retro: string`
- `links: string[]`
- `logType: "DAILY" | "RETRO"`
- `createdAt: timestamp`

## 4) project_threads
- 목적: 프로젝트별 스레드 채널
- 주요 필드
- `projectId: string`
- `title: string`
- `createdBy: string`
- `lastMessageAt: timestamp`

### 4-1) project_threads/{threadId}/messages
- 목적: 프로젝트 컨텍스트 대화 기록
- 주요 필드
- `projectId: string`
- `authorUid: string`
- `authorNickname: string`
- `messageType: "GENERAL" | "QUESTION" | "FEEDBACK" | "REFERENCE"`
- `text: string` (1~500자)
- `messageKeywords: string[]` (검색 토큰)
- `createdAt: timestamp` (`serverTimestamp()` 사용)

## 5) focus_sessions
- 목적: 몰입 시간 집계 원천 데이터
- 주요 필드
- `userUid: string`
- `startedAt: timestamp`
- `endedAt: timestamp`
- `durationSec: number`
- `dateKey: string` (YYYY-MM-DD)

## 6) donations
- 목적: 서버 검증 완료 결제 기록
- 작성 주체
- Firebase Functions(관리자 권한)에서만 생성/수정/삭제

## 쿼리/인덱스 권장
- `project_threads`: `projectId ASC + lastMessageAt DESC`
- `project_logs`: `projectId ASC + createdAt DESC`
- `messages`(collection group): `messageType ASC + createdAt DESC`
- `messages`(collection group): `messageKeywords CONTAINS + createdAt DESC`
