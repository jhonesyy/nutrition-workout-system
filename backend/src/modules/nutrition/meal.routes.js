const express = require('express');
const router = express.Router();
const {
  createMealLog,
  getMeals,
  getSummary,
  removeMeal,
  getRecommendations,
  getAdminMealLogs
} = require('./meal.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth.middleware');

// User
router.post('/', authenticateToken, createMealLog);
router.get('/', authenticateToken, getMeals);
router.get('/summary', authenticateToken, getSummary);
router.get('/recommend', authenticateToken, getRecommendations);
router.delete('/:id', authenticateToken, removeMeal);

// Admin (must be before /:id if you ever add more dynamic routes)
router.get(
  '/admin/logs',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  getAdminMealLogs
);

module.exports = router;