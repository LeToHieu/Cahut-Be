const mongoose = require('mongoose');
require('./db'); // Kết nối DB

const User = require('./models/User');

async function migrate() {
  try {
    await mongoose.connect('mongodb+srv://hieupotato2003:hieuto2003@cluster0.pxvhd.mongodb.net/?appName=Cluster0', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    const result = await User.updateMany(
      { userImage: { $exists: false } },
      { $set: { userImage: 1 } }
    );
    console.log(`Updated ${result.nModified} users`);
    mongoose.connection.close();
  } catch (err) {
    console.error('Migration error:', err);
  }
}

migrate();