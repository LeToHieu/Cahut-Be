const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Cấu hình multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './images';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  },
});
const upload = multer({ storage });

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

// API lấy danh sách câu hỏi
router.get('/get/:examId', authMiddleware, async (req, res) => {
  const { examId } = req.params;
  try {
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ message: 'Đề thi không tồn tại' });
    if (exam.userId.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền xem câu hỏi của đề thi này' });
    }
    const questions = await Question.find({ examId });
    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// API thêm câu hỏi
router.post('/create', authMiddleware, upload.single('image'), async (req, res) => {
  const { examId, question, options, correctAnswer, timeLimit, type } = req.body;
  try {
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ message: 'Đề thi không tồn tại' });
    if (exam.userId.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền thêm câu hỏi vào đề thi này' });
    }
    const imageUrl = req.file ? `/images/${req.file.filename}` : null;
    const newQuestion = new Question({
      examId,
      question,
      options: JSON.parse(options),
      correctAnswer,
      timeLimit: timeLimit || 30,
      type: type || 'normal',
      imageUrl,
    });
    await newQuestion.save();
    res.status(201).json({ message: 'Câu hỏi đã được thêm', questionId: newQuestion._id });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// API sửa câu hỏi
router.put('/edit/:questionId', authMiddleware, upload.single('image'), async (req, res) => {
  const { questionId } = req.params;
  const { examId, question, options, correctAnswer, timeLimit, type } = req.body;
  try {
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ message: 'Đề thi không tồn tại' });
    if (exam.userId.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền sửa câu hỏi này' });
    }
    const existingQuestion = await Question.findById(questionId);
    if (!existingQuestion) return res.status(404).json({ message: 'Câu hỏi không tồn tại' });
    const imageUrl = req.file ? `/images/${req.file.filename}` : existingQuestion.imageUrl;
    if (req.file && existingQuestion.imageUrl) {
      fs.unlink(path.join(__dirname, '..', existingQuestion.imageUrl), (err) => {
        if (err) console.error('Lỗi khi xóa hình ảnh cũ:', err);
      });
    }
    const updatedQuestion = await Question.findByIdAndUpdate(
      questionId,
      {
        question,
        options: JSON.parse(options),
        correctAnswer,
        timeLimit,
        type,
        imageUrl,
      },
      { new: true }
    );
    res.status(201).json({ message: 'Câu hỏi đã được cập nhật', questionId: updatedQuestion._id });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

// API xóa câu hỏi
router.delete('/delete/:questionId', authMiddleware, async (req, res) => {
  const { questionId } = req.params;
  try {
    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ message: 'Câu hỏi không tồn tại' });
    const exam = await Exam.findById(question.examId);
    if (exam.userId.toString() !== req.userId) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa câu hỏi này' });
    }
    if (question.imageUrl) {
      fs.unlink(path.join(__dirname, '..', question.imageUrl), (err) => {
        if (err) console.error('Lỗi khi xóa hình ảnh:', err);
      });
    }
    await Question.deleteOne({ _id: questionId });
    res.json({ message: 'Câu hỏi đã được xóa' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});

module.exports = router;