const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  question: { type: String, required: true },
  options: { type: [String], required: true },
  correctAnswer: { type: String, required: true },
  timeLimit: { type: Number, required: true, default: 30 },
  type: { type: String, required: true, enum: ['normal', 'image'], default: 'normal' },
  imageUrl: { type: String, default: null },
});

module.exports = mongoose.model('Question', questionSchema);