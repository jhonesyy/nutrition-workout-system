
require('dotenv').config();

const app = require('./app');
const pool = require('./config/db');
const bcrypt = require('bcrypt');

const PORT = process.env.PORT || 5000;
const SALT_ROUNDS = 10;

const seedAdmin = async () => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log(
      'SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD not configured. Skipping admin seed.'
    );
    return;
  }

  const existingAdmin = await pool.query(
    `SELECT id FROM users
     WHERE role IN ('admin', 'super_admin')
     LIMIT 1`
  );

  if (existingAdmin.rows.length > 0) {
    console.log('Admin already exists. Skipping admin seed.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'admin')
     RETURNING id, email, full_name, role`,
    [email, passwordHash, 'System Admin']
  );

  const user = result.rows[0];

  await pool.query(
    'INSERT INTO user_profiles (user_id) VALUES ($1)',
    [user.id]
  );

  await pool.query(
    'INSERT INTO loyalty_points (user_id) VALUES ($1)',
    [user.id]
  );

  console.log(`First admin created successfully: ${user.email}`);
};

const startServer = async () => {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database_name,
        current_schema() AS current_schema,
        current_setting('search_path') AS search_path
    `);

    console.log('Database connection successful');
    console.log('Database:', result.rows[0].database_name);
    console.log('Current schema:', result.rows[0].current_schema);
    console.log('Search path:', result.rows[0].search_path);

    await seedAdmin();

    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
