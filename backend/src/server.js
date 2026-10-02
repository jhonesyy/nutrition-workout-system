const fs = require('fs');
const path = require('path');

const app = require('./app');
const pool = require('./config/db');
const bcrypt = require('bcrypt');

const PORT = process.env.PORT || 5000;

const SALT_ROUNDS = 10;

const SQL_FILES = [
  path.join(__dirname, '../sql/schema.sql'),
  path.join(__dirname, '../sql/gym_settings.sql'),
  path.join(__dirname, '../sql/workout_logs.sql')
];

const initializeDatabase = async () => {
  console.log('Initializing database...');

  for (const sqlFile of SQL_FILES) {
    const fileName = path.basename(sqlFile);

    try {
      const sql = fs.readFileSync(sqlFile, 'utf8');

      console.log(`Running ${fileName}...`);

      await pool.query(sql);

      console.log(`${fileName} completed successfully`);
    } catch (error) {
      console.error(`Failed to run ${fileName}:`, error.message);
      throw error;
    }
  }

  console.log('Database initialization completed successfully');
};

const seedAdmin = async () => {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD not configured. Skipping admin seed.');
    return;
  }

  const existingAdmin = await pool.query(
    `SELECT id FROM users WHERE role IN ('admin', 'super_admin') LIMIT 1`
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
    await pool.query('SELECT NOW()');

    console.log('Database connection successful');

    await initializeDatabase();

    await seedAdmin();

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();