# ViBe 아키텍처 및 기술 깊이 분석

## � 배포 환경

### 현재 프로덕션 환경

| 컴포넌트 | 서비스 | URL | 상태 |
|---------|--------|-----|------|
| **프론트엔드** | Netlify | https://qbridge-classroom.netlify.app/ | ✅ 운영 중 |
| **백엔드** | Railway | https://vibe-production-6c36.up.railway.app | ✅ 운영 중 |
| **소스코드** | GitHub | ViBe 저장소 | ✅ 동기화 |

### 배포 구성

- **프론트엔드**: Netlify 정적 호스팅 (frontend 폴더)
- **백엔드**: Railway 서버 호스팅 (backend 폴더)
- **CI/CD**: GitHub 자동 배포 (main 브랜치 변경 시)

---

## �🏗️ 시스템 아키텍처

### 전체 구조
```
┌──────────────────────────────────────────────┐
│          Web Browsers (Clients)              │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌──┐ │
│  │User A  │  │User B  │  │User C  │  │..│ │
│  └───┬────┘  └───┬────┘  └───┬────┘  └──┘ │
└──────┼────────────┼────────────┼────────────┘
       │ WebRTC P2P│ WebRTC P2P │ WebRTC P2P
       │ +Socket.IO│ +Socket.IO │ +Socket.IO
       └────┬──────┴────────────┴───────┬────
            │                           │
┌───────────────────────────────────────────────┐
│      Node.js Server (localhost:3000)          │
│   ┌───────────────────────────────────────┐  │
│   │     Express.js + Socket.IO            │  │
│   │ ├─ 정적 파일 제공 (HTML/CSS/JS)       │  │
│   │ ├─ Room 관리 (메모리 저장)             │  │
│   │ ├─ 신호 처리 (Offer/Answer/ICE)       │  │
│   │ ├─ 채팅 브로드캐스트                   │  │
│   │ ├─ 퀴즈 관리                          │  │
│   │ └─ /api/refine-question (OpenAI)     │  │
│   └───────────────────────────────────────┘  │
└───────────────────────────────────────────────┘
```

## 📡 통신 계층

### 1. WebRTC (미디어 스트리밍)
**타입:** P2P (피어 투 피어)
**프로토콜:** UDP (음성/영상) + DTLS (보안) + SRTP
**용도:** 
- 비디오 스트림 전송
- 오디오 스트림 전송
- 화면 공유 캡처 전송

**특징:**
- 서버를 거치지 않음 (낮은 지연)
- 높은 대역폭 사용 (최적화된 코덱 자동 선택)
- 암호화된 전송

```
User A → STUN Server → NAT Traversal → User B
         (주소 획득)   (ICE 후보 교환)
```

### 2. Socket.IO (신호 및 제어)
**타입:** Client-Server 기반
**프로토콜:** HTTP + WebSocket + JSON
**용도:**
- SDP 교환 (Offer/Answer)
- ICE 후보 전달
- 채팅 메시지 브로드캐스트
- 사용자 상태 알림
- 퀴즈 출제/답변
- 방(Room) 관리

**신뢰성:** TCP 기반이므로 메시지 순서 보장

```
Client          Server          Other Clients
   │               │                │
   ├─ join-room ──→│                │
   │               ├─ existing-users→
   │               │<─ existing-users├─ broadcast
   │               │                │
   ├─ offer ──────→│─ offer ────────→
   │               │                │
   │<─ answer ─────├─ answer ───────┤
   │               │                │
   ├─ ice-candidate→│─ ice-candidate→
   │               │                │
   └─ chat-message→│─ chat-message ─→
```

## 🎯 WebRTC 연결 프로세스 상세

### 연결 수립 단계

