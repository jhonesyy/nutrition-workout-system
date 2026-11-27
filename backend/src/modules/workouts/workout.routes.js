const express = require('express');
const router = express.Router();

const {
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
} = require('./workout.controller');

const {
  getMyAssessment,
  saveMyAssessment,
  getMyMobilityTest,
  saveMyMobilityTest
} = require('./workout.assessment.controller');

const {
  uploadVideo,
  deleteVideo
} = require('./exercise-video.controller');

const {
  getMemberMovements,
  getAdminMovements,
  createMovement,
  updateMovement,
  deactivateMovement,
  uploadMovementVideo,
  deleteMovementVideo
} = require('./mobility-library.controller');


const {
  authenticateToken,
  authorizeRoles
} = require('../../middleware/auth.middleware');

const {
  handleExerciseVideoUpload
} = require('../../middleware/exercise-video-upload.middleware');

// Public exercises
router.get('/exercises', getExercises);
router.get('/exercises/:id', getExercise);

// Member assessment
router.get('/assessment', authenticateToken, getMyAssessment);
router.put('/assessment', authenticateToken, saveMyAssessment);

// Member mobility test
router.get('/mobility-test', authenticateToken, getMyMobilityTest);
router.put('/mobility-test', authenticateToken, saveMyMobilityTest);

// Member workout plans and recommendations
router.get('/plan', authenticateToken, getMyWorkoutPlan);
router.get('/recommend', authenticateToken, getWorkoutRecommendations);

// Weekly challenges
router.get('/weekly-challenges', authenticateToken, getMyWeeklyChallenges);

// Admin exercise CRUD
router.post(
  '/exercises',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  addExercise
);

router.put(
  '/exercises/:id',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  updateExercise
);

router.delete(
  '/exercises/:id',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  deleteExercise
);

// Cloudinary exercise video management
router.put(
  '/exercises/:id/video',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  handleExerciseVideoUpload,
  uploadVideo
);

router.delete(
  '/exercises/:id/video',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  deleteVideo
);


// Mobility movement library - member access
router.get(
  '/mobility-test/movements',
  authenticateToken,
  getMemberMovements
);

// Mobility movement library - admin management
router.get(
  '/admin/mobility-test/movements',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  getAdminMovements
);

router.post(
  '/admin/mobility-test/movements',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  createMovement
);

router.put(
  '/admin/mobility-test/movements/:id',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  updateMovement
);

router.delete(
  '/admin/mobility-test/movements/:id',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  deactivateMovement
);

router.put(
  '/admin/mobility-test/movements/:id/video',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  handleExerciseVideoUpload,
  uploadMovementVideo
);

router.delete(
  '/admin/mobility-test/movements/:id/video',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  deleteMovementVideo
);

// Workout logs
router.post('/logs', authenticateToken, logWorkout);
router.post('/log', authenticateToken, logWorkout);
router.get('/logs', authenticateToken, getMyLogs);
router.get('/history', authenticateToken, getHistory);
router.get('/stats/weekly', authenticateToken, getWeeklyStats);

// Admin workout logs
router.get(
  '/admin/logs',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  getAdminLogs
);

module.exports = router;

