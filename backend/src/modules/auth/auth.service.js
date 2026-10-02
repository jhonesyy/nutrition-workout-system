const pool = require('../../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;

const normalizeEmail = (email) => {
  return String(email || '').trim().toLowerCase();
};

const registerUser = async ({ email, password, full_name }) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedFullName = String(full_name || '').trim();

  if (!normalizedEmail || !password || !normalizedFullName) {
    throw new Error('Email, password, and full name are required');
  }

  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      throw new Error('Email already registered');
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await client.query(
      `INSERT INTO users (
        email,
        password_hash,
        full_name
      )
      VALUES ($1, $2, $3)
      RETURNING id, email, full_name, role, is_active, created_at`,
      [
        normalizedEmail,
        password_hash,
        normalizedFullName
      ]
    );

    const user = result.rows[0];

    await client.query(
      'INSERT INTO user_profiles (user_id) VALUES ($1)',
      [user.id]
    );

    await client.query(
      'INSERT INTO loyalty_points (user_id) VALUES ($1)',
      [user.id]
    );

    await client.query('COMMIT');

    return user;
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      throw new Error('Email already registered');
    }

    throw error;
  } finally {
    client.release();
  }
};

const loginUser = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !password) {
    throw new Error('Invalid email or password');
  }

  const result = await pool.query(
    `SELECT
      id,
      email,
      password_hash,
      full_name,
      role,
      is_active
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [normalizedEmail]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid email or password');
  }

  const user = result.rows[0];

  if (!user.is_active) {
    throw new Error('Account is inactive');
  }

  if (!user.password_hash) {
    throw new Error('Invalid email or password');
  }

  const isMatch = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!isMatch) {
    throw new Error('Invalid email or password');
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    }
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

const changePassword = async (
  userId,
  currentPassword,
  newPassword
) => {
  if (!currentPassword || !newPassword) {
    throw new Error(
      'current_password and new_password are required'
    );
  }

  if (newPassword.length < 6) {
    throw new Error(
      'New password must be at least 6 characters'
    );
  }

  const result = await pool.query(
    `SELECT password_hash
     FROM users
     WHERE id = $1
       AND is_active = true`,
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

  const password_hash = await bcrypt.hash(
    newPassword,
    SALT_ROUNDS
  );

  await pool.query(
    `UPDATE users
     SET password_hash = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [
      password_hash,
      userId
    ]
  );
};

module.exports = {
  registerUser,
  loginUser,
  changePassword
};