```
┌─────────────────┐          ┌──────────────┐          ┌──────────────┐
│    User A       │          │   Server     │          │    User B    │
│  (Offerer)      │          │  Socket.IO   │          │ (Answerer)   │
└────────┬────────┘          └──────┬───────┘          └──────┬───────┘
         │                           │                         │
         └─────────join-room────────→│                         │
         │                           │                         │
         │<──────existing-users──────┤                         │
         │                           │                         │
         │                           │←─────join-room──────────│
         │                           │                         │
         │            ┌──────────────┼─────broadcast──────────→│
         │ create offer               │                         │
         │ add local stream           │                         │
         │            ┌─ setRemote    │   setRemoteDescription  │
         │            │  Description  │   setRemoteDescription  │
         │            │    (answer)   │   createAnswer()        │
         │                           │                         │
    ┌──→│         ┌──────────────────├─────broadcast─────────→ │
    │    │─offer─→│                  │                         │
    │    │         └──────────────────├──────answer───────────→ │
    │    │<────────────────answer─────┤                         │
    │    │                           │                         │
    │    │ ICE Candidates             │   ICE Candidates       │
    │    │ (경로 탐색)                │   (경로 탐색)           │
    │    │                           │                         │
  50ms   │                           │                         │
    │    │   ┌─────────────────────────────ontrack─────────┐  │
    │    │   │   Remote Stream 수신 시작                    │  │
    │    │   └──────────────────────────────────────────────┘  │
    │    │                                                      │
    └───→│      WebRTC Data Channel 확립 ════════════════════→ │
         │        (낮은 지연의 P2P 통신 시작)                    │
         │                                                      │
```

### 상태 머신

```
RTCPeerConnection State:
┌────────┐
│  NEW   │
└───┬────┘
    │ setLocalDescription(offer)
    ↓
┌──────────────────┐
│HAVE_LOCAL_OFFER  │
└───┬──────────────┘
    │ remote answer 도착
    ↓
┌──────────────────────┐
│HAVE_REMOTE_ANSWER    │
└───┬──────────────────┘
    │ connection 확립
    ↓
┌────────┐
│STABLE  │ ← 안정적인 연결 상태
└────────┘

ICE Connection State:
NEW → CHECKING → CONNECTED → COMPLETED
            ↓ (실패)
          FAILED (다시 시도)
```

## 🌐 Room 관리 시스템

### 서버 메모리 구조

```javascript
// 전역 변수 (서버 메모리에 저장)
const rooms = {
  'ROOM-ABC123': {
    id: 'ROOM-ABC123',
    users: [
      { 
        id: 'socket-id-1', 
        name: 'User A',
        isInstructor: true,
        isAnonymous: false,
        stream: MediaStream
      },
      {
        id: 'socket-id-2',
        name: 'User B',
        isInstructor: false,
        isAnonymous: false,
        stream: MediaStream
      }
    ],
    createdAt: 1234567890,
    quizzes: [
      { question: '문제1', answer: 'O' },
      { question: '문제2', answer: 'X' }
    ]
  },
  'ROOM-XYZ789': { /* ... */ }
};

const users = {
  'socket-id-1': {
    id: 'socket-id-1',
    socketId: 'socket-object',
    name: 'User A',
    roomId: 'ROOM-ABC123',
    peerConnections: [
      { 
        userId: 'socket-id-2',
        connection: RTCPeerConnection
      }
    ]
  }
};
```

### Room ID 생성 알고리즘

```
형식: ROOM-XXXXYYY
├─ ROOM- : 고정 접두사
├─ XXXX : 5개 대문자 (26^5 = 11,881,376 조합)
└─ YYY : 3개 숫자 (10^3 = 1,000 조합)

전체 조합: 11,881,376,000 개
충돌 확률: 무시할 수 있는 수준
```

## 💬 채팅 시스템 아키텍처

### 메시지 흐름

```
┌──────────────┐
│  User A      │
│  "Hello"     │
└──────┬───────┘
       │ socket.emit('chat-message', {...})
       ↓
  ┌─────────┐
  │ Server  │ ← message 수신
  │  Room   │ ← user 및 timestamp 추가
  └────┬────┘
       │ socket.to(roomId).emit('chat-message', {...})
       ↓
  ┌─────────────┫
  ↓             ↓
User B        User C
"Hello"       "Hello"
(알림)        (알림)
```

### 메시지 객체 구조

```javascript
{
  id: 'msg-id-123',
  userId: 'socket-id-1',
  username: 'User A',
  text: 'Hello everyone!',
  timestamp: '14:32:45',
  image: 'base64-encoded-image' (선택)
}
```

## ❓ 퀴즈 시스템

### 퀴즈 플로우

