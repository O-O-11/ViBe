# ViBe - 빠른 시작 가이드

## 🎯 프로젝트 완성 현황

✅ **모든 기능 구현 완료**

### 구현된 기능

#### 1️⃣ **핵심 화상 회의**
- ✅ WebRTC 기반 P2P 화상/음성 통화
- ✅ 자동 시그널링 (Socket.IO)
- ✅ 다중 참여자 지원 (10명 이상)
- ✅ 자동 비디오 그리드 레이아웃

#### 2️⃣ **화면 공유**
- ✅ 화면 캡처 및 공유
- ✅ 자동 레이아웃 전환
- ✅ 화면 공유 사용자 표시
- ✅ 공유 종료 시 카메라 자동 복구

#### 3️⃣ **실시간 채팅**
- ✅ 텍스트 메시지 전송/수신
- ✅ 타임스탬프 표시
- ✅ 사용자명 표시
- ✅ 자동 스크롤

#### 4️⃣ **미디어 제어**
- ✅ 카메라 ON/OFF
- ✅ 마이크 ON/OFF
- ✅ 시각적 피드백 (버튼 상태 표시)

#### 5️⃣ **사용자 인터페이스**
- ✅ 로그인 화면 (회의 ID 생성/참여)
- ✅ 반응형 레이아웃 (데스크톱/모바일)
- ✅ 참여자 목록 표시
- ✅ 사용자 입장/퇴장 알림
- ✅ 실시간 알림

## 🚀 설치 방법

### 사전 요구사항
- **Node.js** 14.0 이상
- **npm** 6.0 이상
- 모던 웹 브라우저

### 단계별 설치

#### Windows
```bash
# 1. 프로젝트 디렉토리로 이동
cd ViBe

# 2. setup.bat 실행
setup.bat

# 또는

# 2. 의존성 설치
npm install

# 3. 서버 시작
npm start
```

#### macOS / Linux
```bash
# 1. 프로젝트 디렉토리로 이동
cd ViBe

# 2. setup.sh 실행
bash setup.sh

# 또는

# 2. 의존성 설치
npm install

# 3. 서버 시작
npm start
```

### 개발 모드 실행
```bash
npm run dev
```
(nodemon으로 자동 재시작됨 - 코드 수정 시)

## 🧪 테스트 방법

### 1단계: 서버 시작
```bash
npm start
```
콘솔에 다음과 같이 표시됨:
```
🚀 ViBe 비디오 회의 서버 시작: http://localhost:3000
```

### 2단계: 브라우저에서 테스트

#### 테스트 1: 로컬 회의 (같은 장비)
1. 새 Chrome 탭 1: `http://localhost:3000`
   - 이름: "User1"
   - "새로 생성" 클릭 → 회의 ID 확인 (예: `ROOM-ABC123`)
   - "회의 참여" 클릭

2. 새 Chrome 탭 2: `http://localhost:3000`
   - 이름: "User2"
   - 회의 ID: `ROOM-ABC123` 입력
   - "참여" 클릭

3. 결과:
   - ✅ 비디오 그리드에 두 개의 비디오 타일 표시
   - ✅ 각각 다른 사용자 영상 표시
   - ✅ 참여자 수: 2명 표시

#### 테스트 2: 다중 참여자
- 3~10개 탭을 추가로 열기
- 각각 다른 이름으로 같은 회의 ID 입력
- ✅ 모든 참여자의 비디오 표시

#### 테스트 3: 카메라 제어
- User1 탭에서 📹 버튼 클릭
- ✅ User1의 비디오 꺼짐 (다른 탭에서도)
- ✅ 버튼이 빨간색으로 변함
- 다시 클릭하면 복구

#### 테스트 4: 마이크 제어
- User2 탭에서 🎤 버튼 클릭
- ✅ User2의 마이크 꺼짐
- ✅ 버튼이 빨간색으로 변함

#### 테스트 5: 화면 공유
1. User1 탭에서 🖥️ 화면 공유 클릭
2. 브라우저/응용프로그램 선택 후 "공유" 클릭
3. ✅ 화면 공유 영역 표시
4. User2 탭에서도 User1의 화면 공유 보임
5. User3+ 탭에서도 동시에 보임
6. 화면 공유 종료 또는 ✕ 클릭
7. ✅ 다시 카메라 스트림으로 복구

