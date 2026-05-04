require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('./model/User.model');

const seedAdmin = async () => {
  console.log('Seeding process started...');
  try {
    if (!process.env.MONGO_URI) {
      console.error('MONGO_URI is not defined in environment');
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB for seeding...');

    const adminPhone = '03001234567';
    const adminPassword = 'adminpassword123';

    let user = await User.findOne({ phone: adminPhone });
    if (user) {
      console.log('Admin already exists');
      process.exit();
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPassword, salt);

    user = new User({
      fullName: 'Farely Admin',
      phone: adminPhone,
      password: hashedPassword,
      role: 'admin',
      phoneVerified: true,
    });

    await user.save();
    console.log('Admin user created successfully!');
    console.log(`Phone: ${adminPhone}`);
    console.log(`Password: ${adminPassword}`);
    process.exit();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

seedAdmin();

