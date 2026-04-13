import express from 'express';
import http from 'http';
import { Server as socketIo } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// CORS 검사 함수 (로컬 내부 IP도 허용)
function isOriginAllowed(origin) {
  // origin이 없으면 허용 (개발 도구 실행 시)
  if (!origin) {
    return true;
  }

  // 화이트리스트 도메인
  const allowedDomains = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://qbridge-classroom.netlify.app',
    process.env.FRONTEND_URL
  ].filter(Boolean);

  // 정확한 매칭
  if (allowedDomains.includes(origin)) {
    return true;
  }

  // 로컬 네트워크 IP 패턴 매칭 (192.168.*, 10.*, 172.16-31.*)
  const localNetworkPattern = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.).*:5173$/;
  if (localNetworkPattern.test(origin)) {
    return true;
  }
  
  const localNetworkPattern2 = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.).*:3000$/;
  if (localNetworkPattern2.test(origin)) {
    return true;
  }

  return false;
}

// CORS 허용 도메인 설정
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://qbridge-classroom.netlify.app',
  process.env.FRONTEND_URL
].filter(Boolean);

const io = new socketIo(server, {
  cors: {
    origin: function(origin, callback) {
      // origin 없이 요청 (개발 도구 실행)
      if (!origin) {
        console.log('✅ CORS: origin 없음 (localhost 개발 도구)');
        callback(null, true);
        return;
      }
      
      // 허용된 출처인지 확인
      if (isOriginAllowed(origin)) {
        console.log(`✅ CORS 통과: ${origin}`);
        callback(null, true);
      } else {
        console.warn(`⚠️ CORS 차단: ${origin}`);
        // 개발 모드: 차단하지 않음 / 프로덕션: 차단
        if (process.env.NODE_ENV === 'development') {
          console.log('   → 개발 모드이므로 허용합니다');
          callback(null, true);
        } else {
          callback(new Error('CORS blocked: Origin not allowed'));
        }
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
    allowEIO3: true  // ✅ Engine.IO v3 호환성 (구형 클라이언트 지원)
  },
  transports: ['websocket', 'polling']  // ✅ WebSocket 우선, 포톨백 폴링
});

app.use(cors({
  origin: function(origin, callback) {
    // origin 없이 요청 (curl, Postman 등)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // 허용된 출처인지 확인
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ Express CORS 차단: ${origin}`);
      if (process.env.NODE_ENV === 'development') {
        callback(null, true);  // 개발 모드: 모든 요청 허용
      } else {
        callback(new Error('CORS blocked'));  // 프로덕션: 화이트리스트만 허용
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// 활성 사용자 저장소
const users = {};
const rooms = {};

// ✅ 익명 이름 생성 함수
function generateAnonymousName() {
  const verbs = [
    '재치있는', '활기찬', '뛰는', '춤추는', 
    '노래하는', '우는', '웃는', '조용한', '재빠른', '느린',
    '화난', '친절한', '장난치는', '새침한', '신나하는',
    '열정적인', '차분한', '용감한', '수줍은', '똑똑한',
    '멋진', '귀여운', '사나운', '행복한', '슬픈'
  ];
  
  const animals = [
    '호랑이', '사자', '곰', '토끼', '여우', '원숭이', '수달', '참새', 
    '독수리', '펭귄', '고양이', '개', '돼지', '소', '말', '양', '닭',
    '오리', '거북이', '뱀', '악어', '사슴', '기린', '얼룩말', '고래',
    '코알라', '캥거루', '코끼리', '판다', '라쿤', '스컹크', '미어캣', '낙타',
    '코뿔소', '하마', '물개', '해달', '펠리컨', '타조', '앵무새', '까마귀'
  ];
  
  const verb = verbs[Math.floor(Math.random() * verbs.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  
  return `${verb} ${animal}`;
}

// ✅ 모든 참여자 출석 체크 완료 여부
function areAllAttendanceChecked(room) {
  // 강의자 제외한 모든 참여자가 출석 상태를 가져야 함
  const nonInstructorUsers = room.users.filter(u => u.id !== room.instructorId);
  return nonInstructorUsers.length > 0 && nonInstructorUsers.every(u => u.attendance !== null);
}

// ========== API Routes ==========
// Question Refinement API Endpoint
app.post('/api/refine-question', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: '질문을 입력해주세요' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API 키가 설정되지 않았습니다' });
    }

    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `너는 실시간 강의 중 학생의 질문을 다듬어주는 조수야.

          학생은 자신의 질문이 맞는지 확신하지 못한 채로 질문을 작성하는 경우가 많아.
          너의 역할은 학생이 말하려는 핵심 의도를 파악하고, 강의자가 어떤 개념이나 포인트에 대해 묻는지 바로 이해할 수 있도록 질문을 정제하는 거야.

          다듬을 때 지켜야 할 원칙:

          1. 학생의 원래 의도와 궁금증을 절대 바꾸지 마
          2. 모호한 표현은 구체적으로 바꾸되, 학생이 말하지 않은 내용을 임의로 추가하지 마
          3. 강의자 입장에서 "무엇을 묻는 질문인지" 한눈에 파악되도록 작성해
          4. 간결하고 명확한 문장으로 다듬어줘
          5. 오직 다듬어진 **질문**만 반환해. 설명, 인사, 부연 설명 없이 질문 텍스트만 반환해`
        },
        {
          role: 'user',
          content: `다음 질문을 논리적으로 정리해서 다듬어진 질문으로 만들어줘:\n\n${question}`
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // ✅ 응답 유효성 체크
    if (!response.data || !response.data.choices || !response.data.choices[0]) {
      console.error('❌ OpenAI 응답 형식 오류:', response.data);
      return res.status(500).json({ 
        error: 'OpenAI 응답 형식 오류',
        details: 'choices 배열이 없습니다'
      });
    }

    const refinedQuestion = response.data.choices[0].message.content.trim();
    console.log(`✅ 질문 다듬기 성공: "${question}" → "${refinedQuestion}"`);
    res.json({ refinedQuestion });

  } catch (error) {
    console.error('❌ 질문 다듬기 API 오류:');
    console.error('   - 에러 메시지:', error.message);
    console.error('   - 에러 코드:', error.code);
    
    // OpenAI API 에러
    if (error.response) {
      console.error('   - API 상태 코드:', error.response.status);
      console.error('   - API 응답:', error.response.data);
    }
    
    // axios 요청 오류
    if (error.request && !error.response) {
      console.error('   - 요청 전송됨, 응답 없음');
      console.error('   - URL:', error.request.url || 'N/A');
    }
    
    res.status(500).json({ 
      error: '질문 다듬기 중 오류가 발생했습니다',
      details: error.response?.data?.error?.message || error.message,
      type: error.response ? 'OpenAI API 오류' : 'Network 오류'
    });
  }
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'ViBe Backend is running' });
});

// ========== Socket.IO Events ==========
io.on('connection', (socket) => {
  console.log(`✅ 새로운 사용자 연결: ${socket.id}`);

  // 🔴 모든 이벤트 디버깅
  socket.onAny((eventName, ...args) => {
    console.error(`🔴 [모든 이벤트] ${eventName}:`, args);
  });

  // 사용자 등록
  socket.on('register-user', (userData) => {
    users[socket.id] = {
      id: socket.id,
      name: userData.name,
      room: userData.room
    };
    console.log(`👤 사용자 등록: ${userData.name} (${socket.id})`);
  });

  // 방에 참여
  // ✅ 방 입장 전 검증 (참여 버튼용)
  socket.on('validate-room', (data, callback) => {
    const { roomId, isJoining } = data;

    // ✅ "참여" 버튼인 경우: 기존 방이 반드시 존재해야 함
    if (isJoining && !rooms[roomId]) {
      console.error(`❌ [방 검증 실패] 방을 찾을 수 없습니다: ${roomId}`);
      
      socket.emit('room-validation', {
        error: true,
        message: `방을 찾을 수 없습니다. (방 ID: ${roomId})`
      });
      return;
    }

    // ✅ 검증 성공
    console.log(`✅ [방 검증] 방 존재: ${roomId}`);
    socket.emit('room-validation', {
      error: false,
      message: '방 검증 성공'
    });
  });

  socket.on('join-room', (data, callback) => {
    const { roomId, userName, isJoining } = data;

    // ✅ "참여" 버튼인 경우: 기존 방이 반드시 존재해야 함 (재검증)
    if (isJoining && !rooms[roomId]) {
      console.error(`❌ [참여 실패] 방을 찾을 수 없습니다: ${roomId}`);
      
      // ✅ 클라이언트에 에러 콜백 응답
      if (callback && typeof callback === 'function') {
        callback({
          error: true,
          message: `방을 찾을 수 없습니다. (방 ID: ${roomId})`
        });
      }
      return;
    }

    // ✅ "강의실 생성"인 경우: 새 방 생성
    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        users: [],
        instructorId: socket.id,
        createdAt: Date.now(),
        attendanceChecked: false
      };
      console.log(`📍 새 방 생성: ${roomId}, 강의자: ${socket.id}`);
    }

    socket.join(roomId);

    rooms[roomId].users.push({
      id: socket.id,
      name: userName,
      isInstructor: rooms[roomId].instructorId === socket.id,
      attendance: null,  // ✅ 출석 상태: null (미체크), 'present' (출석), 'late' (지각), 'absent' (결석)
      isVideoEnabled: true,  // ✅ 카메라 상태
      isAudioEnabled: true   // ✅ 마이크 상태
    });

    // ✅ 수정: 새로운 참여자(강의자 아님)가 들어오면 출석 상태 리셋
    if (rooms[roomId].instructorId !== socket.id) {
      rooms[roomId].attendanceChecked = false;
      console.log(`[출석 리셋] 새로운 학생이 입장했으므로 출석 상태 리셋: ${roomId}`);
    }

    console.log(`🚪 사용자 합류: ${userName}(${socket.id})이 방 ${roomId}에 입장, 강의자: ${rooms[roomId].instructorId === socket.id}`);

    // 방의 다른 사용자들에게 새 사용자 입장 알림
    socket.broadcast.to(roomId).emit('user-joined', {
      userId: socket.id,
      userName: userName,
      isInstructor: rooms[roomId].instructorId === socket.id,
      isVideoEnabled: true,  // ✅ 미디어 상태 추가
      isAudioEnabled: true,  // ✅ 미디어 상태 추가
      totalUsers: rooms[roomId].users.length
    });

    // ✅ 성공 응답 콜백
    if (callback && typeof callback === 'function') {
      callback({
        error: false,
        message: '방 입장 성공',
        users: rooms[roomId].users.filter(u => u.id !== socket.id),
        isUserInstructor: rooms[roomId].instructorId === socket.id
      });
    }

    // 새 사용자에게 기존 사용자 목록 전송 (레거시 코드 호환성)
    socket.emit('existing-users', {
      users: rooms[roomId].users.filter(u => u.id !== socket.id),
      isUserInstructor: rooms[roomId].instructorId === socket.id,
      totalUsers: rooms[roomId].users.length
    });
  });

  // ✅ 출석 체크 이벤트
  socket.on('check-attendance', (data) => {
    const { roomId, userId, status } = data; // status: 'present', 'late', 'absent'
    
    if (!rooms[roomId]) {
      console.error(`[출석 체크] 방을 찾을 수 없습니다: ${roomId}`);
      return;
    }

    // 현재 사용자가 강의자인지 확인
    if (rooms[roomId].instructorId !== socket.id) {
      console.warn(`[출석 체크] 강의자만 출석 체크 가능: ${socket.id}`);
      return;
    }

    // 대상 사용자 찾기
    const user = rooms[roomId].users.find(u => u.id === userId);
    if (user) {
      user.attendance = status;
      console.log(`✅ 출석 체크: ${user.name} - ${status}`);

      // ✅ 추가 로깅: 출석 상태 확인
      const attendanceStatus = rooms[roomId].users
        .filter(u => u.id !== rooms[roomId].instructorId)
        .map(u => ({ name: u.name, attendance: u.attendance }));
      console.log(`[출석 상태] ${JSON.stringify(attendanceStatus)}`);

      // ✅ 수정: 출석 체크는 상태만 업데이트하고, 익명 모드는 버튼 클릭시에만 활성화!
      // 더 이상 여기서 자동으로 익명 모드를 활성화하지 않음

      // 강의자에게 출석 현황 업데이트
      io.to(roomId).emit('attendance-updated', {
        userId: userId,
        status: status,
        users: rooms[roomId].users.map(u => ({
          id: u.id,
          name: u.name,
          attendance: u.attendance
        }))
      });
    }
  });

  // ✅ 익명 모드 활성화 이벤트 (버튼 클릭 시)
  console.log('✅ [시스템] activate-anonymous-mode 핸들러 등록됨 - socket:', socket.id);
  socket.on('activate-anonymous-mode', (data, callback) => {
    console.error('🔴 [DEBUG] activate-anonymous-mode 이벤트 수신됨!');
    console.error('📋 받은 데이터:', JSON.stringify(data));
    console.error('🔗 소켓 ID:', socket.id);
    
    const { roomId } = data;

    console.error(`[익명 모드] 방 검색: ${roomId}`);
    if (!rooms[roomId]) {
      console.error(`[익명 모드 활성화] 방을 찾을 수 없습니다: ${roomId}`);
      console.error(`[디버그] 현재 rooms 키:`, Object.keys(rooms));
      if (callback) callback('Room not found');
      return;
    }

    console.error(`[익명 모드] 강의자 확인: ${rooms[roomId].instructorId} vs ${socket.id}`);
    // 현재 사용자가 강의자인지 확인
    if (rooms[roomId].instructorId !== socket.id) {
      console.warn(`[익명 모드 활성화] 강의자만 활성화 가능: ${socket.id}`);
      if (callback) callback('Only instructor can activate anonymous mode');
      return;
    }

    console.log(`🎭 익명 모드 활성화 (버튼): ${roomId}`);
    rooms[roomId].attendanceChecked = true;

    // 각 학생(강의자 제외)에게 익명 이름 할당
    rooms[roomId].users.forEach(u => {
      if (u.id !== rooms[roomId].instructorId) {
        u.anonymousName = generateAnonymousName();
        console.log(`[익명명 생성] ${u.name} → ${u.anonymousName}`);
      }
    });

    // 모든 클라이언트에게 익명 모드 활성화 알림
    const usersToSend = rooms[roomId].users.map(u => ({
      id: u.id,
      name: u.isInstructor ? u.name : u.anonymousName,
      isInstructor: u.isInstructor
    }));

    console.log(`[익명화 전송 데이터]:`, JSON.stringify(usersToSend, null, 2));

    io.to(roomId).emit('anonymous-mode-activated', {
      roomId: roomId,
      users: usersToSend
    });
    
    console.log(`[익명 모드] 모든 클라이언트에 전송됨`);
    
    // ✅ 클라이언트에 콜백 응답 전송
    if (callback) {
      callback(null);
    }
  });

  // WebRTC SDP 제안 처리
  socket.on('offer', (data) => {
    const { to, offer, from, fromName } = data;
    
    try {
      if (!to || !offer) {
        console.error('❌ Offer 전송 오류: 필수 필드 누락', { to, from });
        return;
      }

      // ✅ 서버에서 강의자 여부 직접 확인 (클라이언트 값 검증)
      let roomId = null;
      for (const rid in rooms) {
        if (rooms[rid].users.find(u => u.id === from)) {
          roomId = rid;
          break;
        }
      }
      
      const isFromInstructor = roomId && rooms[roomId] && rooms[roomId].instructorId === from;

      // ✅ 다른 네트워크 사용자를 위한 상세 로깅
      console.log(`📤 Offer 전송 시작:`);
      console.log(`   - From: ${from} (${fromName}, 강의자: ${isFromInstructor})`);
      console.log(`   - To: ${to}`);
      console.log(`   - Offer SDP 길이: ${offer.sdp ? offer.sdp.length : 0}bytes`);
      
      io.to(to).emit('offer', {
        from: from,
        fromName: fromName,
        fromIsInstructor: isFromInstructor,  // ✅ 서버에서 검증한 값만 전송
        offer: offer,
        timestamp: Date.now()  // ✅ 타임스탬프 추가 (연결 지연 측정용)
      });

      console.log(`✅ Offer 전송 완료: ${from} -> ${to}`);
    } catch (error) {
      console.error('❌ Offer 처리 오류:', error.message);
    }
  });

  // WebRTC SDP 응답 처리
  socket.on('answer', (data) => {
    const { to, answer, from } = data;
    
    try {
      if (!to || !answer) {
        console.error('❌ Answer 전송 오류: 필수 필드 누락', { to, from });
        return;
      }

      // ✅ 다른 네트워크 사용자를 위한 상세 로깅
      console.log(`📥 Answer 전송 시작:`);
      console.log(`   - From: ${from}`);
      console.log(`   - To: ${to}`);
      console.log(`   - Answer SDP 길이: ${answer.sdp ? answer.sdp.length : 0}bytes`);

      io.to(to).emit('answer', {
        from: from,
        answer: answer,
        timestamp: Date.now()  // ✅ 타임스탬프 추가
      });

      console.log(`✅ Answer 전송 완료: ${from} -> ${to}`);
    } catch (error) {
      console.error('❌ Answer 처리 오류:', error.message);
    }
  });

  // ICE 후보 처리 (다른 네트워크 환경에서 중요)
  socket.on('ice-candidate', (data) => {
    const { to, candidate, from } = data;
    
    try {
      if (!to || !candidate) {
        console.error('❌ ICE 후보 전송 오류: 필수 필드 누락', { to, from });
        return;
      }

      // ✅ ICE 후보 유형별 로깅 (진단용)
      const candidateType = candidate.candidate ? candidate.candidate.split(' ')[7] : 'unknown';
      console.log(`🧊 ICE 후보 전송: ${from} -> ${to} (타입: ${candidateType})`);

      io.to(to).emit('ice-candidate', {
        from: from,
        candidate: candidate,
        timestamp: Date.now()  // ✅ 타임스탐프 추가
      });
    } catch (error) {
      console.error('❌ ICE 후보 처리 오류:', error.message);
    }
  });

  // 화면 공유 시작
  socket.on('start-screen-share', (data) => {
    const { roomId, userName } = data;
    socket.broadcast.to(roomId).emit('user-started-screen-share', {
      userId: socket.id,
      userName: userName
    });
    console.log(`🖥️ 화면 공유 시작: ${userName}`);
  });

  // 화면 공유 종료
  socket.on('stop-screen-share', (data) => {
    const { roomId } = data;
    socket.broadcast.to(roomId).emit('user-stopped-screen-share', {
      userId: socket.id
    });
    console.log(`🖥️ 화면 공유 종료: ${socket.id}`);
  });

  // 채팅 메시지
  socket.on('send-message', (data) => {
    const { roomId, message, userName, timestamp, imageData } = data;
    
    // 서버에서 직접 강의자 여부 확인
    const room = rooms[roomId];
    const isInstructor = room && room.instructorId === socket.id;
    
    // ✅ 클라이언트 타임스탬프 사용, 없으면 서버 시간 사용
    const messageTimestamp = timestamp || Date.now();
    
    console.log(`[채팅 디버그] roomId: ${roomId}, socketId: ${socket.id}, instructorId: ${room?.instructorId}, isInstructor: ${isInstructor}, timestamp: ${messageTimestamp}`);
    
    io.to(roomId).emit('receive-message', {
      userId: socket.id,
      userName: userName,
      message: message,
      timestamp: messageTimestamp,  // ✅ 밀리초 숫자로 전송
      isInstructor: isInstructor,
      imageData: imageData
    });
    console.log(`💬 메시지: ${userName} - ${message}${isInstructor ? ' [강의자]' : ''}${imageData ? ' [이미지]' : ''}`);
  });

  // 방에서 나가기
  socket.on('leave-room', (data) => {
    const { roomId, userName } = data;

    socket.leave(roomId);

    if (rooms[roomId]) {
      const isInstructor = rooms[roomId].instructorId === socket.id;
      
      rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);

      if (isInstructor) {
        // ✅ 강의자가 나가면 방 폐쇄
        io.to(roomId).emit('room-closed', {
          reason: '강의자가 나갔습니다',
          message: `강의자 "${userName}"이 나갔습니다. 방이 폐쇄되고 모든 참여자가 강제 퇴장됩니다.`
        });
        
        console.log(`🔴 [강의자 퇴장] 방 폐쇄: ${roomId} (강의자: ${userName})`);
        
        // ✅ 방 삭제
        delete rooms[roomId];
      } else {
        // ✅ 강의자가 아니면 일반 퇴장 이벤트
        socket.broadcast.to(roomId).emit('user-left', {
          userId: socket.id,
          userName: userName,
          totalUsers: rooms[roomId].users.length
        });

        console.log(`📊 방 ${roomId}: ${userName} 퇴장, 남은 사용자 ${rooms[roomId] ? rooms[roomId].users.length : 0}명`);

        // 방이 비워지면 삭제
        if (rooms[roomId].users.length === 0) {
          console.log(`🗑️ 방 삭제 (모두 나감): ${roomId}`);
          delete rooms[roomId];
        }
      }
    }

    console.log(`👋 사용자 퇴장: ${userName}`);
  });

  // 사용자 이름 변경
  socket.on('username-changed', (data) => {
    const { roomId, userId, newName } = data;
    
    if (rooms[roomId]) {
      const user = rooms[roomId].users.find(u => u.id === userId);
      if (user) {
        const oldName = user.name;
        user.name = newName;
        
        // 같은 방의 다른 사용자들에게 이름 변경 알림
        io.to(roomId).emit('user-renamed', {
          userId: userId,
          oldName: oldName,
          newName: newName
        });
        
        console.log(`✏️ 사용자 이름 변경: ${oldName} → ${newName}`);
      }
    }
  });

  // ✅ 사용자 미디어 상태 변경 (마이크/카메라)
  socket.on('user-media-state-change', (data) => {
    const { roomId, userId, userName, isVideoEnabled, isAudioEnabled } = data;
    
    console.log(`📱 ${userName}의 미디어 상태 변경: 카메라=${isVideoEnabled}, 마이크=${isAudioEnabled}`);
    
    // ✅ Backend에서 사용자 상태 업데이트
    if (rooms[roomId]) {
      const user = rooms[roomId].users.find(u => u.id === userId);
      if (user) {
        user.isVideoEnabled = isVideoEnabled;
        user.isAudioEnabled = isAudioEnabled;
      }
    }
    
    // 같은 방의 모든 사용자에게 알림
    io.to(roomId).emit('user-media-state-changed', {
      userId: userId,
      userName: userName,
      isVideoEnabled: isVideoEnabled,
      isAudioEnabled: isAudioEnabled
    });
  });

  // ❓ 퀴즈 출제 (quiz-created 이벤트)
  socket.on('quiz-created', (data) => {
    const { roomId, question, correctAnswer, quizId, quizNumber } = data;
    
    if (!rooms[roomId]) {
      console.log(`❌ 방을 찾을 수 없습니다: ${roomId}`);
      return;
    }
    
    // 현재 퀴즈 저장
    if (!rooms[roomId].quizzes) {
      rooms[roomId].quizzes = [];
    }
    
    const quiz = {
      id: quizId || Date.now().toString(),  // ✅ 클라이언트의 quizId 사용
      question: question,
      correctAnswer: correctAnswer,
      quizNumber: quizNumber,  // ✅ 퀴즈 번호 저장
      createdBy: socket.id,
      answers: { O: [], X: [] },
      status: 'ongoing'  // ✅ 퀴즈 상태 추가 (진행중/종료)
    };
    
    rooms[roomId].quizzes.push(quiz);
    rooms[roomId].currentQuiz = quiz;
    
    console.log(`❓ 퀴즈 출제: 퀴즈 ${quizNumber} - "${question}" (정답: ${correctAnswer}) [ID: ${quiz.id}]`);
    
    // 모든 사용자에게 퀴즈 브로드캐스트
    io.to(roomId).emit('quiz-created', {
      quizId: quiz.id,  // ✅ quizId 포함
      question: question,
      correctAnswer: correctAnswer,
      quizNumber: quizNumber,  // ✅ 퀴즈 번호도 포함
      instructorName: socket.data?.userName || '강의자'
    });
  });

  // ❓ 퀴즈 응답 (quiz-answer 이벤트)
  socket.on('quiz-answer', (data) => {
    const { roomId, answer, userId, userName, quizId } = data;
    
    if (!rooms[roomId]) {
      console.log(`❌ 방을 찾을 수 없습니다: ${roomId}`);
      return;
    }
    
    // ✅ 수정: quizId로 특정 퀴즈 찾기 (currentQuiz만 사용하지 않기)
    let targetQuiz = null;
    
    if (quizId && rooms[roomId].quizzes) {
      targetQuiz = rooms[roomId].quizzes.find(q => q.id === quizId);
    }
    
    if (!targetQuiz) {
      console.log(`❌ 퀴즈를 찾을 수 없습니다: quizId=${quizId}, 저장된 quizzes=${JSON.stringify(rooms[roomId].quizzes ? rooms[roomId].quizzes.map(q => ({id: q.id, question: q.question.substring(0, 20)})) : [])}`);
      return;
    }

    // ✅ 퀴즈 상태 확인: 진행중만 응답 받음
    if (targetQuiz.status !== 'ongoing') {
      console.warn(`⚠️ [퀴즈 종료됨] 응답 거부: quizId=${quizId}, status=${targetQuiz.status}, userId=${userId}, userName=${userName}`);
      console.warn(`   - 이미 결과가 나온 퀴즈입니다. 더 이상 응답을 받지 않습니다.`);
      return;
    }
    
    console.log(`✅ 퀴즈 응답 처리 - quizId: ${quizId}, userId: ${userId}, userName: ${userName}, answer: ${answer}`);
    
    // ✅ 수정: 같은 userId의 이전 응답 제거 (중복 방지)
    if (targetQuiz.answers.O) {
      targetQuiz.answers.O = targetQuiz.answers.O.filter(r => r.userId !== userId);
    }
    if (targetQuiz.answers.X) {
      targetQuiz.answers.X = targetQuiz.answers.X.filter(r => r.userId !== userId);
    }
    
    console.log(`🔄 이전 응답 제거: ${userName} (userId: ${userId})`);
    
    // 새로운 응답 저장
    if (!targetQuiz.answers[answer]) {
      targetQuiz.answers[answer] = [];
    }
    
    targetQuiz.answers[answer].push({
      userId: userId,
      userName: userName,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ 퀴즈 응답 저장됨: ${userName} → ${answer}`);
    
    // 모든 사용자에게 응답 업데이트 전송 (broadcast)
    const oCount = targetQuiz.answers.O ? targetQuiz.answers.O.length : 0;
    const xCount = targetQuiz.answers.X ? targetQuiz.answers.X.length : 0;
    
    console.log(`📊 현재 집계: O=${oCount}, X=${xCount} (quizId: ${quizId})`);
    
    io.to(roomId).emit('quiz-answer-updated', {
      userId: userId,
      userName: userName,
      answer: answer,
      oCount: oCount,
      xCount: xCount,
      totalAnswers: oCount + xCount,
      quizId: quizId  // ✅ 수정: 요청받은 quizId 전송
    });
    
    console.log(`📤 브로드캐스트 발송: roomId=${roomId}, quizId=${quizId}, O=${oCount}, X=${xCount}`);
  });

  // ❓ 퀴즈 결과 요청 (quiz-results-request 이벤트)
  socket.on('quiz-results-request', (data) => {
    const { roomId } = data;
    const quizId = data.quizId;  // ✅ Frontend에서 보낸 quizId 사용
    
    if (!rooms[roomId]) {
      console.log(`❌ 방을 찾을 수 없습니다: ${roomId}`);
      return;
    }
    
    // ✅ 수정: 특정 quizId의 퀴즈 찾기 (출제 기록에서)
    let targetQuiz = rooms[roomId].currentQuiz;  // 기본: 현재 퀴즈
    
    if (quizId && rooms[roomId].quizzes) {
      const foundQuiz = rooms[roomId].quizzes.find(q => q.id === quizId);
      if (foundQuiz) {
        targetQuiz = foundQuiz;
        console.log(`🎯 해당 quizId의 퀴즈 찾음: ${quizId}`);
      }
    }
    
    if (!targetQuiz) {
      console.log(`❌ 진행 중인 퀴즈가 없습니다: ${roomId}`);
      return;
    }
    
    const oCount = targetQuiz.answers.O ? targetQuiz.answers.O.length : 0;
    const xCount = targetQuiz.answers.X ? targetQuiz.answers.X.length : 0;
    
    console.log(`📊 퀴즈 결과: quizId=${targetQuiz.id}, O=${oCount}, X=${xCount}, 정답=${targetQuiz.correctAnswer}`);

    // ✅ 퀴즈 상태를 'finished'로 변경 (더 이상 응답 받지 않음)
    targetQuiz.status = 'finished';
    console.log(`🔒 퀴즈 상태 변경: ${targetQuiz.id} → finished (결과 공개됨)`);
    
    // ✅ 수정: 모든 클라이언트에게 결과 전송 (강의자 + 학생 모두)
    io.to(roomId).emit('quiz-results-data', {
      quizId: targetQuiz.id,
      question: targetQuiz.question,
      correctAnswer: targetQuiz.correctAnswer,
      oCount: oCount,
      xCount: xCount,
      totalAnswers: oCount + xCount
    });
  });

  // 연결 해제 (다양한 네트워크 환경에 대한 상세 로깅)
  socket.on('disconnect', (reason) => {
    console.log(`\n❌ 사용자 연결 해제:`);
    console.log(`   - Socket ID: ${socket.id}`);
    console.log(`   - 연결 해제 사유: ${reason}`);
    console.log(`   - 연결된 시간: ${new Date(socket.handshake.issued).toISOString()}`);
    console.log(`   - 클라이언트 IP: ${socket.handshake.address}`);
    console.log(`   - User Agent: ${socket.handshake.headers['user-agent']?.substring(0, 50)}...\n`);

    // 모든 방에서 사용자 제거
    for (const roomId in rooms) {
      const userIndex = rooms[roomId].users.findIndex(u => u.id === socket.id);
      if (userIndex !== -1) {
        const userName = rooms[roomId].users[userIndex].name;
        const isInstructor = rooms[roomId].instructorId === socket.id;
        
        rooms[roomId].users.splice(userIndex, 1);

        // ✅ 강의자가 나가면 즉시 방 폐쇄
        if (isInstructor) {
          console.log(`🔴 [강의자 퇴장] 방 폐쇄: ${roomId} (강의자: ${userName})`);
          console.log(`   - 강제 퇴장 대상: ${rooms[roomId].users.length}명`);
          
          // ✅ 남아있는 모든 학생들에게 방 폐쇄 알림
          io.to(roomId).emit('room-closed', {
            reason: '강의자가 나갔습니다',
            message: `강의자 "${userName}"이 나갔습니다. 방이 폐쇄되고 모든 참여자가 강제 퇴장됩니다.`
          });
          
          console.log(`✅ 방 ${roomId}의 모든 참여자에게 강제 퇴장 신호 전송 완료`);
          
          // ✅ 방 삭제
          delete rooms[roomId];
        } else {
          // 강의자가 아닌 경우: 일반 user-left 이벤트 전송
          io.to(roomId).emit('user-left', {
            userId: socket.id,
            userName: userName,
            totalUsers: rooms[roomId] ? rooms[roomId].users.length : 0,
            reason: reason  // ✅ 연결 끊김 사유 전달 (클라이언트에서 UI 업데이트용)
          });

          console.log(`📊 방 ${roomId}: ${userName} 퇴장, 남은 사용자 ${rooms[roomId] ? rooms[roomId].users.length : 0}명`);

          // 방이 비어있으면 삭제
          if (rooms[roomId] && rooms[roomId].users.length === 0) {
            console.log(`🗑️ 방 삭제 (모두 나감): ${roomId}`);
            delete rooms[roomId];
          }
        }
      }
    }

    delete users[socket.id];
  });
});

// ========== Server Startup ==========
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const now = new Date().toISOString();
  console.log(`\n🚀 ViBe 비디오 강의실 시스템 시작: http://0.0.0.0:${PORT}`);
  console.log(`⏰ 시작 시간: ${now}\n`);
  console.log(`📍 API Health Check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`📍 Question Refinement API: POST http://0.0.0.0:${PORT}/api/refine-question\n`);
  console.log(`🔌 지원 Socket.IO 이벤트: register-user, join-room, check-attendance, activate-anonymous-mode, quiz-*\n`);
});
