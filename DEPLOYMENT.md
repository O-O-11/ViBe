# ViBe 배포 가이드

## 📋 프로젝트 구조

```
ViBe/
├── backend/                    # Render에 배포할 백엔드
│   ├── src/
│   │   └── server.js          # 메인 서버 파일 (포트 3000)
│   ├── package.json
│   ├── .env.example           # 환경변수 템플릿
│   ├── .gitignore
│   ├── render.yaml            # Render 배포 설정
│   └── README.md              # 백엔드 문서
│
├── frontend/                   # Vercel에 배포할 프론트엔드
│   ├── public/
│   │   ├── index.html         # 메인 HTML
│   │   ├── client.js          # 클라이언트 로직
│   │   └── styles.css         # 스타일시트
│   ├── package.json
│   ├── .env.example           # 환경변수 템플릿
│   ├── .gitignore
│   ├── vercel.json            # Vercel 배포 설정
│   └── README.md              # 프론트엔드 문서
│
├── DEPLOYMENT.md              # 이 파일
└── .gitignore                 # Git 무시 파일
```

## 🚀 배포 단계

### Step 1: 로컬 환경 설정

#### 백엔드
```bash
cd backend
cp .env.example .env
# .env 파일 편집 (OPENAI_API_KEY 입력)
npm install
npm run dev
```

#### 프론트엔드 (다른 터미널)
```bash
cd frontend
cp .env.example .env.local
# .env.local 파일 편집 (백엔드 URL 확인)
python -m http.server 5173 --bind 127.0.0.1
```

http://localhost:5173에서 테스트

### Step 2: GitHub에 푸시

1. Git 저장소 초기화 (처음만)
```bash
git init
git add .
git commit -m "Initial commit: ViBe video conference platform"
git branch -M main
git remote add origin https://github.com/your-username/vibe.git
git push -u origin main
```

2. 일반 푸시
```bash
git add .
git commit -m "메시지"
git push origin main
```

### Step 3: 백엔드 배포 (Render)

1. [Render Dashboard](https://dashboard.render.com)에 로그인
2. **"+ New"** > **"Web Service"** 클릭
3. GitHub 저장소 연결
4. 다음 설정 입력:
   - **Name**: vibe-backend
   - **Runtime**: Node
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. **Environment** 탭에서 변수 추가:
   - `OPENAI_API_KEY`: sk-proj-... (보안: Secret으로 설정)
   - `NODE_ENV`: production
   - `FRONTEND_URL`: https://your-frontend-url.vercel.app
6. **Deploy** 클릭

배포 완료 후:
- 백엔드 URL: https://vibe-backend-xxxxx.onrender.com
- 이 URL을 복사해서 프론트엔드 환경변수에 사용

### Step 4: 프론트엔드 배포 (Vercel)

1. [Vercel Dashboard](https://vercel.com/dashboard)에 로그인
2. **"Add New"** > **"Project"** 클릭
3. GitHub 저장소 선택 (ViBe)
4. 다음 설정 입력:
   - **Project Name**: vibe-frontend
   - **Root Directory**: `frontend`
5. **Environment Variables** 추가:
   - `REACT_APP_BACKEND_URL`: https://vibe-backend-xxxxx.onrender.com
   - `VITE_BACKEND_URL`: https://vibe-backend-xxxxx.onrender.com
6. **Deploy** 클릭

배포 완료 후:
- 프론트엔드 URL: https://vibe-frontend-xxxxx.vercel.app

### Step 5: 백엔드 환경변수 업데이트

Render 대시보드에서:
1. vibe-backend 서비스 선택
2. **Settings** > **Environment** 클릭
3. `FRONTEND_URL` 수정:
   ```
   https://vibe-frontend-xxxxx.vercel.app
   ```
4. **Save** 클릭

## 🔑 API KEY 설정

### OpenAI API Key 얻기

1. [OpenAI Platform](https://platform.openai.com/account/api-keys)에서 로그인
2. **"+ Create new secret key"** 클릭
3. 키 복사
4. Render 환경변수에 `OPENAI_API_KEY`로 저장

### 보안 주의사항
- ⚠️ API 키는 절대 코드에 하드코딩하지 마세요
- ⚠️ .env 파일은 git에 commit하지 마세요
- ⚠️ 배포 플랫폼의 "Secret" 환경변수로만 설정하세요

## ✅ 배포 확인

1. 프론트엔드 웹사이트 방문
2. 로그인 후 방 생성
3. 마이크/카메라 허용
4. 화상통화 테스트

### 문제 발생 시

#### 백엔드 연결 안됨
```bash
# 1. 프론트엔드 브라우저 콘솔에서 확인
# 2. 백엔드 환경변수 확인
# 3. Render 백엔드 상태 확인 (https://dashboard.render.com)
```

#### API 응답 오류
```bash
# 1. OpenAI API 키 확인 (유효한지, 유료 계정인지)
# 2. API 호출 제한 확인 (rate limit)
# 3. Render 로그 확인:
#    - vibe-backend > Logs 탭
```

#### CORS 오류
```
Access to XMLHttpRequest from 'https://frontend.vercel.app' 
has been blocked by CORS policy
```
해결: 백엔드 `FRONTEND_URL` 환경변수 확인

## 📊 배포 상태 모니터링

### Render (백엔드)
- https://dashboard.render.com에서 실시간 로그 확인
- CPU/메모리 사용률 모니터링

### Vercel (프론트엔드)
- https://vercel.com에서 배포 이력 확인
- Build 로그 확인

## 🔄 배포 후 업데이트

코드 수정 후:

```bash
# 1. 로컬 변경사항 테스트
# 2. Commit & Push
git add .
git commit -m "수정 사항 설명"
git push origin main

# 3. Render/Vercel이 자동으로 재배포
# 4. 배포 상태 확인 후 테스트
```

**Vercel**: 자동 배포 (2-5분)
**Render**: 자동 배포 (1-5분)

## 📝 체크리스트

- [ ] 로컬 환경에서 모든 기능 테스트 완료
- [ ] GitHub에 코드 push
- [ ] Render에 백엔드 배포
- [ ] OpenAI API Key 설정
- [ ] Vercel에 프론트엔드 배포
- [ ] Render 환경변수 (FRONTEND_URL) 업데이트
- [ ] 프론트엔드 URL 방문 테스트
- [ ] 화상통화 기능 테스트
- [ ] AI 질문 정리 기능 테스트

## 🆘 추가 지원

### 공식 문서
- Render: https://render.com/docs
- Vercel: https://vercel.com/docs
- Socket.io: https://socket.io/docs/

### 트러블슈팅
- 프론트엔드: `frontend/README.md`
- 백엔드: `backend/README.md`

---

**배포가 완료되었습니다! 🎉**

사용자들이 이제 당신의 ViBe 플랫폼을 사용할 수 있습니다.
