const express = require('express');
const router = express.Router();
const aiController = require('./ai.controller');

// Import authentication and role-authorization middleware
// Adjust this path if your project uses a different auth file (e.g., '../middleware/auth')
const { authenticateToken, authorizeRoles } = require('../../middleware/auth.middleware');

// Protect ALL routes in this file with JWT authentication
router.use(authenticateToken);

// ==========================================
// EXISTING STRUCTURED PLAN ROUTES (PRESERVED)
// ==========================================
router.post('/meal-plan', aiController.generateMealPlan);
router.post('/workout-plan', aiController.generateWorkoutPlan);

// ==========================================
// CHAT & COMPARISON ROUTES (USER ACCESS)
// ==========================================
router.post('/chat', aiController.chatWithAI);
router.post('/compare', aiController.compareAI);
router.get('/history/:conversation_id', aiController.getHistory);

// ==========================================
// ADMIN MANAGEMENT ROUTES (ADMIN ACCESS ONLY)
// ==========================================
router.get('/admin/metrics', authorizeRoles('admin', 'super_admin'), aiController.getAIMetrics);
router.post('/admin/config', authorizeRoles('admin', 'super_admin'), aiController.updateAIConfig);

module.exports = router;