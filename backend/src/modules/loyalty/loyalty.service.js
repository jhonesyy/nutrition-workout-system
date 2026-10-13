const pool = require('../../config/db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// --------------------------------------------------
// Points balance
// --------------------------------------------------
const getPoints = async (userId) => {
  const result = await pool.query(
    `SELECT total_points, lifetime_points, updated_at
     FROM loyalty_points
     WHERE user_id = $1`,
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

// --------------------------------------------------
// Earn points
// --------------------------------------------------
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

// --------------------------------------------------
// OLD flow (optional keep): user generates personal QR
// --------------------------------------------------
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
    type: 'loyalty_redeem',
    userId,
    points: rewardPoints,
    nonce,
    exp: expiresAt
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

// Staff validates old-style user QR
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
     WHERE reference_id = $1
       AND description ILIKE '%redeemed%'`,
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

// --------------------------------------------------
// NEW flow: Admin generates QR for a posted reward
// --------------------------------------------------
const generateRewardQR = async (rewardId) => {
  const result = await pool.query(
    `SELECT id, name, points_required, description, is_active
     FROM rewards
     WHERE id = $1`,
    [rewardId]
  );

  const reward = result.rows[0];
  if (!reward) {
    throw new Error('Reward not found');
  }
  if (!reward.is_active) {
    throw new Error('Reward is inactive');
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + 30 * 60; // 30 min

  const payload = {
    type: 'reward_claim',
    reward_id: reward.id,
    reward_name: reward.name,
    points_required: reward.points_required,
    nonce,
    exp: expiresAt
  };

  const qr_token = jwt.sign(payload, process.env.JWT_SECRET);

  return {
    qr_token,
    reward_id: reward.id,
    reward_name: reward.name,
    points_required: reward.points_required,
    expires_in_seconds: 30 * 60,
    message: 'QR ready. Members scan this with NutriFit to claim the reward.'
  };
};

// --------------------------------------------------
// NEW flow: User scans admin QR in NutriFit app
// --------------------------------------------------
const scanRewardQR = async (userId, qrToken) => {
  let decoded;
  try {
    decoded = jwt.verify(qrToken, process.env.JWT_SECRET);
  } catch (err) {
    throw new Error('Invalid or expired QR code');
  }

  if (decoded.type !== 'reward_claim') {
    throw new Error('Invalid QR type');
  }

  // One-time use
  const used = await pool.query(
    `SELECT id FROM loyalty_transactions
     WHERE reference_id = $1
       AND description ILIKE '%claimed%'`,
    [decoded.nonce]
  );
  if (used.rows.length > 0) {
    throw new Error('This QR code has already been used');
  }

  // Confirm reward still active
  const rewardCheck = await pool.query(
    `SELECT id, name, points_required, is_active
     FROM rewards
     WHERE id = $1`,
    [decoded.reward_id]
  );
  const reward = rewardCheck.rows[0];
  if (!reward || !reward.is_active) {
    throw new Error('This reward is no longer available');
  }

  const pointsNeeded = reward.points_required;
  const balance = await getPoints(userId);

  if (balance.total_points < pointsNeeded) {
    throw new Error(
      `Not enough points. You have ${balance.total_points}, need ${pointsNeeded}`
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE loyalty_points
       SET total_points = total_points - $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2`,
      [pointsNeeded, userId]
    );

    await client.query(
      `INSERT INTO loyalty_transactions
         (user_id, points, type, description, reference_id)
       VALUES ($1, $2, 'redeem', $3, $4)`,
      [
        userId,
        -pointsNeeded,
        `Reward claimed: ${reward.name}`,
        decoded.nonce
      ]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    success: true,
    reward_id: reward.id,
    reward_name: reward.name,
    points_spent: pointsNeeded,
    remaining_points: balance.total_points - pointsNeeded,
    message: `Successfully claimed: ${reward.name}`
  };
};

// --------------------------------------------------
// History / admin lists
// --------------------------------------------------
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
  generateRewardQR,
  scanRewardQR,
  getHistory,
  getAllTransactions,
  getRecentRedemptions
};