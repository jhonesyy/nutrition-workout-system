const express = require('express');
const router = express.Router();
const { sync, getToday, getHistory } = require('./health.controller');
const { authenticateToken } = require('../../middleware/auth.middleware');

router.post('/sync', authenticateToken, sync);
router.get('/today', authenticateToken, getToday);
router.get('/history', authenticateToken, getHistory);

module.exports = router;