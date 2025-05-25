const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { MailtrapTransport } = require('mailtrap');
const bcrypt = require('bcryptjs');

// Cấu hình MailtrapTransport với API token
const TOKEN = '5b5bb7d983357d6f7d499ff8d1ea40e6'; // API token của bạn
const transporter = nodemailer.createTransport(
  MailtrapTransport({
    token: TOKEN,
  })
);

// Định nghĩa sender
const sender = {
  address: 'hello@demomailtrap.co',
  name: 'Cahut Password Reset',
};

// Lưu trữ mã reset tạm thời (trong memory)
const resetCodes = new Map(); // { email: { code, expiresAt } }


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

// Đăng ký
router.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'Email đã tồn tại' });
    user = new User({ username, email, password });
    await user.save();
    res.status(201).json({ message: 'Đăng ký thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});

// Đăng nhập
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Email không tồn tại' });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Mật khẩu sai' });
    const token = jwt.sign({ id: user._id, username: user.username, userImage: user.userImage}, 'your_jwt_secret', { expiresIn: '365d' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server' });
  }
});


// Quên mật khẩu - Gửi mã qua email
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Email không tồn tại' });

    // Tạo mã code ngẫu nhiên (6 chữ số)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // Hết hạn sau 5 phút
    resetCodes.set(email, { code, expiresAt });

    // Gửi email qua Mailtrap
    const mailOptions = {
      from: sender,
      to: [email], // Đặt email người nhận dưới dạng mảng
      subject: 'Mã đặt lại mật khẩu Cahut',
      text: `Mã đặt lại mật khẩu của bạn là: ${code}. Mã này có hiệu lực trong 5 phút.`,
      category: 'Password Reset', // Phân loại email
    };
    
    await transporter.sendMail(mailOptions);

    res.json({ message: 'Mã đã được gửi qua email' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi gửi email', error: err.message });
  }
});

// Đặt lại mật khẩu
router.post('/reset-password', async (req, res) => {
  const { email, code, newPassword } = req.body;
  try {
    const resetData = resetCodes.get(email);
    if (!resetData) return res.status(400).json({ message: 'Mã không tồn tại hoặc đã hết hạn' });

    const { code: storedCode, expiresAt } = resetData;
    if (Date.now() > expiresAt) {
      resetCodes.delete(email);
      return res.status(400).json({ message: 'Mã đã hết hạn' });
    }
    if (code !== storedCode) return res.status(400).json({ message: 'Mã không đúng' });

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Email không tồn tại' });

    user.password = newPassword;
    await user.save();

    resetCodes.delete(email);
    res.json({ message: 'Đặt lại mật khẩu thành công' });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});


// Cập nhật profile
router.put('/update-profile', authMiddleware, async (req, res) => {
  const { username, userImage, newPassword, currentPassword } = req.body;
  try {
    if (!username) return res.status(400).json({ message: 'Tên người dùng là bắt buộc' });
    if (!Number.isInteger(userImage) || userImage < 1 || userImage > 12) {
      return res.status(400).json({ message: 'Hình ảnh người dùng phải từ 1 đến 12' });
    }
    if (!currentPassword) {
      return res.status(400).json({ message: 'Mật khẩu hiện tại là bắt buộc' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'Người dùng không tồn tại' });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ message: 'Mật khẩu hiện tại không đúng' });

    const updateData = { username, userImage };
    if (newPassword) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(newPassword, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(req.userId, updateData, { new: true });
    const token = jwt.sign(
      { id: updatedUser._id, username: updatedUser.username, userImage: updatedUser.userImage },
      'your_jwt_secret',
      { expiresIn: '365d' }
    );
    res.json({ message: 'Cập nhật profile thành công', token });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
});


module.exports = router;