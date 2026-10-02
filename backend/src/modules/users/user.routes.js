const express = require('express');
const router = express.Router();
const {
  getMyProfile,
  updateMyProfile,
  getTDEE,
  // new admin controllers
  listUsers,
  createStaffAccount,
  setUserActiveStatus
} = require('./user.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth.middleware');

// ---------- User (own profile) ----------
router.get('/profile', authenticateToken, getMyProfile);
router.put('/profile', authenticateToken, updateMyProfile);
router.get('/tdee', authenticateToken, getTDEE);

// ---------- Admin only ----------
router.get(
  '/',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  listUsers
);

router.post(
  '/staff',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  createStaffAccount
);

router.patch(
  '/:id/status',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  setUserActiveStatus
);

module.exports = router;