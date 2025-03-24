const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const { createServer } = require('http');
const { Server } = require('socket.io');
const fetch = require('node-fetch');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  },
});

app.use(express.json());

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  contact: { type: String, required: true },
  contactType: { type: String, required: true },
  profilePicture: { type: String, default: null },
});

const User = mongoose.model('User', userSchema);

app.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const user = await User.findOne({
      $or: [{ username: identifier }, { contact: identifier }],
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    res.status(200).json({ message: 'Login successful' });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/signup', async (req, res) => {
  try {
    const { username, password, contact, contactType } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const response = await fetch('https://api.imgflip.com/get_memes');
    const data = await response.json();

    if (data.success && data.data && data.data.memes) {
      const memeUrls = data.data.memes.map((meme) => meme.url);
      const randomMemeUrl = memeUrls[Math.floor(Math.random() * memeUrls.length)];

      const newUser = new User({
        username,
        password: hashedPassword,
        contact,
        contactType,
        profilePicture: randomMemeUrl,
      });

      await newUser.save();

      res.status(201).json({ message: 'User created successfully' });
    } else {
      res.status(500).json({ message: 'Error fetching memes from API' });
    }
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Username already exists' });
    } else {
      console.error('Signup error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
});

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('message', (data) => {
    console.log('Message from client:', data);
    io.emit('message', data);
  });

  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });
});

app.get('/profile/picture/:username', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) {
      return res.status(404).json({ message: 'user not found' });
    }
    return res.json({ profilePicture: user.profilePicture });
  } catch (error) {
    return res.status(500).json({ message: 'internal server error' });
  }
});

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});