```
강의자                     
    │ "문제를 출제할까?"
    ├─ 문제: "2+2는?"
    ├─ 정답: "O (Yes)" 또는 "X (No)"
    │
    ↓ emit('quiz-created', {...})
    
    Server
    │ quiz 저장
    └─ broadcast to room
    
학생들
    │ 알림 표시
    ├─ "퀴즈 탭"에서 문제 확인
    ├─ O 또는 X 선택
    │ emit('quiz-answered', {answerId, answer})
    ↓ 
    Server
    └─ 답변 저장 (강의자만 볼 수 있음)
```

## ✨ AI 질문 정리 시스템

### 요청/응답 흐름

```
┌─────────────┐
│  Frontend   │ User: "이거 어떻게 풀어?"
├─혼란스러운─┤
│  질문      │ emit('refine-question', {question: '...'})
└──────┬──────┘
       │
       ↓
┌──────────────────┐
│  Backend         │
│ POST /api/refine │
├─ OpenAI API ────┤
│ 호출            │
├─ 정리된 질문 ───┤
│ 생성            │
└──────┬───────────┘
       │
       ↓
┌─────────────┐
│  Frontend   │ "이 수학 문제를 풀기 위해 어떤 
├─ 정리된 ───┤  공식을 사용해야 하나요?"
│  질문      │
└─────────────┘
       │
    [수락] [거절]
       │ 수락 선택
       ↓ emit('send-refined-question')
    서버 → 모든 사용자에게 브로드캐스트
```

### OpenAI API 호출

```javascript
// 백엔드: backend/src/server.js
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'user',
        content: `다음 질문을 더 명확하고 논리적으로 정리해줘:\n"${question}"`
      }
    ],
    temperature: 0.7,
    max_tokens: 500
  })
});
```

## 🎥 화면 공유 시스템

### 비디오 레이아웃 전환

```
일반 모드:              화면 공유 모드:
┌─────────────┐         ┌──────────────────┐
│ User A      │         │                  │
│  (비디오)   │         │  Screen Share    │
├─────────────┤         │  (전체 화면)     │
│ User B      │         │                  │
│  (비디오)   │         ├──────────────────┤
│             │  ────→  │ User A (작음)    │
│ User C      │         │ User B (작음)    │
│  (비디오)   │         └──────────────────┘
└─────────────┘
```

### 화면 공유 프로세스

```
User clicks "화면 공유"
    ↓
chrome://extensions 또는 브라우저 권한 확인
    ↓
getDisplayMedia() API 호출
    ↓
사용자가 공유할 화면/창 선택
    ↓
Desktop Capture Stream 획득
    ↓
기존 비디오 트랙 제거
    ↓
화면 캡처 트랙을 RTCPeerConnection에 추가
    ↓
모든 peer에게 track 업데이트 전송
    ↓
↓ 상대방이 화면을 봄
    ↓
사용자 "공유 중지" 클릭
    ↓
화면 트랙 제거
    ↓
카메라 트랙 다시 추가
    ↓
↓ 상대방이 카메라로 복구됨
```

## 🔐 보안 고려사항

| 항목 | 대책 |
|------|------|
| **API 키 노출** | 환경변수 사용, 백엔드에서만 스토어 |
| **CORS 공격** | FRONTEND_URL 환경변수로 제한 |
| **WebRTC 암호화** | DTLS + SRTP 자동 적용 |
| **채팅 인젝션** | Text escape (HTML 특수문자 처리) |
| **과도한 메시지** | 클라이언트/서버 속도 제한 (미구현) |

## 📊 성능 최적화

### 대역폭 사용

| 항목 | 대략 사용량 |
|------|-----------|
| 1:1 비디오 (720p) | 1-3 Mbps |
| 1:1 비디오 (480p) | 500 Kbps - 1.5 Mbps |
| 1:1 음성만 | 20-100 Kbps |
| 5인 회의 | 5-15 Mbps (총) |
| 화면 공유 | 1-4 Mbps |
| 채팅 메시지 | ~1 KB/메시지 |

### 메모리 사용

