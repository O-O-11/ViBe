# ViBe 배포 가이드 (Railway + Netlify)

## 📋 프로젝트 개요

**ViBe**는 다음과 같이 구성되어 있습니다:
- **백엔드**: Node.js + Express + Socket.IO → **Railway** 배포
- **프론트엔드**: HTML5 + CSS3 + Vanilla JavaScript → **Netlify** 배포

### 현재 배포 상태

| 항목 | 서비스 | URL |
|------|--------|-----|
| **백엔드** | Railway | `https://vibe-production-6c36.up.railway.app` |
| **프론트엔드** | Netlify | `https://qbridge-classroom.netlify.app/` |
| **소스코드** | GitHub | ViBe 저장소 |

## 📁 프로젝트 구조

```
ViBe/
├── backend/                    # Railway에 배포
│   ├── src/
│   │   └── server.js          # Node.js 서버
│   ├── package.json           # 백엔드 의존성
│   ├── .env.example           # 환경변수 템플릿
│   ├── .gitignore
│   ├── railway.json           # Railway 배포 설정 (자동)
│   └── README.md
│
├── frontend/                   # Netlify에 배포
│   ├── public/
│   │   ├── index.html         # 메인 HTML
│   │   ├── client.js          # 클라이언트 로직
│   │   └── styles.css         # 스타일시트
│   ├── package.json           # 프론트엔드 의존성
│   ├── .env.example           # 환경변수 템플릿
│   ├── .gitignore
│   ├── netlify.toml           # Netlify 배포 설정
│   └── README.md
│
├── DEPLOYMENT.md              # 이 파일
├── ARCHITECTURE.md            # 기술 아키텍처
├── QUICKSTART.md              # 빠른 시작 가이드
├── COMPLETE.md                # 완성도 보고
├── README.md                  # 프로젝트 개요
└── railway.json               # Railway 설정 (백엔드)
```

---

## 🚀 Step 1: 로컬 환경 준비

### 1.1 사전 요구사항
- Node.js 14.0 이상
- npm 6.0 이상
- Git
- GitHub 계정
- Railway 계정 (무료)
- Netlify 계정 (무료)
- OpenAI API 계정 (선택, 질문 정리 기능 사용 시)

### 1.2 코드 준비

```bash
# 1. ViBe 프로젝트 클론 또는 다운로드
git clone https://github.com/O-O-11/ViBe.git
cd ViBe

# 2. 백엔드 설정
cd backend
cp .env.example .env

# 3. .env 파일 편집 (중요!)
# Windows: notepad .env
# macOS/Linux: nano .env
```

**백엔드 .env 파일 내용:**
```
NODE_ENV=development
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxx  # OpenAI에서 발급 (선택)
FRONTEND_URL=http://localhost:5173       # 로컬 테스트용
PORT=3000
```

### 1.3 로컬 테스트

**터미널 1 (백엔드):**
```bash
cd backend
npm install
npm run dev
```

결과:
```
🚀 ViBe 비디오 회의 서버 시작: http://localhost:3000
Socket.IO 서버 준비 완료
```

**터미널 2 (프론트엔드):**
```bash
cd frontend
npm install
python -m http.server 5173 --bind 127.0.0.1
```

결과:
```
Serving HTTP on 127.0.0.1 port 5173
```

### 1.4 로컬 테스트 확인

1. 브라우저 열기: `http://localhost:5173`
2. 사용자 이름 입력
3. "새로 생성" 클릭
4. 새 탭에서 같은 URL 접속
5. 방 ID 입력 후 "참여"
6. ✅ 화상통화 작동 확인

---

## 🔑 Step 2: API 키 설정

### 2.1 OpenAI API 키 발급 (선택)

**질문 정리 기능을 사용하려면 필요합니다.**

