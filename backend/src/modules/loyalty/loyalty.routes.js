const express = require('express');
const router = express.Router();
const {
  getMyPoints,
  getMyHistory,
  generateQR,
  redeemQR,
  earnPoints,
  getAllHistory,
  getRedemptions
} = require('./loyalty.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth.middleware');

// User
router.get('/points', authenticateToken, getMyPoints);
router.get('/history', authenticateToken, getMyHistory);
router.post('/generate-qr', authenticateToken, generateQR);
router.post('/earn', authenticateToken, earnPoints);

// Staff / Admin redeem
router.post(
  '/redeem',
  authenticateToken,
  authorizeRoles('admin', 'gym_manager', 'super_admin'),
  redeemQR
);

// Admin lists
router.get(
  '/admin/transactions',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  getAllHistory
);

router.get(
  '/admin/redemptions',
  authenticateToken,
  authorizeRoles('admin', 'super_admin', 'gym_manager'),
  getRedemptions
);

module.exports = router;