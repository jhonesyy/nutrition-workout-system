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

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
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

// Test route
app.get('/', (req, res) => {
  res.json({
    message: 'Nutrition & Workout Recommendation System API is running',
    status: 'OK'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

module.exports = app;