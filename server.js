const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exam');
const questionRoutes = require('./routes/question');
const roomRoutes = require('./routes/room');
const http = require('http');
const { Server } = require('socket.io');
const Room = require('./models/Room');
const Question = require('./models/Question');
const jwt = require('jsonwebtoken');
require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());
app.use('/images', express.static('images')); // Phục vụ file tĩnh từ /images
app.use('/api/auth', authRoutes);
app.use('/api/exam', examRoutes);
app.use('/api/question', questionRoutes);
app.use('/api/room', roomRoutes);

const gameState = {};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-room', async ({ roomId, token }) => {
    console.log(`Client connected to room: ${roomId} with socket id: ${socket.id}`);
    try {
      const decoded = jwt.verify(token, 'your_jwt_secret');
      const room = await Room.findOne({ roomId }).populate('users', 'username userImage');
      if (!room) {
        socket.emit('error', { message: 'Phòng không tồn tại' });
        return;
      }
      socket.join(roomId);

      io.to(roomId).emit('room-update', {
        roomId: room.roomId,
        creatorId: room.creatorId._id,
        users: room.users,
      });

      const state = gameState[roomId];
      if (state && state.currentQuestionIndex < state.questions.length) {
        socket.emit('next-question', {
          question: state.questions[state.currentQuestionIndex],
          questionIndex: state.currentQuestionIndex,
          totalQuestions: state.questions.length,
        });
      }
    } catch (err) {
      socket.emit('error', { message: 'Lỗi khi tham gia phòng' });
    }
  });

  socket.on('leave-room', async ({ roomId, token }) => {
    try {
      const decoded = jwt.verify(token, 'your_jwt_secret');
      const room = await Room.findOne({ roomId });
      if (room) {
        room.users = room.users.filter((userId) => userId.toString() !== decoded.id);
        await room.save();
        const updatedRoom = await Room.findOne({ roomId }).populate('users', 'username userImage');
        socket.leave(roomId);
        io.to(roomId).emit('room-update', {
          roomId: updatedRoom.roomId,
          creatorId: updatedRoom.creatorId._id,
          users: updatedRoom.users,
        });
      }
    } catch (err) {
      socket.emit('error', { message: 'Lỗi khi rời phòng' });
    }
  });

  socket.on('delete-room', async ({ roomId, token }) => {
    try {
      const decoded = jwt.verify(token, 'your_jwt_secret');
      const room = await Room.findOne({ roomId });
      if (!room) return;
      if (room.creatorId.toString() === decoded.id) {
        await Room.deleteOne({ roomId });
        delete gameState[roomId];
        io.to(roomId).emit('room-deleted', { message: 'Phòng đã bị xóa' });
      }
    } catch (err) {
      socket.emit('error', { message: 'Lỗi khi xóa phòng' });
    }
  });

  socket.on('start-game', async ({ roomId, token }) => {
    try {
      const decoded = jwt.verify(token, 'your_jwt_secret');
      const room = await Room.findOne({ roomId });
      if (!room || room.creatorId.toString() !== decoded.id) return;

      const questions = await Question.find({ examId: room.examId });
      if (!questions.length) {
        socket.emit('error', { message: 'Không có câu hỏi nào trong đề thi này' });
        return;
      }

      gameState[roomId] = {
        questions,
        currentQuestionIndex: -1,
        scores: {},
        answers: {},
        answeredUsers: {},
        isCorrectForLastQuestion: {},
      };

      io.to(roomId).emit('game-started', { roomId });
      setTimeout(() => {
        io.to(roomId).emit('countdown', { countdown: 3 });
        setTimeout(() => sendNextQuestion(roomId), 3000);
      }, 1000);
    } catch (err) {
      socket.emit('error', { message: 'Lỗi khi bắt đầu trò chơi' });
    }
  });

  socket.on('submit-answer', async ({ roomId, answer, score, token }) => {
    try {
      const decoded = jwt.verify(token, 'your_jwt_secret');
      const state = gameState[roomId];
      if (!state || state.currentQuestionIndex >= state.questions.length) return;

      const currentQuestion = state.questions[state.currentQuestionIndex];
      const isCorrect = answer === currentQuestion.correctAnswer;

      if (!state.answers[decoded.id]) state.answers[decoded.id] = [];
      state.answers[decoded.id][state.currentQuestionIndex] = answer;

      if (!state.answeredUsers[state.currentQuestionIndex]) {
        state.answeredUsers[state.currentQuestionIndex] = new Set();
      }
      state.answeredUsers[state.currentQuestionIndex].add(decoded.id);

      if (!state.scores[decoded.id]) state.scores[decoded.id] = 0;
      if (isCorrect){
        state.scores[decoded.id] += score;
        state.isCorrectForLastQuestion[decoded.id] = true
      }else{
        state.isCorrectForLastQuestion[decoded.id] = false
      }
    } catch (err) {
      socket.emit('error', { message: 'Lỗi khi gửi câu trả lời' });
    }
  });

  // socket.on('time-up', async ({ roomId }) => {
  //   const state = gameState[roomId];
  //   if (!state) return;

  //   const currentQuestion = state.questions[state.currentQuestionIndex];

  //   io.to(roomId).emit('show-results', {
  //     correctAnswer: currentQuestion.correctAnswer,
  //     question: currentQuestion.question,
  //     type: currentQuestion.type,
  //     imageUrl: currentQuestion.imageUrl,
  //     options: currentQuestion.options,
  //   });

  //   setTimeout(async () => {
  //     const room = await Room.findOne({ roomId }).populate('users', 'username userImage');
  //     const leaderboard = room.users
  //       .map((user) => ({
  //         id: user._id.toString(),
  //         username: user.username,
  //         userImage: user.userImage,
  //         score: state.scores[user._id] || 0,
  //         isCorrectForLastQuestion: state.isCorrectForLastQuestion[user._id],
  //       }))
  //       .sort((a, b) => b.score - a.score)
  //       .map((entry, index) => ({
  //         ...entry,
  //         rank: index + 1,
  //       }));

  //     // Kiểm tra xem đây có phải là câu hỏi cuối cùng không
  //     if (state.currentQuestionIndex + 1 === state.questions.length) {
  //       io.to(roomId).emit('game-ended', { leaderboard });
  //       delete gameState[roomId];
  //     } else {
  //       io.to(roomId).emit('show-scores', { leaderboard });
  //       setTimeout(() => {
  //         io.to(roomId).emit('countdown', { countdown: 3 });
  //         setTimeout(() => sendNextQuestion(roomId), 3000);
  //       }, 3000);
  //     }
  //   }, 3000);
  // });

  socket.on('time-up', async ({ roomId, token }) => {
    const state = gameState[roomId];
    if (!state) return;

    try {
      const decoded = jwt.verify(token, 'your_jwt_secret');
      const room = await Room.findOne({ roomId });
      if (!room || room.creatorId.toString() !== decoded.id) {
        socket.emit('error', { message: 'Chỉ có host mới được bỏ qua câu hỏi!' });
        return;
      }

      const currentQuestion = state.questions[state.currentQuestionIndex];

      // Set isCorrectForLastQuestion to false for users who didn't answer
      room.users.forEach(user => {
        if (!state.answeredUsers[state.currentQuestionIndex]?.has(user._id.toString())) {
          state.isCorrectForLastQuestion[user._id] = false;
        }
      });

      io.to(roomId).emit('show-results', {
        correctAnswer: currentQuestion.correctAnswer,
        question: currentQuestion.question,
        type: currentQuestion.type,
        imageUrl: currentQuestion.imageUrl,
        options: currentQuestion.options,
      });

      setTimeout(async () => {
        const room = await Room.findOne({ roomId }).populate('users', 'username userImage');
        const leaderboard = room.users
          .map((user) => ({
            id: user._id.toString(),
            username: user.username,
            userImage: user.userImage,
            score: state.scores[user._id] || 0,
            isCorrectForLastQuestion: state.isCorrectForLastQuestion[user._id],
          }))
          .sort((a, b) => b.score - a.score)
          .map((entry, index) => ({
            ...entry,
            rank: index + 1,
          }));

        // Kiểm tra xem đây có phải là câu hỏi cuối cùng không
        if (state.currentQuestionIndex + 1 === state.questions.length) {
          io.to(roomId).emit('game-ended', { leaderboard });
          delete gameState[roomId];
        } else {
          io.to(roomId).emit('show-scores', { leaderboard });
          setTimeout(() => {
            io.to(roomId).emit('countdown', { countdown: 3 });
            setTimeout(() => sendNextQuestion(roomId), 3000);
          }, 3000);
        }
      }, 3000);
    } catch (err) {
      socket.emit('error', { message: 'Lỗi khi xử lý time-up' });
    }
  });

  async function sendNextQuestion(roomId) {
    const state = gameState[roomId];
    if (!state) return;

    state.currentQuestionIndex++;
    if (state.currentQuestionIndex < state.questions.length) {
      io.to(roomId).emit('next-question', {
        question: state.questions[state.currentQuestionIndex],
        questionIndex: state.currentQuestionIndex,
        totalQuestions: state.questions.length,
      });
    } else {
      const room = await Room.findOne({ roomId }).populate('users', 'username userImage');
      const leaderboard = room.users
        .map((user) => ({
          id: user._id.toString(),
          username: user.username,
          userImage: user.userImage,
          score: state.scores[user._id] || 0,
          isCorrectForLastQuestion: state.isCorrectForLastQuestion[user._id],
        }))
        .sort((a, b) => b.score - a.score)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));

      io.to(roomId).emit('game-ended', { leaderboard });
      delete gameState[roomId];
    }
  }
});

const PORT = 5000;
server.listen(PORT, () => console.log('Server running on port 5000'));