const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const Room = require('../models/Room');
const jwt = require('jsonwebtoken');

// Middleware xác thực token
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Không có token' });
  try {
    const decoded = jwt.verify(token, 'your_jwt_secret');
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
};

// API tạo phòng
router.post('/create', authMiddleware, async (req, res) => {
  const { examId } = req.body;
  try {
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ message: 'Đề thi không tồn tại' });
    if (exam.userId.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền tạo phòng với đề thi này' });
    }
    const roomId = Math.floor(100000 + Math.random() * 900000).toString(); // Mã phòng 6 số
    const room = new Room({
      roomId,
      examId,
      creatorId: req.userId,
      users: [req.userId], // Người tạo là thành viên đầu tiên
    });
    await room.save();
    res.status(201).json({ message: 'Phòng đã được tạo', roomId, room });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// API tham gia phòng
router.post('/join', authMiddleware, async (req, res) => {
  const { roomId } = req.body;
  try {
    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });
    if (room.users.includes(req.userId)) {
      return res.json({ message: 'Tham gia phòng thành công', roomId, room });
    }
    room.users.push(req.userId);
    await room.save();
    res.json({ message: 'Tham gia phòng thành công', roomId, room});
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// API rời phòng
router.post('/leave', authMiddleware, async (req, res) => {
  const { roomId } = req.body;
  try {
    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });
    room.users = room.users.filter(userId => userId.toString() !== req.userId);
    await room.save();
    res.json({ message: 'Rời phòng thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// API xóa phòng
router.delete('/delete/:roomId', authMiddleware, async (req, res) => {
  const { roomId } = req.params;
  try {
    const room = await Room.findOne({ roomId });
    if (!room) return res.status(404).json({ message: 'Phòng không tồn tại' });
    if (room.creatorId.toString() !== req.userId) {
      return res.status(403).json({ message: 'Chỉ chủ phòng mới có thể xóa phòng' });
    }
    await Room.deleteOne({ roomId });
    res.json({ message: 'Phòng đã được xóa' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});



module.exports = router;