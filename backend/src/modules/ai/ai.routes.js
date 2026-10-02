const express = require('express');
const router = express.Router();
const aiController = require('./ai.controller');
const { protect } = require('../../middleware/auth');

router.use(protect);

router.post('/meal-plan', aiController.generateMealPlan);
router.post('/workout-plan', aiController.generateWorkoutPlan);

module.exports = router;