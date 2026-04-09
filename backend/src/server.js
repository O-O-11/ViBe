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
const io = new socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// 활성 사용자 저장소
const users = {};
const rooms = {};

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
        createdAt: Date.now()
      };
      console.log(`📍 새 방 생성: ${roomId}, 강의자: ${socket.id}`);
    }

    rooms[roomId].users.push({
      id: socket.id,
      name: userName,
      isInstructor: rooms[roomId].instructorId === socket.id
    });

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

  // WebRTC SDP 제안 처리
  socket.on('offer', (data) => {
    const { to, offer, from, fromName } = data;
    io.to(to).emit('offer', {
      from: from,
      fromName: fromName,
      offer: offer
    });
    console.log(`📤 Offer 전송: ${from} -> ${to}`);
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
    const { roomId, message, userName } = data;
    
    // 서버에서 직접 강의자 여부 확인
    const room = rooms[roomId];
    const isInstructor = room && room.instructorId === socket.id;
    
    console.log(`[채팅 디버그] roomId: ${roomId}, socketId: ${socket.id}, instructorId: ${room?.instructorId}, isInstructor: ${isInstructor}`);
    
    io.to(roomId).emit('receive-message', {
      userId: socket.id,
      userName: userName,
      message: message,
      timestamp: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }),
      isInstructor: isInstructor
    });
    console.log(`💬 메시지: ${userName} - ${message}${isInstructor ? ' [강의자]' : ''}`);
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

  // 연결 해제
  socket.on('disconnect', () => {
    console.log(`❌ 사용자 연결 해제: ${socket.id}`);

    // 모든 방에서 사용자 제거
    for (const roomId in rooms) {
      const userIndex = rooms[roomId].users.findIndex(u => u.id === socket.id);
      if (userIndex !== -1) {
        const userName = rooms[roomId].users[userIndex].name;
        rooms[roomId].users.splice(userIndex, 1);

        io.to(roomId).emit('user-left', {
          userId: socket.id,
          userName: userName,
          totalUsers: rooms[roomId].users.length
        });

        if (rooms[roomId].users.length === 0) {
          delete rooms[roomId];
        }
      }
    }

    delete users[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 ViBe 비디오 회의 서버 시작: http://0.0.0.0:${PORT}\n`);
  console.log(`📍 API Health Check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`📍 Question Refinement API: POST http://0.0.0.0:${PORT}/api/refine-question\n`);
});
