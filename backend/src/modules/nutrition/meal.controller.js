const mealService = require('./meal.service');

const createMealLog = async (req, res) => {
  try {
    const meal = await mealService.logMeal(req.user.userId, req.body);
    res.status(201).json({
      message: 'Meal logged successfully',
      meal
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

const getMeals = async (req, res) => {
  try {
    const meals = await mealService.getTodayMeals(req.user.userId);
    res.json(meals);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getSummary = async (req, res) => {
  try {
    const summary = await mealService.getDailySummary(req.user.userId);
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

const removeMeal = async (req, res) => {
  try {
    const deleted = await mealService.deleteMeal(req.user.userId, req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Meal log not found' });
    }
    res.json({ message: 'Meal log deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getRecommendations = async (req, res) => {
  try {
    const result = await mealService.recommendMeals(req.user.userId);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

const getAdminMealLogs = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const date = req.query.date;

    const logs = date
      ? await mealService.getMealLogsByDate(date)
      : await mealService.getRecentMealLogs(limit);

    res.json({ logs });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createMealLog,
  getMeals,
  getSummary,
  removeMeal,
  getRecommendations,
  getAdminMealLogs
};