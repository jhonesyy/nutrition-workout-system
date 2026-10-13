const express = require('express');
const router = express.Router();
const {
  getMyPoints,
  getMyHistory,
  generateQR,
  redeemQR,
  earnPoints,
  getAllHistory,
  getRedemptions,
  generateRewardQr,
  scanReward
} = require('./loyalty.controller');
const { authenticateToken, authorizeRoles } = require('../../middleware/auth.middleware');

// User
router.get('/points', authenticateToken, getMyPoints);
router.get('/history', authenticateToken, getMyHistory);
router.post('/generate-qr', authenticateToken, generateQR);
router.post('/earn', authenticateToken, earnPoints);

// NEW: user scans admin-generated reward QR
router.post('/scan-reward', authenticateToken, scanReward);

// Staff / Admin redeem (old flow, optional)
router.post(
  '/redeem',
  authenticateToken,
  authorizeRoles('admin', 'gym_manager', 'super_admin'),
  redeemQR
);

// NEW: admin generates QR for a posted reward
router.post(
  '/admin/generate-reward-qr',
  authenticateToken,
  authorizeRoles('admin', 'gym_manager', 'super_admin'),
  generateRewardQr
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