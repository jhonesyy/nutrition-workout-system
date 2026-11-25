const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const foodRoutes = require('./modules/nutrition/food.routes');
const mealRoutes = require('./modules/nutrition/meal.routes');
const workoutRoutes = require('./modules/workouts/workout.routes');
const loyaltyRoutes = require('./modules/loyalty/loyalty.routes');
const minigameRoutes = require('./modules/minigame/minigame.routes');
const healthRoutes = require('./modules/health/health.routes');
const gymRoutes = require('./modules/gym/gym.routes');
const statsRoutes = require('./modules/stats/stats.routes');
const aiRoutes = require('./modules/ai/ai.routes');

const app = express();

// 1. Security & Parsing
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 2. Smart CORS Configuration
const allowedOrigins = [
  'http://localhost:5500',      // VS Code Live Server
  'http://127.0.0.1:5500',
  'http://localhost:3000',      // React/Next.js default
  'http://localhost:5173',      // Vite default
  'http://localhost:5000',      // Local backend testing
  'https://nutrition-workout-system-admin-port.vercel.app', // Your deployed frontend (update if different)
  'null'                        // Allows file:// protocol as a fallback
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl) or if origin is in our list
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin === 'null') {
      callback(null, true);
    } else {
      console.warn('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// 3. Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/foods', foodRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/loyalty', loyaltyRoutes);
app.use('/api/minigame', minigameRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/gym', gymRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/ai', aiRoutes);

// Test routes
app.get('/', (req, res) => {
  res.json({ message: 'Nutrition & Workout API is running', status: 'OK' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

module.exports = app;