const pool = require('./src/config/db');

async function main() {
  const columns = await pool.query(`
    SELECT column_name, column_default, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'workout'
      AND table_name = 'user_workout_assessments'
    ORDER BY ordinal_position
  `);

  const constraints = await pool.query(`
    SELECT conname, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'workout.user_workout_assessments'::regclass
  `);

  console.log('\n=== COLUMN DEFAULTS ===');
  console.log(JSON.stringify(columns.rows, null, 2));

  console.log('\n=== TABLE CONSTRAINTS ===');
  console.log(JSON.stringify(constraints.rows, null, 2));
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
