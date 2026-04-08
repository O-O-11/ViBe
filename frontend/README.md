# ViBe Frontend

## Overview
프론트엔드는 WebRTC 비디오 회의 UI와 클라이언트 로직을 제공합니다.

## Setup

### 1. 환경변수 설정
```bash
cp .env.example .env.local
```

`.env.local` 파일에 다음을 입력하세요:
```
REACT_APP_BACKEND_URL=http://localhost:3000
VITE_BACKEND_URL=http://localhost:3000
```

### 2. 프로덕션 환경변수
Vercel에서 자동으로 설정되거나, 수동으로 추가하세요:
```
REACT_APP_BACKEND_URL=https://vibe-backend.onrender.com
VITE_BACKEND_URL=https://vibe-backend.onrender.com
```

### 3. 로컬 개발
Python이 설치되어 있으면:
```bash
python -m http.server 5173 --bind 127.0.0.1
```

또는 npm/npm 호환 서버:
```bash
npx http-server --port 5173
```

브라우저에서 http://localhost:5173 열기

## 배포 (Vercel)

### 1. Vercel 설정
1. [Vercel Dashboard](https://vercel.com/dashboard)에 로그인
2. "Add New" > "Project" 클릭
3. GitHub 저장소 선택 및 import

### 2. 프로젝트 설정
1. **Root Directory**: `frontend`
2. **Build Command**: `npm run build` (또는 설정 안함)
3. **Output Directory**: `public`

### 3. 환경변수
1. "Settings" > "Environment Variables"로 이동
2. 다음 변수 추가:
   - `REACT_APP_BACKEND_URL`: https://vibe-backend.onrender.com
   - `VITE_BACKEND_URL`: https://vibe-backend.onrender.com

### 4. 배포
Push하면 Vercel이 자동으로 배포합니다.

## 기능

### 화상회의
- WebRTC를 사용한 실시간 화상 통화
- 다중 사용자 지원
- 카메라/마이크 제어

### 화면공유
- 전체 화면 공유
- 다른 사용자에게 실시간 전송

### 채팅
- 실시간 메시지 전송
- AI 질문 정리 기능

### 사용자 관리
- 이름 변경
- 강의자/학생 역할 구분

## 규칙

- 권장 port: 5173 (개발), Vercel (프로덕션)
- API 호출은 `BACKEND_URL` 환경변수 사용
- 모든 상태는 `state` 객체에 관리

## 문제해결

### CORS 오류
- 백엔드 `FRONTEND_URL` 환경변수가 없거나 잘못됨
- 백엔드 서버가 실행 중인지 확인

### 페이지 로드 후 작동 안함
- 브라우저 캐시 삭제
- DevTools Console에서 오류 확인

### 화면공유 작동 안함
- HTTPS 연결 필요 (또는 localhost)
- 브라우저 권한 확인

## 구조

```
frontend/
├── public/
│   ├── index.html      # 메인 HTML
│   ├── styles.css      # CSS 스타일
│   └── client.js       # 클라이언트 로직
├── package.json        # 의존성
├── .env.example        # 환경변수 템플릿
└── vercel.json         # Vercel 배포 설정
```
