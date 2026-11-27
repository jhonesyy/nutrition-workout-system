const pool = require('./src/config/db');

async function main() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'workout'
        AND table_name = 'user_workout_assessments'
      ORDER BY ordinal_position
    `);

    console.table(result.rows);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
