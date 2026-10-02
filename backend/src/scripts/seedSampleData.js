/**
 * Seed sample foods and exercises.
 * Run: node src/scripts/seedSampleData.js
 */
require('dotenv').config();
const pool = require('../config/db');

async function seed() {
  try {
    // ----- Foods -----
    const foods = [
      { name: 'Chicken Breast', brand: null, serving_size: '100g', calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0, allergen_tags: [] },
      { name: 'Brown Rice', brand: null, serving_size: '100g cooked', calories: 112, protein_g: 2.6, carbs_g: 24, fat_g: 0.9, fiber_g: 1.8, allergen_tags: [] },
      { name: 'Egg', brand: null, serving_size: '1 large', calories: 72, protein_g: 6.3, carbs_g: 0.4, fat_g: 4.8, fiber_g: 0, allergen_tags: [] },
      { name: 'Banana', brand: null, serving_size: '1 medium', calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, fiber_g: 3.1, allergen_tags: [] },
      { name: 'Greek Yogurt', brand: null, serving_size: '150g', calories: 130, protein_g: 15, carbs_g: 6, fat_g: 4, fiber_g: 0, allergen_tags: ['lactose'] },
      { name: 'Salmon Fillet', brand: null, serving_size: '100g', calories: 208, protein_g: 20, carbs_g: 0, fat_g: 13, fiber_g: 0, allergen_tags: ['seafood'] },
      { name: 'Oatmeal', brand: null, serving_size: '40g dry', calories: 150, protein_g: 5, carbs_g: 27, fat_g: 3, fiber_g: 4, allergen_tags: ['gluten'] },
      { name: 'Almonds', brand: null, serving_size: '28g', calories: 160, protein_g: 6, carbs_g: 6, fat_g: 14, fiber_g: 3.5, allergen_tags: ['nuts'] },
    ];

    for (const f of foods) {
      await pool.query(
        `INSERT INTO foods (name, brand, serving_size, calories, protein_g, carbs_g, fat_g, fiber_g, allergen_tags, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'seed')
         ON CONFLICT DO NOTHING`,
        [f.name, f.brand, f.serving_size, f.calories, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g, f.allergen_tags]
      );
    }
    console.log('Sample foods seeded');

    // ----- Exercises -----
    const exercises = [
      { name: 'Flat Barbell Bench Press', muscle_group: 'Chest', equipment: 'Flat Olympic Bench + Olympic Bar', difficulty: 'Intermediate', default_sets: 4, default_reps: '6-10' },
      { name: 'Barbell Back Squat', muscle_group: 'Legs', equipment: 'Power Rack + Olympic Bar', difficulty: 'Intermediate', default_sets: 4, default_reps: '6-10' },
      { name: 'Deadlift', muscle_group: 'Back', equipment: 'Olympic Bar', difficulty: 'Advanced', default_sets: 3, default_reps: '3-6' },
      { name: 'Overhead Press', muscle_group: 'Shoulders', equipment: 'Olympic Bar', difficulty: 'Intermediate', default_sets: 3, default_reps: '6-10' },
      { name: 'Pull-Up', muscle_group: 'Back', equipment: 'Pull-Up Bar', difficulty: 'Intermediate', default_sets: 3, default_reps: '6-12' },
      { name: 'Dumbbell Lateral Raise', muscle_group: 'Shoulders', equipment: 'Dumbbells', difficulty: 'Beginner', default_sets: 3, default_reps: '10-15' },
      { name: 'Romanian Deadlift', muscle_group: 'Legs', equipment: 'Olympic Bar', difficulty: 'Intermediate', default_sets: 3, default_reps: '8-12' },
      { name: 'Plank', muscle_group: 'Core', equipment: 'Bodyweight', difficulty: 'Beginner', default_sets: 3, default_reps: '30-60s' },
    ];

    for (const ex of exercises) {
      await pool.query(
        `INSERT INTO exercises (name, muscle_group, equipment, difficulty, default_sets, default_reps)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [ex.name, ex.muscle_group, ex.equipment, ex.difficulty, ex.default_sets, ex.default_reps]
      );
    }
    console.log('Sample exercises seeded');

  } catch (err) {
    console.error('Seed failed:', err.message);
  } finally {
    await pool.end();
  }
}

seed();