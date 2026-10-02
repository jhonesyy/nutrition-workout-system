const loyaltyService = require('./loyalty.service');

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

const generateQR = async (req, res) => {
  try {
    const points = parseInt(req.body.points) || 50;
    const result = await loyaltyService.generateQRPayload(req.user.userId, points);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

const redeemQR = async (req, res) => {
  try {
    const { qr_token } = req.body;
    if (!qr_token) {
      return res.status(400).json({ message: 'qr_token is required' });
    }
    const result = await loyaltyService.redeemQR(qr_token);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
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
  getRedemptions
};