```
1인 기준:
├─ LocalStream: ~50 MB (비디오 버퍼)
├─ RemoteStream (1명당): ~50 MB
├─ RTCPeerConnection: ~10 MB
├─ Socket.IO 버퍼: ~5 MB
└─ Total per peer: ~115 MB

10명 회의:
└─ Total: ~1.15 GB (예상)
```

## 🚀 배포 아키텍처

### 프로덕션 환경

```
┌─────────────────────────────────────────────┐
│         End Users (Global)                   │
└────────────────────┬────────────────────────┘
                     │
        ┌────────────┴────────────┐
        ↓                         ↓
  ┌──────────────┐         ┌──────────────┐
  │   Vercel     │         │   Render     │
  │ (Frontend)   │         │  (Backend)   │
  │              │         │              │
  │ ├─ index.html│         │ ├─ server.js │
  │ ├─ client.js │         │ ├─ Node.js   │
  │ └─ styles.css│         │ └─ Express   │
  │              │         │              │
  │ Region: US   │         │ Region: US   │
  │ CDN: Global  │         │ Auto-scaling │
  └──────┬───────┘         └──────┬───────┘
         │                        │
         └────────────┬───────────┘
                      │
            (REST API + WebSocket)
                      │
         ┌────────────┴────────────┐
         ↓                         ↓
     OpenAI API              STUN Servers
     (Chat GPT)              (Google/Amazon)
```

---

**이 아키텍처는 프로덕션 환경에서 안정적으로 운영 가능하도록 설계되었습니다.**
    name: 'User A',
    room: 'ROOM-ABC123'
  }
}
```

## 🎨 UI 계층

### 화면 전환

```
┌───────────────┐
│ 로그인 화면     │
│ (회의 ID 입력) │
└───────┬───────┘
        │ 참여
        ↓
┌───────────────────────────────────────────┐
│         회의 화면                          │
├─────────────────────┬──────────────────┐  │
│                     │                  │  │
│   비디오 그리드     │   사이드바        │  │
│  (비디오 타일들)    │ ┌────────────┐  │  │
│                     │ │ 참여자 탭   │  │  │
│                     │ │ - User A   │  │  │
│                     │ │ - User B   │  │  │
│                     │ │ - User C   │  │  │
│                     │ ├────────────┤  │  │
│                     │ │ 채팅 탭     │  │  │
│                     │ │ [메시지들] │  │  │
│                     │ └────────────┘  │  │
│                     │                  │  │
└─────────────────────┴──────────────────┘  │
│  제어 바 (카메라, 마이크, 화면공유, 종료) │
└───────────────────────────────────────────┘
```

### 화면 공유 레이아웃 전환

```
정상 모드:                 화면 공유 모드:
┌─────────────────┐      ┌─────────────────┐
│  비디오 그리드   │      │  화면 공유 영역  │
│  (타일 형식)     │  →   │  (전체 크기)    │
│                 │      │                 │
│                 │      │ ┌──────────┐    │
│                 │      │ │비디오걸  │    │
│                 │      │ │(우측하단)│    │
└─────────────────┘      └──────────────┘
```

## 💾 상태 관리 (클라이언트)

### 전역 상태 객체

```javascript
state = {
  // 연결
  socket: SocketIO,
  roomId: 'ROOM-ABC123',
  userName: 'User A',
  
  // 미디어
  localStream: MediaStream,
  screenStream: MediaStream,
  isVideoEnabled: boolean,
  isAudioEnabled: boolean,
  isScreenSharing: boolean,
  
  // 원격 연결
  peerConnections: {
    'socket-id-2': RTCPeerConnection,
    'socket-id-3': RTCPeerConnection,
    ...
  },
  
  // 원격 사용자
  remoteUsers: {
    'socket-id-2': {
      stream: MediaStream,
      name: 'User B',
      videoElement: HTMLVideoElement
    },
    ...
  },
  
  // 화면 공유
  currentScreenShareUserId: 'socket-id-2'
}
```

## 🔄 이벤트 플로우

### 사용자 입장 시

```
1. 신규 사용자: join-room 이벤트 발생
2. 서버: 기존 사용자에게 user-joined 알림
3. 기존 사용자: 신규 사용자를 위해 offer 생성
4. 신규 사용자: offer 받음 → answer 생성
5. 기존 사용자: answer 받음
6. 양쪽: ICE 후보 교환
7. WebRTC 연결 수립
```

### 채팅 메시지 전송

```
User A: 메시지 입력 → send-message 이벤트
                         ↓
                    Socket.IO Server
                         ↓
                   receive-message 이벤트
                    (모든 방 참여자)
                         ↓
              User A, B, C: 채팅 UI 업데이트
