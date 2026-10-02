const pool = require('../../config/db');
const loyaltyService = require('../loyalty/loyalty.service');

// Get quiz questions for a specific exercise (or random if none)
const getQuizForExercise = async (exerciseId) => {
  let result = await pool.query(
    `SELECT id, question, options, explanation, points_reward
     FROM minigame_quizzes
     WHERE exercise_id = $1
     ORDER BY RANDOM()
     LIMIT 3`,
    [exerciseId]
  );

  if (result.rows.length === 0) {
    result = await pool.query(
      `SELECT id, question, options, explanation, points_reward
       FROM minigame_quizzes
       ORDER BY RANDOM()
       LIMIT 3`
    );
  }

  // Do NOT send the correct answer to the client
  return result.rows.map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options,
    points_reward: q.points_reward
  }));
};

// Submit answers and award points
const submitQuiz = async (userId, answers) => {
  if (!Array.isArray(answers) || answers.length === 0) {
    throw new Error('Answers are required');
  }

  let correctCount = 0;
  let totalPoints = 0;
  const results = [];

  for (const ans of answers) {
    const quizResult = await pool.query(
      `SELECT correct_index, points_reward, explanation, question
       FROM minigame_quizzes
       WHERE id = $1`,
      [ans.quiz_id]
    );

    if (quizResult.rows.length === 0) continue;

    const quiz = quizResult.rows[0];
    const isCorrect = quiz.correct_index === ans.selected_index;

    if (isCorrect) {
      correctCount++;
      totalPoints += quiz.points_reward;
    }

    results.push({
      quiz_id: ans.quiz_id,
      question: quiz.question,
      correct: isCorrect,
      explanation: quiz.explanation,
      points: isCorrect ? quiz.points_reward : 0
    });
  }

  if (totalPoints > 0) {
    await loyaltyService.addPoints(
      userId,
      totalPoints,
      `Mini-game quiz: ${correctCount} correct`,
      `minigame_${Date.now()}`
    );
  }

  return {
    correct_count: correctCount,
    total_questions: answers.length,
    points_earned: totalPoints,
    results
  };
};

// Admin: all quizzes
const getAllQuizzes = async () => {
  const result = await pool.query(
    `SELECT mq.*, e.name AS exercise_name
     FROM minigame_quizzes mq
     LEFT JOIN exercises e ON e.id = mq.exercise_id
     ORDER BY mq.id DESC`
  );
  return result.rows;
};

// Admin: one quiz
const getQuizById = async (id) => {
  const result = await pool.query(
    `SELECT mq.*, e.name AS exercise_name
     FROM minigame_quizzes mq
     LEFT JOIN exercises e ON e.id = mq.exercise_id
     WHERE mq.id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

// Admin: create
const createQuiz = async (data) => {
  const {
    exercise_id,
    question,
    options,
    correct_index,
    explanation,
    points_reward
  } = data;

  if (!question || String(question).trim() === '') {
    throw new Error('question is required');
  }
  if (!options || !Array.isArray(options) || options.length < 2) {
    throw new Error('options must be an array with at least 2 items');
  }
  if (correct_index === undefined || correct_index === null) {
    throw new Error('correct_index is required');
  }

  const correctIdx = Number(correct_index);
  if (Number.isNaN(correctIdx) || correctIdx < 0 || correctIdx >= options.length) {
    throw new Error('correct_index must be a valid index in options');
  }

  let exerciseId = null;
  if (exercise_id !== undefined && exercise_id !== null && exercise_id !== '') {
    exerciseId = Number(exercise_id);
    const ex = await pool.query('SELECT id FROM exercises WHERE id = $1', [exerciseId]);
    if (ex.rows.length === 0) {
      throw new Error(`exercise_id ${exerciseId} does not exist`);
    }
  }

  const result = await pool.query(
    `INSERT INTO minigame_quizzes
       (exercise_id, question, options, correct_index, explanation, points_reward)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     RETURNING *`,
    [
      exerciseId,
      String(question).trim(),
      JSON.stringify(options),
      correctIdx,
      explanation || null,
      points_reward !== undefined ? Number(points_reward) : 5
    ]
  );

  return result.rows[0];
};

// Admin: update
const updateQuiz = async (id, data) => {
  const {
    exercise_id,
    question,
    options,
    correct_index,
    explanation,
    points_reward
  } = data;

  const optionsJson =
    options === undefined
      ? null
      : JSON.stringify(Array.isArray(options) ? options : options);

  const result = await pool.query(
    `UPDATE minigame_quizzes SET
       exercise_id   = COALESCE($1, exercise_id),
       question      = COALESCE($2, question),
       options       = COALESCE($3::jsonb, options),
       correct_index = COALESCE($4, correct_index),
       explanation   = COALESCE($5, explanation),
       points_reward = COALESCE($6, points_reward)
     WHERE id = $7
     RETURNING *`,
    [
      exercise_id !== undefined ? exercise_id : null,
      question !== undefined ? question : null,
      optionsJson,
      correct_index !== undefined ? Number(correct_index) : null,
      explanation !== undefined ? explanation : null,
      points_reward !== undefined ? Number(points_reward) : null,
      id
    ]
  );

  return result.rows[0] || null;
};

// Admin: delete
const deleteQuiz = async (id) => {
  const result = await pool.query(
    `DELETE FROM minigame_quizzes WHERE id = $1 RETURNING id, question`,
    [id]
  );
  return result.rows[0] || null;
};

module.exports = {
  getQuizForExercise,
  submitQuiz,
  getAllQuizzes,
  getQuizById,
  createQuiz,
  updateQuiz,
  deleteQuiz
};