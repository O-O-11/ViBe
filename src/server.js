const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));

// 활성 사용자 저장소
const users = {};
const rooms = {};

// 소켓 연결 처리
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
        createdAt: Date.now()
      };
    }

    rooms[roomId].users.push({
      id: socket.id,
      name: userName
    });

    // 방의 다른 사용자들에게 새 사용자 입장 알림
    socket.broadcast.to(roomId).emit('user-joined', {
      userId: socket.id,
      userName: userName,
      totalUsers: rooms[roomId].users.length
    });

    // 새 사용자에게 기존 사용자 목록 전송
    socket.emit('existing-users', {
      users: rooms[roomId].users.filter(u => u.id !== socket.id)
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
});