```

### 화면 공유

```
사용자 A: 화면 공유 클릭
    ├─ getDisplayMedia() API 호출
    ├─ 사용자가 공유할 화면 선택
    ├─ start-screen-share 이벤트 (Socket.IO)
    ├─ 비디오 트랙을 WebRTC로 전송 (replaceTrack)
    └─ 모든 피어에게 전달
           ↓
    사용자 B, C: 화면 공유 영역 표시
           ↓
사용자 A: 화면 공유 종료
    ├─ 원본 카메라 스트림으로 복구 (replaceTrack)
    ├─ stop-screen-share 이벤트
    └─ 모든 사용자 UI 업데이트
```

## 🔐 보안 고려사항

### 현재 구현
- ✅ 같은 로컬 네트워크 (localhost)에서 안전
- ✅ STUN 서버 사용 (Google 제공)

### 프로덕션 추가 필요
- [ ] HTTPS/SSL 적용
- [ ] TURN 서버 설정 (인증 필요)
- [ ] 사용자 인증/권한 관리
- [ ] Rate limiting (DDoS 방지)
- [ ] 입력 검증 및 새니타이제이션
- [ ] 방 암호 설정
- [ ] 메시지 암호화

## 📊 성능 최적화

### 메모리 최적화
```javascript
// 1. 차단된 연결 정리
peerConnection.onconnectionstatechange = () => {
  if (pc.connectionState === 'disconnected') {
    pc.close(); // 정리
    delete peerConnections[userId];
  }
}

// 2. 불필요한 미디어 정지
if (!videoEnabled) {
  localStream.getVideoTracks().forEach(t => t.enabled = false);
}
```

### 네트워크 최적화
```javascript
// 1. 비디오 해상도 조절
const constraints = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 24 }
  }
}

// 2. 적응형 비트레이트 (future enhancement)
// WebRTC RTCRtpSender.getStats() 모니터링
```

### UI 최적화
```javascript
// 1. 가상 스크롤 (많은 참여자)
// 보이는 영역만 렌더링

// 2. 이벤트 위임
// 개별 리스너 대신 중앙 이벤트 핸들러

// 3. 레이아웃 스래싱 방지
// requestAnimationFrame으로 배치 업데이트
```

## 🔍 디버깅 팁

### 브라우저 개발자 도구

```javascript
// WebRTC 통계 확인
pc.getStats().then(report => {
  report.forEach(stats => {
    console.log(stats.type, stats);
  });
});

// 시그널링 이벤트 확인
socket.on('*', (event) => {
  console.log('Socket event:', event);
});

// 로컬 스트림 상태
console.log(localStream.getTracks());
console.log(localStream.active);
```

### Chrome WebRTC 통계
- `chrome://webrtc-internals` 접속
- 그래프로 실시간 연결 상태 모니터링
- 각 피어 연결의 상세 정보 확인

## 📈 확장성 고려

### 현재 제한
- 메모리에만 저장 (재시작 시 초기화)
- 단일 서버 (확장 불가)

### 향후 개선
1. **데이터베이스 추가**
   - 회의 히스토리 저장
   - 사용자 정보 저장

2. **로드 밸런싱**
   - 여러 서버 인스턴스
   - Redis를 통한 Socket.IO 클러스터링

3. **마이크로서비스**
   - 시그널링 서버 분리
   - 미디어 서버 (TURN/SFU) 분리

## 🚀 프로덕션 배포 체크리스트

- [ ] HTTPS 인증서 설정
- [ ] 환경 변수 관리 (.env)
- [ ] 에러 로깅 (예: Winston, Sentry)
- [ ] 성능 모니터링 (예: New Relic)
- [ ] 백업 및 복구 전략
- [ ] 부하 테스트
- [ ] 보안 감시
- [ ] 스케일링 계획 수립

---

**ViBe는 확장 가능한 기반 위에 구축되었습니다!** 🚀
