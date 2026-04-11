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

// CORS 허용 도메인 설정
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://vibe-classroom.netlify.app',
  process.env.FRONTEND_URL
].filter(Boolean);

const io = new socketIo(server, {
  cors: {
    origin: function(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS blocked'));
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS blocked'));
    }
  },
  credentials: true
}));
app.use(express.json());

// 활성 사용자 저장소
const users = {};
const rooms = {};

// ✅ 익명 이름 생성 함수
function generateAnonymousName() {
  const verbs = [
    '뛰어다니는', '날아다니는', '헤엄치는', '기어가는', '뛰는', '춤추는', 
    '노래하는', '울음을 내는', '웃는', '조용한', '재빠른', '느린',
    '으르렁거리는', '친절한', '장난치는', '새침한', '신나하는'
  ];
  
  const animals = [
    '호랑이', '사자', '곰', '토끼', '여우', '원숭이', '수달', '참새', 
    '독수리', '펭귄', '고양이', '개', '돼지', '소', '말', '양', '닭',
    '오리', '거북이', '뱀', '악어', '사슴', '기린', '얼룩말'
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
      model: 'gpt-3.5-turbo',
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
          5. 오직 다듬어진 질문만 반환해. 설명, 인사, 부연 설명 없이 질문 텍스트만 반환해`
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

    const refinedQuestion = response.data.choices[0].message.content.trim();
    res.json({ refinedQuestion });

  } catch (error) {
    console.error('질문 다듬기 API 오류:', error.response?.data || error.message);
    res.status(500).json({ 
      error: '질문 다듬기 중 오류가 발생했습니다',
      details: error.response?.data?.error?.message || error.message
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
  socket.on('join-room', (data) => {
    const { roomId, userName } = data;

    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        users: [],
        instructorId: socket.id,
        createdAt: Date.now(),
        attendanceChecked: false  // ✅ 익명 모드 활성화 여부
      };
      console.log(`📍 새 방 생성: ${roomId}, 강의자: ${socket.id}`);
    }

    rooms[roomId].users.push({
      id: socket.id,
      name: userName,
      isInstructor: rooms[roomId].instructorId === socket.id,
      attendance: null  // ✅ 출석 상태: null (미체크), 'present' (출석), 'late' (지각), 'absent' (결석)
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
      totalUsers: rooms[roomId].users.length
    });

    // 새 사용자에게 기존 사용자 목록 전송
    socket.emit('existing-users', {
      users: rooms[roomId].users.filter(u => u.id !== socket.id),
      isUserInstructor: rooms[roomId].instructorId === socket.id
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
    const { to, offer, from, fromName, fromIsInstructor } = data;
    io.to(to).emit('offer', {
      from: from,
      fromName: fromName,
      fromIsInstructor: fromIsInstructor,
      offer: offer
    });
    console.log(`📤 Offer 전송: ${from} -> ${to}, 강의자: ${fromIsInstructor}`);
  });

  // WebRTC SDP 응답 처리
  socket.on('answer', (data) => {
    const { to, answer, from } = data;
    io.to(to).emit('answer', {
      from: from,
      answer: answer
    });
    console.log(`📥 Answer 전송: ${from} -> ${to}`);
  });

  // ICE 후보 처리
  socket.on('ice-candidate', (data) => {
    const { to, candidate, from } = data;
    io.to(to).emit('ice-candidate', {
      from: from,
      candidate: candidate
    });
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
    const { roomId, message, userName, imageData } = data;
    
    // 서버에서 직접 강의자 여부 확인
    const room = rooms[roomId];
    const isInstructor = room && room.instructorId === socket.id;
    
    console.log(`[채팅 디버그] roomId: ${roomId}, socketId: ${socket.id}, instructorId: ${room?.instructorId}, isInstructor: ${isInstructor}`);
    
    io.to(roomId).emit('receive-message', {
      userId: socket.id,
      userName: userName,
      message: message,
      timestamp: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }),
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
      rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== socket.id);

      socket.broadcast.to(roomId).emit('user-left', {
        userId: socket.id,
        userName: userName,
        totalUsers: rooms[roomId].users.length
      });

      // 방이 비워지면 삭제
      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
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

  // ❓ 퀴즈 출제 (quiz-created 이벤트)
  socket.on('quiz-created', (data) => {
    const { roomId, question, correctAnswer, quizId } = data;
    
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
      createdBy: socket.id,
      answers: { O: [], X: [] }
    };
    
    rooms[roomId].quizzes.push(quiz);
    rooms[roomId].currentQuiz = quiz;
    
    console.log(`❓ 퀴즈 출제: "${question}" (정답: ${correctAnswer}) [ID: ${quiz.id}]`);
    
    // 모든 사용자에게 퀴즈 브로드캐스트
    io.to(roomId).emit('quiz-created', {
      quizId: quiz.id,  // ✅ quizId 포함
      question: question,
      correctAnswer: correctAnswer,
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
    
    if (!rooms[roomId]) {
      console.log(`❌ 방을 찾을 수 없습니다: ${roomId}`);
      return;
    }
    
    const currentQuiz = rooms[roomId].currentQuiz;
    if (!currentQuiz) {
      console.log(`❌ 진행 중인 퀴즈가 없습니다: ${roomId}`);
      return;
    }
    
    const oCount = currentQuiz.answers.O ? currentQuiz.answers.O.length : 0;
    const xCount = currentQuiz.answers.X ? currentQuiz.answers.X.length : 0;
    
    console.log(`📊 퀴즈 결과: O=${oCount}, X=${xCount}`);
    
    // 강의자에게만 결과 전송
    socket.emit('quiz-results-data', {
      question: currentQuiz.question,
      oCount: oCount,
      xCount: xCount,
      totalAnswers: oCount + xCount
    });
  });

  // 연결 해제
  socket.on('disconnect', () => {
    console.log(`❌ 사용자 연결 해제: ${socket.id}`);

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
          
          // 남아있는 학생들에게 방 폐쇄 알림
          io.to(roomId).emit('room-closed', {
            reason: '강의자가 나갔습니다',
            message: `강의자 "${userName}"이 나갔습니다. 방이 폐쇄됩니다.`
          });
          
          // 방 삭제
          delete rooms[roomId];
        } else {
          // 강의자가 아닌 경우: 일반 user-left 이벤트 전송
          io.to(roomId).emit('user-left', {
            userId: socket.id,
            userName: userName,
            totalUsers: rooms[roomId] ? rooms[roomId].users.length : 0
          });

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
