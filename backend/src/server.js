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
          content: '너는 학생의 질문을 논리적으로 정리하고 다듬어서 선생님께 더 잘 전달할 수 있는 질문으로 변환해주는 조수야. 다듬어진 질문만 반환해줘. 다른 설명이나 인사말은 하지말고 순수 질문만 반환해.'
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
    }

    rooms[roomId].users.push({
      id: socket.id,
      name: userName,
      isInstructor: rooms[roomId].instructorId === socket.id
    });

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

    console.log(`🚪 사용자 합류: ${userName}이 방 ${roomId}에 입장`);
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
    io.to(roomId).emit('receive-message', {
      userId: socket.id,
      userName: userName,
      message: message,
      timestamp: new Date().toLocaleTimeString('ko-KR')
    });
    console.log(`💬 메시지: ${userName} - ${message}`);
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
server.listen(PORT, () => {
  console.log(`\n🚀 ViBe 비디오 회의 서버 시작: http://localhost:${PORT}\n`);
  console.log(`📍 API Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📍 Question Refinement API: POST http://localhost:${PORT}/api/refine-question\n`);
});
