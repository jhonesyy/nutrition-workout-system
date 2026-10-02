const pool = require('../../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;

const registerUser = async ({ email, password, full_name }) => {
  // Check if email already exists
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new Error('Email already registered');
  }

  // Hash password
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  // Insert user
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, full_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, full_name, role, created_at`,
    [email, password_hash, full_name]
  );

  const user = result.rows[0];

  // Create empty profile and loyalty record
  await pool.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [user.id]);
  await pool.query('INSERT INTO loyalty_points (user_id) VALUES ($1)', [user.id]);

  return user;
};

const loginUser = async ({ email, password }) => {
  const result = await pool.query(
    'SELECT id, email, password_hash, full_name, role FROM users WHERE email = $1 AND is_active = true',
    [email]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid email or password');
  }

  const user = result.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    throw new Error('Invalid email or password');
  }

  // Generate JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role
    }
  };
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const result = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1 AND is_active = true',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const isMatch = await bcrypt.compare(
    currentPassword,
    result.rows[0].password_hash
  );

  if (!isMatch) {
    throw new Error('Current password is incorrect');
  }

  const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await pool.query(
    'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [password_hash, userId]
  );
};

module.exports = {
  registerUser,
  loginUser,
  changePassword
};