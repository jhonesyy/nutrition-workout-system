const fs = require('fs');
const pool = require('./src/config/db');

async function main() {
  try {
    const sql = fs.readFileSync('./migration-mobility-library.sql', 'utf8');
    await pool.query(sql);

    const result = await pool.query(`
      SELECT id, movement_key, name, body_area, sort_order, is_active
      FROM workout.mobility_test_movements
      ORDER BY sort_order, id
    `);

    console.log('Mobility library migration successful.');
    console.table(result.rows);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
