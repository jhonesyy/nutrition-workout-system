const express = require('express');
const router = express.Router();
const { getDashboard, getAnalytics } = require('./stats.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth.middleware');

router.get(
  '/dashboard',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  getDashboard
);

router.get(
  '/analytics',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  getAnalytics
);

module.exports = router;