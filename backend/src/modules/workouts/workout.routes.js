const express = require('express');
const router = express.Router();
const {
  getExercises,
  getExercise,
  getMyWorkoutPlan,
  addExercise,
  updateExercise,
  deleteExercise,
  // workout logs
  logWorkout,
  getMyLogs,
  getHistory,                 // <-- new
  getAdminLogs,
  getWorkoutRecommendations   // <-- new
} = require('./workout.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth.middleware');

// Public exercises
router.get('/exercises', getExercises);
router.get('/exercises/:id', getExercise);

// User plan (legacy) + NEW dataset-driven recommendations
router.get('/plan', authenticateToken, getMyWorkoutPlan);
router.get('/recommend', authenticateToken, getWorkoutRecommendations); // <-- NEW

// Admin exercise CRUD
router.post('/exercises', authenticateToken, authorizeRoles('admin', 'super_admin'), addExercise);
router.put('/exercises/:id', authenticateToken, authorizeRoles('admin', 'super_admin'), updateExercise);
router.delete('/exercises/:id', authenticateToken, authorizeRoles('admin', 'super_admin'), deleteExercise);

// Workout logs
router.post('/logs', authenticateToken, logWorkout);
router.post('/log', authenticateToken, logWorkout);          // <-- alias for frontend
router.get('/logs', authenticateToken, getMyLogs);
router.get('/history', authenticateToken, getHistory);       // <-- NEW (returns {history})
router.get('/admin/logs', authenticateToken, authorizeRoles('admin', 'super_admin', 'gym_manager'), getAdminLogs);

module.exports = router;