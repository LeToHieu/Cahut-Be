const mongoose = require('mongoose');

const uri = "mongodb+srv://hieupotato2003:hieuto2003@cluster0.pxvhd.mongodb.net/?appName=Cluster0";


mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Đã kết nối MongoDB'))
  .catch(err => console.error('Lỗi kết nối MongoDB:', err));