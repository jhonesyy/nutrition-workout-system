const fs = require('fs');
const path = require('path');

const app = require('./app');
const pool = require('./config/db');

const PORT = process.env.PORT || 5000;

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

const startServer = async () => {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');

    console.log('Database connection successful');

    // Create database tables
    await initializeDatabase();

    // Start API server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();