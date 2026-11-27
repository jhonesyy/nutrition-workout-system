const fs = require('fs');
const pool = require('./src/config/db');

async function main() {
  const sql = fs.readFileSync('./migration-mobility-test.sql', 'utf8');
  await pool.query(sql);

  const result = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'workout'
      AND table_name = 'user_workout_assessments'
      AND column_name = 'mobility_test_completed_at'
  `);

  console.log('\n=== MIGRATION RESULT ===');
  console.table(result.rows);
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
