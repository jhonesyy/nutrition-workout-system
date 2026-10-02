const express = require('express');
const router = express.Router();
const {
  getQuizForExercise,
  submitQuiz,
  getAllQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz
} = require('./minigame.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth.middleware');

// User / Mobile
router.get('/exercise/:exerciseId', authenticateToken, getQuizForExercise);
router.post('/submit', authenticateToken, submitQuiz);

// Admin
router.get(
  '/admin/quizzes',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  getAllQuizzes
);

router.get(
  '/admin/quizzes/:id',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  getQuizById
);

router.post(
  '/admin/quizzes',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  createQuiz
);

router.put(
  '/admin/quizzes/:id',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  updateQuiz
);

router.delete(
  '/admin/quizzes/:id',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  deleteQuiz
);

module.exports = router;