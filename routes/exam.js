const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Middleware xác thực token
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Không có token' });
  try {
    const decoded = jwt.verify(token, 'your_jwt_secret'); // Thay 'your_jwt_secret' bằng secret key của bạn
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Token không hợp lệ' });
  }
};

router.get('/get', authMiddleware, async (req, res) => {
    try {
      const exams = await Exam.find({ userId: req.userId });
      res.json(exams);
    } catch (err) {
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
});

// API tạo đề thi
router.post('/create', authMiddleware, async (req, res) => {
  const { examName } = req.body;
  try {    
    const exam = new Exam({ examName, userId: req.userId });
    await exam.save();
    console.log("Lưu thành công");
    res.status(201).json({ message: 'Đề thi đã được tạo', examId: exam._id });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// API sửa tên đề thi
router.put('/edit/:examId', authMiddleware, async (req, res) => {
    const { examId } = req.params;
    const { examName } = req.body;    
    try {
      const exam = await Exam.findById(examId);
      if (!exam) return res.status(404).json({ message: 'Đề thi không tồn tại' });
      if (exam.userId.toString() !== req.userId) {
        return res.status(403).json({ message: 'Bạn không có quyền sửa đề thi này' });
      }
      if (!examName) return res.status(400).json({ message: 'Tên đề thi là bắt buộc' });
      exam.examName = examName;
      await exam.save();
      res.json({ message: 'Tên đề thi đã được cập nhật' });
    } catch (err) {
      res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
  });

// API xóa đề thi
router.delete('/delete/:examId', authMiddleware, async (req, res) => {
  const { examId } = req.params;
  try {
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ message: 'Đề thi không tồn tại' });
    if (exam.userId.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa đề thi này' });
    }
    // Lấy danh sách câu hỏi để xóa hình ảnh
    const questions = await Question.find({ examId });
    questions.forEach((question) => {
      if (question.imageUrl) {
        fs.unlink(path.join(__dirname, '..', question.imageUrl), (err) => {
          if (err) console.error('Lỗi khi xóa hình ảnh:', err);
        });
      }
    });
    // Xóa đề thi và câu hỏi
    await Exam.deleteOne({ _id: examId });
    await Question.deleteMany({ examId });
    res.json({ message: 'Đề thi và các câu hỏi liên quan đã được xóa' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});


module.exports = router;