const pool = require('../../config/db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Get current points balance
const getPoints = async (userId) => {
  const result = await pool.query(
    `SELECT total_points, lifetime_points, updated_at 
     FROM loyalty_points WHERE user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    await pool.query(
      `INSERT INTO loyalty_points (user_id) VALUES ($1)`,
      [userId]
    );
    return { total_points: 0, lifetime_points: 0 };
  }

  return result.rows[0];
};

// Add points (earn)
const addPoints = async (userId, points, description, referenceId = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE loyalty_points 
       SET total_points = total_points + $1,
           lifetime_points = lifetime_points + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [points, userId]
    );

    await client.query(
      `INSERT INTO loyalty_transactions
       (user_id, points, type, description, reference_id)
       VALUES ($1, $2, 'earn', $3, $4)`,
      [userId, points, description, referenceId]
    );

    await client.query('COMMIT');
    return await getPoints(userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Generate QR
const generateQRPayload = async (userId, rewardPoints = 50) => {
  const balance = await getPoints(userId);

  if (balance.total_points < rewardPoints) {
    throw new Error(
      `Not enough points. You have ${balance.total_points}, need ${rewardPoints}`
    );
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;

  const payload = {
    userId,
    points: rewardPoints,
    nonce,
    exp: expiresAt,
    type: 'loyalty_redeem'
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET);

  await pool.query(
    `INSERT INTO loyalty_transactions
     (user_id, points, type, description, reference_id)
     VALUES ($1, $2, 'redeem', 'QR generated - pending scan', $3)`,
    [userId, -rewardPoints, nonce]
  );

  await pool.query(
    `UPDATE loyalty_points 
     SET total_points = total_points - $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $2`,
    [rewardPoints, userId]
  );

  return {
    qr_token: token,
    points: rewardPoints,
    expires_in_seconds: 15 * 60,
    message: 'Show this QR to gym staff. Valid for 15 minutes.'
  };
};

// Redeem QR
const redeemQR = async (qrToken) => {
  let decoded;
  try {
    decoded = jwt.verify(qrToken, process.env.JWT_SECRET);
  } catch (err) {
    throw new Error('Invalid or expired QR code');
  }

  if (decoded.type !== 'loyalty_redeem') {
    throw new Error('Invalid QR type');
  }

  const existing = await pool.query(
    `SELECT id FROM loyalty_transactions 
     WHERE reference_id = $1 AND description LIKE '%redeemed%'`,
    [decoded.nonce]
  );

  if (existing.rows.length > 0) {
    throw new Error('This QR code has already been used');
  }

  await pool.query(
    `UPDATE loyalty_transactions 
     SET description = 'QR redeemed successfully'
     WHERE reference_id = $1`,
    [decoded.nonce]
  );

  return {
    success: true,
    user_id: decoded.userId,
    points_redeemed: decoded.points,
    message: 'Reward redeemed successfully'
  };
};

// User history
const getHistory = async (userId) => {
  const result = await pool.query(
    `SELECT points, type, description, created_at 
     FROM loyalty_transactions 
     WHERE user_id = $1 
     ORDER BY created_at DESC 
     LIMIT 50`,
    [userId]
  );
  return result.rows;
};

// Admin: all transactions
const getAllTransactions = async (limit = 50) => {
  const result = await pool.query(
    `SELECT lt.id, lt.user_id, u.email, u.full_name,
            lt.points, lt.type, lt.description, lt.reference_id, lt.created_at
     FROM loyalty_transactions lt
     JOIN users u ON u.id = lt.user_id
     ORDER BY lt.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

// Admin: recent redemptions
const getRecentRedemptions = async (limit = 20) => {
  const result = await pool.query(
    `SELECT lt.id, lt.user_id, u.email, u.full_name,
            lt.points, lt.description, lt.reference_id, lt.created_at
     FROM loyalty_transactions lt
     JOIN users u ON u.id = lt.user_id
     WHERE lt.type = 'redeem'
     ORDER BY lt.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
};

module.exports = {
  getPoints,
  addPoints,
  generateQRPayload,
  redeemQR,
  getHistory,
  getAllTransactions,
  getRecentRedemptions
};