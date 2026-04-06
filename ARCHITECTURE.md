# ViBe 아키텍처 및 기술 깊이 분석

## 🏗️ 시스템 아키텍처

### 전체 구조
```
┌─────────────────────────────────────────────────────┐
│                  Web Browsers (Clients)              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │ User A  │  │ User B  │  │ User C  │  │ User D  │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘ │
└───────┼───────────────┼───────────┼───────────┼────────┘
        │ WebRTC (P2P)  │ WebRTC    │ WebRTC    │
        │ + Socket.IO   │ (P2P)     │ (P2P)     │
        └───────┬───────┴───────────┴───────────┘
                │
┌───────────────┴────────────────────────────────────┐
│           Node.js Server (localhost:3000)          │
│  ┌────────────────────────────────────────────┐   │
│  │         Express.js Web Server              │   │
│  │  └──────── static files ────────────────┐  │   │
│  └────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────┐   │
│  │     Socket.IO (Signaling Server)           │   │
│  │  └──────── signal processing ───────────┐  │   │
│  │  └─── room & user management ────────┐   │   │
│  │  └─── chat broadcast ──────────────┐  │   │   │
│  │  └─── screen share events ───────┐  │   │   │
│  └────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

## 📡 통신 프로토콜

### 1. WebRTC (미디어 스트리밍)
- **타입**: P2P (피어 투 피어)
- **프로토콜**: UDP (음성/영상), ICE (NAT 트래버설)
- **용도**: 비디오/오디오 직접 전송
- **특성**: 서버 거치지 않음, 고대역폭, 낮은 지연

### 2. Socket.IO (시그널링 & 제어)
- **타입**: Client-Server 기반
- **프로토콜**: HTTP/WebSocket + TCP
- **용도**: 
  - SDP (Session Description) 교환
  - ICE 후보 전달
  - 채팅 메시지 브로드캐스트
  - 사용자 상태 알림
- **특성**: 신뢰성 있는 전달 필요

```
Socket.IO 메시지 흐름:

┌──────────────┐
│   User A     │
└────────┬─────┘
         │ "join-room"
         │ {roomId, userName}
         ↓
    ┌─────────┐
    │ Server  │
    └────┬────┘
         │ "user-joined" (브로드캐스트)
         │
    ┌────┴──────────┫
    ↓                ↓
┌──────────┐    ┌──────────┐
│ User B   │    │ User C   │
└──────────┘    └──────────┘
(알림 표시)
```

## 🎯 WebRTC 연결 프로세스

### 1. 초기 연결 수립

```
User A (Offerer)           Server              User B (Answerer)
      │                       │                      │
      │──────join-room───────>│                      │
      │                 user-joined event            │
      │                       │<────existing-users───│
      │<──────existing-users──│                      │
      │                       │                      │
      ├─ RTCPeerConnection 생성
      ├─ localStream 추가
      ├─ createOffer() 호출
      │
      │───── socket.emit('offer')──────────────>
      │                       │──────offer───────>
      │                       │                      │
      │                       │         ├─ RTCPeerConnection 생성
      │                       │         ├─ addTrack(remoteStream)
      │                       │         ├─ setRemoteDescription
      │                       │         ├─ createAnswer()
      │                       │
      │<─ socket.emit('answer')──────────────────
      │                       │<─────answer────
      │
      ├─ setRemoteDescription(answer)
      │
      ├─────── ICE Candidates 교환 ────────>
      │<───────────────────────────────────
      │
      ├─ ontrack 이벤트: remoteStream 수신
      │
      └═════════ WebRTC Data Channel 확립 ════════>
```

### 2. 상태 머신

```
STABLE
  ↓
HAVE_LOCAL_OFFER ───> HAVE_REMOTE_PRANSWER
  ↓
HAVE_REMOTE_ANSWER
  ↓
STABLE (연결 완료)

ICE 상태:
NEW → CHECKING → CONNECTED → COMPLETED (완료)
       ↓ (실패)
     FAILED
```

## 🌐 방(Room) 관리

### 서버 메모리 구조

```javascript
rooms = {
  'ROOM-ABC123': {
    id: 'ROOM-ABC123',
    users: [
      { id: 'socket-id-1', name: 'User A' },
      { id: 'socket-id-2', name: 'User B' },
      { id: 'socket-id-3', name: 'User C' }
    ],
    createdAt: 1234567890
  },
  'ROOM-XYZ789': {
    id: 'ROOM-XYZ789',
    users: [...]
  }
}

users = {
  'socket-id-1': {
    id: 'socket-id-1',
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
