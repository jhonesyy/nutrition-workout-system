const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

const pool = require('../src/config/db');

const FOOD_CSV = path.join(__dirname, '../data/philfct_clean.csv');
const EXERCISE_CSV = path.join(__dirname, '../data/exercises.csv');

const clean = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();

  if (!text || text === '0' || text.toLowerCase() === 'null') {
    return null;
  }

  return text;
};

const numberOrZero = (value) => {
  const cleaned = clean(value);

  if (cleaned === null) {
    return 0;
  }

  const number = Number(cleaned);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return number;
};

const normalizeDifficulty = (level) => {
  const value = clean(level);

  if (!value) {
    return null;
  }

  switch (value.toLowerCase()) {
    case 'beginner':
      return 'Beginner';

    case 'intermediate':
      return 'Intermediate';

    case 'expert':
    case 'advanced':
      return 'Advanced';

    default:
      return null;
  }
};

const normalizeMuscleGroup = (primaryMuscles) => {
  const value = clean(primaryMuscles);

  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed.join(', ');
    }
  } catch (error) {
    // Not JSON. Use original text.
  }

  return value;
};

const importFoods = async () => {
  console.log('');
  console.log('========================================');
  console.log('IMPORTING FOODS');
  console.log('========================================');

  if (!fs.existsSync(FOOD_CSV)) {
    throw new Error(`Food CSV not found: ${FOOD_CSV}`);
  }

  const csv = fs.readFileSync(FOOD_CSV, 'utf8');

  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true
  });

  console.log(`Food CSV rows: ${rows.length}`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = clean(row.name);

    if (!name) {
      skipped++;
      continue;
    }

    const alternateName = clean(row.alternate_name);

    const brand = alternateName;
    const servingSize = '100 g';

    const calories = numberOrZero(row.calories);
    const protein = numberOrZero(row.protein_g);
    const carbs = numberOrZero(row.carbs_g);
    const fat = numberOrZero(row.fat_g);
    const fiber = numberOrZero(row.fiber_g);

    const result = await pool.query(
      `
      INSERT INTO foods (
        name,
        brand,
        serving_size,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        fiber_g,
        allergen_tags,
        source,
        is_active
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        '{}',
        'philfct',
        TRUE
      )
      ON CONFLICT (
        LOWER(name),
        LOWER(COALESCE(brand, ''))
      )
      DO UPDATE SET
        serving_size = EXCLUDED.serving_size,
        calories = EXCLUDED.calories,
        protein_g = EXCLUDED.protein_g,
        carbs_g = EXCLUDED.carbs_g,
        fat_g = EXCLUDED.fat_g,
        fiber_g = EXCLUDED.fiber_g,
        source = EXCLUDED.source,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS inserted
      `,
      [
        name,
        brand,
        servingSize,
        calories,
        protein,
        carbs,
        fat,
        fiber
      ]
    );

    if (result.rows[0].inserted) {
      inserted++;
    } else {
      updated++;
    }
  }

  console.log(`Foods processed: ${rows.length}`);
  console.log(`Foods inserted: ${inserted}`);
  console.log(`Foods updated: ${updated}`);
  console.log(`Foods skipped: ${skipped}`);

  return {
    processed: rows.length,
    inserted,
    updated,
    skipped
  };
};

const importExercises = async () => {
  console.log('');
  console.log('========================================');
  console.log('IMPORTING EXERCISES');
  console.log('========================================');

  if (!fs.existsSync(EXERCISE_CSV)) {
    throw new Error(`Exercise CSV not found: ${EXERCISE_CSV}`);
  }

  const csv = fs.readFileSync(EXERCISE_CSV, 'utf8');

  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true
  });

  console.log(`Exercise CSV rows: ${rows.length}`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = clean(row.name);

    if (!name) {
      skipped++;
      continue;
    }

    const muscleGroup = normalizeMuscleGroup(row.primary_muscles);
    const equipment = clean(row.equipment);
    const difficulty = normalizeDifficulty(row.level);
    const instructions = clean(row.instructions);

    const result = await pool.query(
      `
      INSERT INTO exercises (
        name,
        muscle_group,
        equipment,
        difficulty,
        default_sets,
        default_reps,
        rest_seconds,
        common_errors,
        form_tips
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        NULL,
        NULL,
        NULL,
        NULL,
        $5
      )
      ON CONFLICT (
        LOWER(name),
        LOWER(COALESCE(muscle_group, ''))
      )
      DO UPDATE SET
        equipment = EXCLUDED.equipment,
        difficulty = EXCLUDED.difficulty,
        form_tips = EXCLUDED.form_tips,
        updated_at = CURRENT_TIMESTAMP
      RETURNING (xmax = 0) AS inserted
      `,
      [
        name,
        muscleGroup,
        equipment,
        difficulty,
        instructions
      ]
    );

    if (result.rows[0].inserted) {
      inserted++;
    } else {
      updated++;
    }
  }

  console.log(`Exercises processed: ${rows.length}`);
  console.log(`Exercises inserted: ${inserted}`);
  console.log(`Exercises updated: ${updated}`);
  console.log(`Exercises skipped: ${skipped}`);

  return {
    processed: rows.length,
    inserted,
    updated,
    skipped
  };
};

const verifyDatabase = async () => {
  console.log('');
  console.log('========================================');
  console.log('VERIFYING DATABASE');
  console.log('========================================');

  const foods = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count FROM foods`
  );

  const exercises = await pool.query(
    `SELECT COUNT(*)::INTEGER AS count FROM exercises`
  );

  console.log(`Foods in DB: ${foods.rows[0].count}`);
  console.log(`Exercises in DB: ${exercises.rows[0].count}`);

  console.log('');
  console.log('Sample foods:');

  const foodSamples = await pool.query(
    `
    SELECT
      id,
      name,
      calories,
      protein_g,
      carbs_g,
      fat_g
    FROM foods
    ORDER BY id
    LIMIT 5
    `
  );

  console.table(foodSamples.rows);

  console.log('');
  console.log('Sample exercises:');

  const exerciseSamples = await pool.query(
    `
    SELECT
      id,
      name,
      muscle_group,
      equipment,
      difficulty
    FROM exercises
    ORDER BY id
    LIMIT 5
    `
  );

  console.table(exerciseSamples.rows);
};

const main = async () => {
  try {
    console.log('');
    console.log('========================================');
    console.log('NUTRIFIT DATASET IMPORTER');
    console.log('========================================');

    console.log('Testing database connection...');

    await pool.query('SELECT NOW()');

    console.log('Database connection OK');

    await importFoods();

    await importExercises();

    await verifyDatabase();

    console.log('');
    console.log('========================================');
    console.log('IMPORT COMPLETE');
    console.log('========================================');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error('IMPORT FAILED');
    console.error('========================================');
    console.error(error.message);
    console.error('');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
};

main();