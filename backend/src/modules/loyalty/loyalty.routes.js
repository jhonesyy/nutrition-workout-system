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
const {
  authenticateToken,
  authorizeRoles
} = require('../../middleware/auth.middleware');

// -------------------- User --------------------
router.get('/points', authenticateToken, getMyPoints);
router.get('/history', authenticateToken, getMyHistory);
router.post('/earn', authenticateToken, earnPoints);

// Old optional flow (user generates personal QR)
router.post('/generate-qr', authenticateToken, generateQR);

// NEW: user scans admin-generated reward QR in NutriFit app
router.post('/scan-reward', authenticateToken, scanReward);

// -------------------- Admin / Gym staff --------------------
// NEW: admin generates QR for a posted reward
router.post(
  '/admin/generate-reward-qr',
  authenticateToken,
  authorizeRoles('admin', 'gym_manager', 'super_admin'),
  generateRewardQr
);

// Old staff redeem of user QR (optional keep)
router.post(
  '/redeem',
  authenticateToken,
  authorizeRoles('admin', 'gym_manager', 'super_admin'),
  redeemQR
);

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