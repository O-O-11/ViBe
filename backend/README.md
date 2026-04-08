# ViBe Backend

## Overview
백엔드 서버는 WebRTC 시그널링, 채팅, 및 OpenAI API 통합을 담당합니다.

## Setup

### 1. 환경변수 설정
```bash
cp .env.example .env
```

`.env` 파일에 다음을 입력하세요:
```
OPENAI_API_KEY=sk-proj-your-key-here
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

### 2. 의존성 설치
```bash
npm install
```

### 3. 로컬 개발
```bash
npm run dev
```

서버가 http://localhost:3000에서 시작됩니다.

## 배포 (Render)

### 1. Render 설정
1. [Render Dashboard](https://dashboard.render.com)에서 "New Web Service" 클릭
2. GitHub 저장소 연결
3. 다음 설정 사용:
   - **Name**: vibe-backend
   - **Runtime**: Node
   - **Root Directory**: backend
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 2. 환경변수 설정
Render 대시보드에서:
1. Environment 탭으로 이동
2. 다음 변수 추가:
   - `NODE_ENV`: production
   - `PORT`: 10000 (자동할당)
   - `FRONTEND_URL`: https://your-frontend-url.vercel.app
   - `OPENAI_API_KEY`: your-openai-api-key (보안: Secret 로 설정)

### 3. 배포
Push하면 Render가 자동으로 배포합니다.

## API Endpoints

### POST /api/refine-question
질문을 ChatGPT로 정리합니다.

**Request:**
```json
{
  "question": "사용자의 질문"
}
```

**Response:**
```json
{
  "refinedQuestion": "정리된 질문"
}
```

### GET /api/health
서버 상태 확인

**Response:**
```json
{
  "status": "ok",
  "message": "ViBe Backend is running"
}
```

## WebRTC 시그널링

Socket.IO를 통한 실시간 통신:
- `join-room`: 방 참여
- `offer`: WebRTC Offer 전송
- `answer`: WebRTC Answer 전송
- `ice-candidate`: ICE 후보 전송
- `send-message`: 채팅 메시지 전송
- `start-screen-share`: 화면공유 시작
- `stop-screen-share`: 화면공유 종료

## 문제해결

### "OPENAI_API_KEY not found"
- `.env` 파일에 OPENAI_API_KEY가 설정되어 있으신지 확인하세요
- Render 환경변수가 올바르게 설정되어 있는지 확인

### CORS 오류
- `FRONTEND_URL` 환경변수를 프론트엔드 URL로 설정하세요

### 배포 후 업데이트 안됨
- Render 대시보드에서 "Redeploy" 클릭
