const minigameService = require('./minigame.service');

// ---- User / Mobile ----
const getQuizForExercise = async (req, res) => {
  try {
    const quizzes = await minigameService.getQuizForExercise(req.params.exerciseId);
    res.json({ quizzes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const submitQuiz = async (req, res) => {
  try {
    const result = await minigameService.submitQuiz(
      req.user.userId,
      req.body.answers
    );
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

// ---- Admin ----
const getAllQuizzes = async (req, res) => {
  try {
    const quizzes = await minigameService.getAllQuizzes();
    res.json({ quizzes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const getQuizById = async (req, res) => {
  try {
    const quiz = await minigameService.getQuizById(req.params.id);
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    res.json(quiz);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
};

const createQuiz = async (req, res) => {
  try {
    const quiz = await minigameService.createQuiz(req.body);
    res.status(201).json({ message: 'Quiz created', quiz });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

const updateQuiz = async (req, res) => {
  try {
    const quiz = await minigameService.updateQuiz(req.params.id, req.body);
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    res.json({ message: 'Quiz updated', quiz });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

const deleteQuiz = async (req, res) => {
  try {
    const quiz = await minigameService.deleteQuiz(req.params.id);
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }
    res.json({ message: 'Quiz deleted' });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
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