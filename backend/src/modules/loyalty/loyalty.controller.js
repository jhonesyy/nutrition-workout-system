const loyaltyService = require('./loyalty.service');

// -------------------- User --------------------
const getMyPoints = async (req, res) => {
  try {
    const points = await loyaltyService.getPoints(req.user.userId);
    res.json(points);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getMyHistory = async (req, res) => {
  try {
    const history = await loyaltyService.getHistory(req.user.userId);
    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const earnPoints = async (req, res) => {
  try {
    const { points, description } = req.body;
    if (!points || points <= 0) {
      return res.status(400).json({ message: 'Valid points required' });
    }
    const result = await loyaltyService.addPoints(
      req.user.userId,
      points,
      description || 'Manual points'
    );
    res.json({ message: 'Points added', ...result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Optional old flow: user generates personal QR
const generateQR = async (req, res) => {
  try {
    const points = parseInt(req.body.points, 10) || 50;
    const result = await loyaltyService.generateQRPayload(req.user.userId, points);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

// Optional old flow: staff redeems user QR
const redeemQR = async (req, res) => {
  try {
    const qrToken = req.body.qr_token || req.body.token;
    if (!qrToken) {
      return res.status(400).json({ message: 'qr_token is required' });
    }
    const result = await loyaltyService.redeemQR(qrToken);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

// -------------------- NEW flow --------------------
// Admin generates QR for a posted reward
const generateRewardQr = async (req, res) => {
  try {
    const rewardId = parseInt(req.body.reward_id, 10);
    if (!rewardId) {
      return res.status(400).json({ message: 'reward_id is required' });
    }
    const result = await loyaltyService.generateRewardQR(rewardId);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

// User scans admin QR in NutriFit app
const scanReward = async (req, res) => {
  try {
    const qrToken = req.body.qr_token || req.body.token;
    if (!qrToken) {
      return res.status(400).json({ message: 'qr_token is required' });
    }
    const result = await loyaltyService.scanRewardQR(req.user.userId, qrToken);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

// -------------------- Admin lists --------------------
const getAllHistory = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const transactions = await loyaltyService.getAllTransactions(limit);
    res.json({ transactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const getRedemptions = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const redemptions = await loyaltyService.getRecentRedemptions(limit);
    res.json({ redemptions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getMyPoints,
  getMyHistory,
  generateQR,
  redeemQR,
  earnPoints,
  getAllHistory,
  getRedemptions,
  generateRewardQr,
  scanReward
};