/**
 * One-time script to create the first admin.
 * Run once: node src/scripts/seedAdmin.js
 */
require('dotenv').config();
const pool = require('../config/db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@nutrifit.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const full_name = 'System Admin';

  try {
    // Check if any admin already exists
    const existingAdmin = await pool.query(
      `SELECT id FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1`
    );

    if (existingAdmin.rows.length > 0) {
      console.log('Admin already exists. Skipping seed.');
      process.exit(0);
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, email, full_name, role`,
      [email, password_hash, full_name]
    );

    const user = result.rows[0];

    await pool.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [user.id]);
    await pool.query('INSERT INTO loyalty_points (user_id) VALUES ($1)', [user.id]);

    console.log('First admin created successfully:');
    console.log(`  Email   : ${user.email}`);
    console.log(`  Password: ${password}`);
    console.log('  → Change the password after first login!');
  } catch (err) {
    console.error('Seed failed:', err.message);
  } finally {
    await pool.end();
  }
}

seedAdmin();