#### 테스트 6: 채팅
1. "💬 채팅" 탭 클릭
2. 메시지 입력: "안녕하세요!"
3. "전송" 클릭 또는 Enter 키
4. ✅ 모든 참여자에게 메시지 표시
5. 타임스탬프 포함되어 있는가?
6. 사용자명이 표시되는가?

#### 테스트 7: 사용자 입장/퇴장
1. 새 탭에서 같은 회의 ID로 참여
2. ✅ "X님이 입장했습니다" 알림
3. ✅ 기존 모든 탭에서 알림 표시
4. 새 탭 닫기
5. ✅ "X님이 퇴장했습니다" 알림

#### 테스트 8: 참여자 목록
1. "👥 참여자" 탭 클릭
2. ✅ 현재 회의에 참여한 모든 사용자 나열
3. 참여자 수 카운터 일치하는지 확인

## 📋 빠른 참조

### 단축키
- `Enter` - 채팅 메시지 전송 (입력 중일 때)

### 트러블슈팅

| 문제 | 해결책 |
|------|--------|
| "카메라/마이크 접근 권한 오류" | 브라우저에서 카메라/마이크 권한 허용 필요 |
| "비디오가 안 나옴" | 브라우저 주소창의 카메라/마이크 아이콘 확인 |
| "화면 공유가 안 됨" | HTTPS 또는 localhost 환경 필요 |
| "다른 사용자 비디오가 안 보임" | 네트워크 연결 확인, STUN 서버 접근성 확인 |
| "서버 연결 안 됨" | `npm start` 실행했는지 확인, 포트 3000 수용 가능 확인 |

### 포트 변경
```bash
# .env 파일 생성 (필요시)
PORT=8080

# 또는 직접 실행
PORT=8080 npm start
```

## 📊 기술 명세

### 서버 아키텍처
```
Express Server (localhost:3000)
├── Static Files (public/)
├── Socket.IO Namespace (/)
│   ├── join-room
│   ├── offer/answer/ice-candidate
│   ├── screen-share events
│   ├── chat
│   └── leave-room
└── 활성 사용자/방 관리
```

### 클라이언트 아키텍처
```
Web Browser
├── WebRTC PeerConnections (1:N)
├── Socket.IO Client
├── Local Media Stream
├── Remote Media Streams
└── UI Controllers
```

### 데이터 흐름
```
User A                  Server                  User B
  |                       |                       |
  |----join-room--------->|                       |
  |                       |<-----join-room--------
  |                       |
  |----offer------------>|-----offer------------>
  |                       |
  |<----answer-----------|<-----answer---------
  |<--ice-candidate------|<--ice-candidate-----
  |                       |
  |<===== WebRTC Stream (P2P) =====>
  |                       |
  |----chat-message----->|-----chat-message---->
  |                       |
```

## 🔍 코드 구조

### 백엔드 (`src/server.js`)
- Socket.IO 연결 관리
- 사용자 및 방 상태 관리
- 시그널링 메시지 중계
- 채팅 브로드캐스트

### 프론트엔드
- **client.js**: WebRTC 로직, 상태 관리
- **index.html**: UI 마크업
- **styles.css**: 반응형 스타일

## 🚀 배포 준비

### 프로덕션 체크리스트
- [ ] TURN 서버 설정 (NAT 트래버설)
- [ ] HTTPS 설정 (certbot, Let's Encrypt)
- [ ] 환경 변수 설정
- [ ] 에러 로깅 추가
- [ ] 성능 모니터링
- [ ] 보안 설정 (CORS, 인증)

## 📞 지원 및 문의

- 🐛 버그 보고: GitHub Issues
- 💡 기능 제안: GitHub Discussions
- 📧 문의: [이메일 주소]

## 📚 추가 리소스

- [WebRTC 공식 문서](https://webrtc.org/)
- [Socket.IO 문서](https://socket.io/docs/)
- [MDN WebRTC 가이드](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)

---

**Ready to make video calls? Happy conferencing! 🎉**