1. [OpenAI Platform](https://platform.openai.com/account/api-keys) 접속
2. 로그인 (또는 가입)
3. **"+ Create new secret key"** 클릭
4. 키 복사
5. Railway 환경변수에 저장 (Step 4.3 참고)

### 2.2 키 보안 주의사항

⚠️ **절대 하지 말 것:**
- API 키를 코드에 하드코딩하기
- API 키를 git에 commit하기
- API 키를 공개 저장소에 올리기

✅ **반드시 할 것:**
- `.env` 파일에만 저장 (로컬)
- `.gitignore`에 `.env` 파일 추가 (이미 설정됨)
- Railway의 변수로 설정

---

## 📤 Step 3: GitHub에 푸시

### 3.1 Git 설정

```bash
# 프로젝트 최상위 폴더에서
cd ViBe

# Git 초기화 (처음만)
git init
git add .
git commit -m "Initial commit: ViBe video conference platform"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/ViBe.git
git push -u origin main
```

### 3.2 정기적 푸시

```bash
git add .
git commit -m "기능 설명"
git push origin main
```

### 3.3 git 설정 확인

```bash
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

---

## ⚙️ Step 4: Railway에 백엔드 배포

### 4.1 Railway 프로젝트 생성

1. [Railway Dashboard](https://railway.app/dashboard) 접속
2. **"New Project"** 클릭
3. **"Deploy from GitHub"** 선택
4. GitHub 저장소 `ViBe` 선택
5. 자동으로 감지됨

### 4.2 서비스 설정

Railway는 `package.json`과 `src/server.js`를 자동으로 감지합니다.

| 항목 | 값 |
|------|-----|
| **Root Directory** | `backend` ← 중요! |
| **Start Command** | `npm start` (자동) |
| **Build Command** | `npm install` (자동) |

### 4.3 환경변수 설정

**Dashboard** > **Variables** 탭에서:

| 변수명 | 값 | 설명 |
|--------|-----|------|
| `NODE_ENV` | `production` | 프로덕션 모드 |
| `OPENAI_API_KEY` | `sk-proj-...` | ⭐ Secret으로 설정 |
| `FRONTEND_URL` | `https://qbridge-classroom.netlify.app` | Netlify URL |
| `PORT` | `3000` | (선택) 포트 번호 |

⭐ **중요: `OPENAI_API_KEY`는 반드시 "Secret"으로 설정!**

### 4.4 배포

1. Railway가 자동으로 배포 시작
2. **Deployments** 탭에서 상태 확인
3. 배포 완료 시 "Deployed" 표시

### 4.5 배포 도메인 확인

배포 완료 후:
```
https://vibe-production-6c36.up.railway.app
```

---

## 🎨 Step 5: Netlify에 프론트엔드 배포

### 5.1 Netlify로 배포

1. [Netlify Dashboard](https://app.netlify.com) 접속
2. **"Add new site"** > **"Import an existing project"** 클릭
3. GitHub 계정 인증 후 `ViBe` 저장소 선택

### 5.2 빌드 설정

| 항목 | 값 |
|------|-----|
| **Repository** | ViBe |
| **Branch to deploy** | main |
| **Base directory** | `frontend` ← 중요! |
| **Build command** | (비워두기) |
| **Publish directory** | `public` |

💡 **설명**: Netlify는 정적 사이트이므로 빌드 명령이 필요 없습니다.

### 5.3 환경변수 설정

Netlify에서는 프론트엔드의 환경변수가 필요 없습니다.
(백엔드 URL은 `client.js`에서 자동으로 감지됨)

### 5.4 배포

1. **Deploy** 클릭
2. 배포 로그 확인
3. 완료 후 도메인 할당:
   ```
   https://qbridge-classroom.netlify.app
   ```

---

## ✅ Step 6: 배포 확인

### 6.1 기본 테스트

1. 프론트엔드 URL 접속: `https://qbridge-classroom.netlify.app`
2. 로그인 화면 표시 확인
3. 사용자 이름 입력
4. "새로 생성" 클릭
5. 회의실 진입 확인

### 6.2 기능 테스트

- [ ] 화상 통화 작동
- [ ] 채팅 작동
- [ ] 화면 공유 작동
- [ ] 퀴즈 작동
- [ ] 질문 정리 작동

### 6.3 모바일 테스트

1. 모바일 기기의 브라우저에서 접속
2. 같은 방으로 참여
3. 비디오/음성/채팅 확인

---

## 🐛 배포 문제 해결

### 문제: 프론트엔드에서 백엔드 연결 실패

**증상**: 콘솔에 `Cannot connect to <backend-url>` 에러

**해결:**
1. Railway 백엔드 상태 확인
   - [Railway Dashboard](https://railway.app/dashboard)
   - Deployments 탭 확인
2. CORS 오류인지 확인
   - 브라우저 콘솔 (F12) > Console 탭 확인
3. Railway 환경변수 재확인
   - `FRONTEND_URL`이 정확한지 확인

### 문제: "마이크/카메라 접근 권한 없음"

**증상**: 회의 시작 시 권한 요청이 없음

**해결:**
1. 브라우저 주소창의 🔒 아이콘 클릭
2. "사이트 설정" > "카메라" > "허용"
3. "사이트 설정" > "마이크" > "허용"
4. 페이지 새로고침

### 문제: OpenAI API 에러

**증상**: 질문 정리 기능 오류

**해결:**
1. OpenAI API 키가 유효한지 확인
2. API 할당량 초과 확인 (https://platform.openai.com/account/billing/overview)
3. Railway 로그에서 에러 메시지 확인

### 문제: Railway에서 자주 중단

**원인**: Railway 무료 플랜의 시간 제한

**해결:**
1. 유료 플랜으로 업그레이드
2. 또는 다른 호스팅 서비스 검토

---

## 📊 모니터링

### Railway 백엔드 모니터링

1. [Railway Dashboard](https://railway.app/dashboard)
2. 프로젝트 선택
3. 정보 확인:
   - CPU/메모리 사용량
   - 최근 로그
   - 배포 이력

### Netlify 프론트엔드 모니터링

1. [Netlify Dashboard](https://app.netlify.com)
2. 사이트 선택
3. 정보 확인:
   - 배포 이력
   - 성능 지표
   - 분석

---

## 🔐 프로덕션 보안 체크리스트

- [ ] API 키가 `.gitignore`에 있는지 확인
- [ ] Railway 환경에서 모든 API 키가 설정됨
- [ ] HTTPS 기본값 (Railway/Netlify 제공)
- [ ] CORS 설정이 적절한지 확인
- [ ] 파일 업로드 크기 제한 체크
- [ ] 로그 민감 정보 제거

---

## 📈 향후 개선 사항

### 성능 개선
- [ ] WebRTC 코덱 최적화
- [ ] 대역폭 자동 조절
- [ ] 캐싱 전략 개선

### 기능 개선
- [ ] 회의 녹화
- [ ] 가상 배경
- [ ] 더 많은 참여자 지원 (50+)

### 인프라 개선
- [ ] TURN 서버 추가 (NAT 트래버설)
- [ ] CDN 통합
- [ ] 데이터베이스 추가 (회의 기록)

---

## 📞 지원

문제가 발생하면:
1. [GitHub Issues](https://github.com/O-O-11/ViBe/issues)에 보고
2. 에러 메시지와 환경 정보 포함
3. 자세한 설명으로 도움 받기

---

**배포 완료! ViBe를 이용한 실시간 강의를 시작하세요!** 🎉

---

## 🚀 Step 1: 로컬 환경 준비

### 1.1 사전 요구사항
- Node.js 14.0 이상
- npm 6.0 이상
- Git
- GitHub 계정
- Render 계정 (무료)
- Vercel 계정 (무료)
- OpenAI API 계정 (선택, 질문 정리 기능 사용 시)

### 1.2 코드 준비

```bash
# 1. ViBe 프로젝트 클론 또는 다운로드
git clone https://github.com/O-O-11/ViBe.git
cd ViBe

# 2. 백엔드 설정
cd backend
cp .env.example .env

# 3. .env 파일 편집 (중요!)
# Windows: notepad .env
# macOS/Linux: nano .env
```

**백엔드 .env 파일 내용:**
```
NODE_ENV=development
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxx  # OpenAI에서 발급 (선택)
FRONTEND_URL=http://localhost:5173       # 로컬 테스트용
PORT=3000
```

### 1.3 로컬 테스트

**터미널 1 (백엔드):**
```bash
cd backend
npm install
npm run dev
```

결과:
```
🚀 ViBe 비디오 회의 서버 시작: http://localhost:3000
Socket.IO 서버 준비 완료
```

**터미널 2 (프론트엔드):**
```bash
cd frontend
npm install
python -m http.server 5173 --bind 127.0.0.1
```

결과:
```
Serving HTTP on 127.0.0.1 port 5173
```

### 1.4 로컬 테스트 확인

1. 브라우저 열기: `http://localhost:5173`
2. 사용자 이름 입력
3. "새로 생성" 클릭
4. 새 탭에서 같은 URL 접속
5. 방 ID 입력 후 "참여"
6. ✅ 화상통화 작동 확인

---

## 🔑 Step 2: API 키 설정

### 2.1 OpenAI API 키 발급 (선택)

**질문 정리 기능을 사용하려면 필요합니다.**

1. [OpenAI Platform](https://platform.openai.com/account/api-keys) 접속
2. 로그인 (또는 가입)
3. **"+ Create new secret key"** 클릭
4. 키 복사
5. 로컬 `.env` 파일에 저장:
   ```
   OPENAI_API_KEY=sk-proj-xxxxxxxx...
   ```

### 2.2 키 보안 주의사항

⚠️ **절대 하지 말 것:**
- API 키를 코드에 하드코딩하기
- API 키를 git에 commit하기
- API 키를 공개 저장소에 올리기

✅ **반드시 할 것:**
- `.env` 파일에만 저장
- `.gitignore`에 `.env` 파일 추가 (이미 설정됨)
- 배포 플랫폼의 "Secret" 변수로 설정

---

## 📤 Step 3: GitHub에 푸시

### 3.1 Git 설정

```bash
# 프로젝트 최상위 폴더에서
cd ViBe

# Git 초기화 (처음만)
git init
git add .
git commit -m "Initial commit: ViBe video conference platform"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/ViBe.git
git push -u origin main
```

### 3.2 정기적 푸시

```bash
git add .
git commit -m "기능 설명"
git push origin main
```

### 3.3 git 설정 확인

```bash
git config user.name "Your Name"
git config user.email "your-email@example.com"
```

---

## ⚙️ Step 4: Render에 백엔드 배포

### 4.1 Render 웹 서비스 생성

1. [Render Dashboard](https://dashboard.render.com) 접속
2. **"+ New"** > **"Web Service"** 클릭
3. GitHub 저장소 연결:
   - GitHub 계정 연결 (처음만)
   - `ViBe` 저장소 선택

### 4.2 서비스 설정

다음 정보 입력:

| 항목 | 값 |
|------|-----|
| **Name** | `vibe-backend` (또는 원하는 이름) |
| **Runtime** | Node |
| **Region** | Singapore 또는 가까운 지역 |
| **Branch** | main |
| **Root Directory** | `backend` ← 중요! |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

### 4.3 환경변수 설정

**Settings** 탭 > **Environment**에서:

| 변수명 | 값 | 타입 |
|--------|-----|------|
| `NODE_ENV` | `production` | Plain text |
| `OPENAI_API_KEY` | `sk-proj-...` | **Secret** ⭐ |
| `FRONTEND_URL` | `https://vibe-app.vercel.app` | Plain text |
| `PORT` | `3000` | Plain text |

**⭐ 중요: `OPENAI_API_KEY`는 반드시 "Secret"으로 설정!**

### 4.4 배포

1. **Settings** > 아래로 스크롤
2. **Deploy** 클릭
3. 로그 확인:
   ```
   Building...
   Build successful
   ✓ Deployed
   ```

### 4.5 배포 URL 확인

배포 완료 후 URL이 표시됨. 예:
```
https://vibe-backend-abc123.onrender.com
```

⏳ **주의**: Render 무료 플랜은 15분 동안 요청이 없으면 슬립 상태로 들어갑니다. 처음 접속 시 30초 정도 걸릴 수 있습니다.

---

## 🎨 Step 5: Vercel에 프론트엔드 배포

### 5.1 Vercel로 배포

1. [Vercel Dashboard](https://vercel.com/dashboard) 접속
2. **"Add New"** > **"Project"** 클릭
3. GitHub 저장소 선택:
   - `ViBe` 저장소 선택

### 5.2 프로젝트 설정

| 항목 | 값 |
|------|-----|
| **Project Name** | `vibe-frontend` (또는 원하는 이름) |
| **Root Directory** | `frontend` ← 중요! |
| **Framework** | Other (기본값) |
| **Build Command** | (비워두기) |
| **Output Directory** | `public` |

💡 **Framework Preset**: "Other"를 선택하면 정적 사이트로 배포됩니다.

### 5.3 환경변수 설정

**Environment Variables** 섹션:

| 변수명 | 값 |
|--------|-----|
| `REACT_APP_BACKEND_URL` | `https://vibe-backend-abc123.onrender.com` |
| `VITE_BACKEND_URL` | `https://vibe-backend-abc123.onrender.com` |

👉 **Render 백엔드 URL을 여기에 입력하세요!**

### 5.4 배포

1. **Deploy** 클릭
2. 배포 로그 확인
3. 완료!

### 5.5 배포 URL 확인

배포 완료 후 URL 표시:
```
https://vibe-frontend.vercel.app
```

---

## 🔄 Step 6: 백엔드 환경변수 업데이트

프론트엔드 배포 URL을 얻었으니, 백엔드의 FRONTEND_URL을 업데이트합니다.

### 6.1 Render 백엔드 설정 업데이트

1. [Render Dashboard](https://dashboard.render.com) 접속
2. `vibe-backend` 서비스 선택
3. **Settings** > **Environment**
4. `FRONTEND_URL` 수정:
   ```
   https://vibe-frontend.vercel.app
   ```
5. **Save** 클릭
6. 서비스 자동 재배포

---

## ✅ Step 7: 배포 확인

### 7.1 기본 테스트

1. 프론트엔드 URL 접속: `https://vibe-frontend.vercel.app`
2. 로그인 화면 표시 확인
3. 사용자 이름 입력
4. "새로 생성" 클릭
5. 회의실 진입 확인

### 7.2 기능 테스트

- [ ] 화상 통화 작동
- [ ] 채팅 작동
- [ ] 화면 공유 작동
- [ ] 퀴즈 작동
- [ ] 질문 정리 작동

### 7.3 모바일 테스트

1. 모바일 기기의 브라우저에서 접속
2. 같은 방으로 참여
3. 비디오/음성/채팅 확인

---

## 🐛 배포 문제 해결

### 문제: 프론트엔드에서 백엔드 연결 실패

**증상**: 콘솔에 `Cannot connect to <backend-url>` 에러

**해결:**
1. Render 백엔드 상태 확인
   - [Render Dashboard](https://dashboard.render.com)
   - `vibe-backend` > Logs 확인
2. CORS 오류인지 확인
   - 브라우저 콘솔 (F12) > Console 탭 확인
3. 환경변수 재확인
   - 프론트엔드의 `REACT_APP_BACKEND_URL` 정확한지 확인

### 문제: "마이크/카메라 접근 권한 없음"

**증상**: 회의 시작 시 권한 요청이 없음

**해결:**
1. 브라우저 주소창의 🔒 아이콘 클릭
2. "사이트 설정" > "카메라" > "허용"
3. "사이트 설정" > "마이크" > "허용"
4. 페이지 새로고침

### 문제: OpenAI API 에러

**증상**: 질문 정리 기능 오류

**해결:**
1. OpenAI API 키가 유효한지 확인
2. API 할당량 초과 확인 (https://platform.openai.com/account/billing/overview)
3. Render 로그에서 에러 메시지 확인

### 문제: Render에서 자주 슬립 상태로 전환

**원인**: Render 무료 플랜의 제한

**해결:**
1. 자주 접속하기 (15분마다 요청)
2. 또는 유료 플랜으로 업그레이드
3. 또는 다른 호스팅 서비스 검토 (Railway, Heroku 등)

---

## 📊 모니터링

### Render 백엔드 모니터링

1. [Render Dashboard](https://dashboard.render.com)
2. `vibe-backend` 선택
3. 정보 확인:
   - CPU/메모리 사용량
   - 최근 로그
   - 재시작 이력

### Vercel 프론트엔드 모니터링

1. [Vercel Dashboard](https://vercel.com/dashboard)
2. `vibe-frontend` 프로젝트 선택
3. 정보 확인:
   - 배포 이력
   - 성능 지표
   - 분석

---

## 🔐 프로덕션 보안 체크리스트

- [ ] API 키가 `.gitignore`에 있는지 확인
- [ ] 배포 환경에서 모든 API 키가 "Secret"으로 설정됨
- [ ] HTTPS 기본값 (Render/Vercel 제공)
- [ ] CORS 설정이 적절한지 확인
- [ ] 파일 업로드 크기 제한 체크
- [ ] 로그 민감 정보 제거

---

## 📈 향후 개선 사항

### 성능 개선
- [ ] WebRTC 코덱 최적화
- [ ] 대역폭 자동 조절
- [ ] 캐싱 전략 개선

### 기능 개선
- [ ] 회의 녹화
- [ ] 가상 배경
- [ ] 더 많은 참여자 지원 (50+)

### 인프라 개선
- [ ] TURN 서버 추가 (NAT 트래버설)
- [ ] CDN 통합
- [ ] 데이터베이스 추가 (회의 기록)

---

## 📞 지원

문제가 발생하면:
1. [GitHub Issues](https://github.com/O-O-11/ViBe/issues)에 보고
2. 에러 메시지와 환경 정보 포함
3. 자세한 설명으로 도움 받기

---

**배포 완료! ViBe를 이용한 실시간 강의를 시작하세요!** 🎉

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
