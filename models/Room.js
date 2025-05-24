const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true }, // Mã phòng 6 số
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Danh sách người dùng trong phòng
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Room', roomSchema);