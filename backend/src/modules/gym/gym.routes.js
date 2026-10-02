const express = require('express');
const router = express.Router();
const {
  getSettings,
  updateSettings,
  listRewards,
  addReward,
  editReward,
  removeReward
} = require('./gym.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth.middleware');

// Public (mobile can read gym name/address)
router.get('/settings', getSettings);
router.get('/rewards', listRewards);

// Admin only
router.put(
  '/settings',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  updateSettings
);
router.post(
  '/rewards',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  addReward
);
router.put(
  '/rewards/:id',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  editReward
);
router.delete(
  '/rewards/:id',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  removeReward
);

module.exports = router;