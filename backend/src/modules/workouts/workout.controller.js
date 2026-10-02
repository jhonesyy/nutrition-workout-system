const workoutService = require('./workout.service');

const getExercises = async (req, res) => {
  try {
    const exercises = await workoutService.getAllExercises(req.query);
    res.json(exercises);
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

const getMyWorkoutPlan = async (req, res) => {
  try {
    const plan = await workoutService.generateWorkoutPlan(req.user.userId);
    res.json(plan);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
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
    const { id } = req.params;
    const exercise = await workoutService.updateExercise(id, req.body);
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
    const { id } = req.params;
    const exercise = await workoutService.deleteExercise(id);
    if (!exercise) {
      return res.status(404).json({ message: 'Exercise not found' });
    }
    res.json({ message: 'Exercise deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
const logWorkout = async (req, res) => {
  try {
    const log = await workoutService.logWorkout(req.user.userId, req.body);
    res.status(201).json({ message: 'Workout logged', log });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getMyLogs = async (req, res) => {
  try {
    const logs = await workoutService.getMyWorkoutLogs(req.user.userId);
    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: error.message });
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

module.exports = {
  getExercises,
  getExercise,
  getMyWorkoutPlan,
  addExercise,
  updateExercise,
  deleteExercise,
  logWorkout,
  getMyLogs,
  getAdminLogs
};