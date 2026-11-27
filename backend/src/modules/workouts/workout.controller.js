
const workoutService = require('./workout.service');
const weeklyChallengeService = require('./weekly-challenge.service');

// ======================
// ADMIN / GENERAL CONTROLLERS
// ======================

const getExercises = async (req, res) => {
  try {
    const exercises = await workoutService.getAllExercises(req.query);
    res.json({ exercises });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getExercise = async (req, res) => {
  try {
    const exercise = await workoutService.getExerciseById(req.params.id);

    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    res.json(exercise);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const addExercise = async (req, res) => {
  try {
    const exercise = await workoutService.createExercise(req.body);
    res.status(201).json({ message: 'Exercise created', exercise });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateExercise = async (req, res) => {
  try {
    const exercise = await workoutService.updateExercise(
      req.params.id,
      req.body
    );

    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    res.json({ message: 'Exercise updated', exercise });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteExercise = async (req, res) => {
  try {
    const exercise = await workoutService.deleteExercise(req.params.id);

    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }

    res.json({ message: 'Exercise deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getAdminLogs = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const logs = await workoutService.getAdminWorkoutLogs(limit);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ======================
// MEMBER CONTROLLERS
// ======================

const getMyWorkoutPlan = async (req, res) => {
  try {
    const plan = await workoutService.generateWorkoutPlan(req.user.userId);
    res.json(plan);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

const getMyWeeklyChallenges = async (req, res) => {
  try {
    const result = await weeklyChallengeService.getWeeklyChallenges(
      req.user.userId
    );

    res.json(result);
  } catch (error) {
    console.error('Weekly challenge error:', error);
    res.status(400).json({ message: error.message });
  }
};

const logWorkout = async (req, res) => {
  try {
    const log = await workoutService.logWorkout(
      req.user.userId,
      req.body
    );

    // Challenge processing must not turn a successful workout log
    // into a failed API response.
    try {
      await weeklyChallengeService.updateProgressFromWorkoutLog(
        req.user.userId,
        log
      );
    } catch (challengeError) {
      console.error(
        'Weekly challenge progress update failed:',
        challengeError
      );
    }

    res.status(201).json({
      message: 'Workout logged',
      log
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getWeeklyStats = async (req, res) => {
  try {
    const stats = await workoutService.getWeeklyWorkoutStats(
      req.user.userId
    );

    res.json(stats);
  } catch (error) {
    console.error('Weekly workout stats error:', error);
    res.status(500).json({ message: 'Unable to load weekly workout statistics' });
  }
};
const getMyLogs = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const logs = await workoutService.getMyWorkoutLogs(
      req.user.userId,
      limit
    );

    res.json({ history: logs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Dataset-driven recommendations
const getWorkoutRecommendations = async (req, res) => {
  try {
    const result = await workoutService.recommendWorkouts(
      req.user.userId
    );

    res.json(result);
  } catch (error) {
    console.error('Recommendation error:', error);
    res.status(400).json({ message: error.message });
  }
};

// Alias for frontend consistency
const getHistory = getMyLogs;

module.exports = {
  getExercises,
  getExercise,
  getMyWorkoutPlan,
  getMyWeeklyChallenges,
  addExercise,
  updateExercise,
  deleteExercise,
  logWorkout,
  getMyLogs,
  getWeeklyStats,
  getHistory,
  getAdminLogs,
  getWorkoutRecommendations
};

