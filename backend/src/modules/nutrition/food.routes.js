const express = require('express');
const router = express.Router();

const {
  getFoods,
  getFood,
  addFood,
  updateFood,
  deleteFood,
  getSafeFoodsForUser
} = require('./food.controller');

const { authenticateToken, authorizeRoles } = require('../../middleware/auth.middleware');

router.get('/', getFoods);

router.get('/safe/list', authenticateToken, getSafeFoodsForUser);

router.post('/', authenticateToken, authorizeRoles('admin', 'super_admin'), addFood);

router.put('/:id', authenticateToken, authorizeRoles('admin', 'super_admin'), updateFood);

router.delete('/:id', authenticateToken, authorizeRoles('admin', 'super_admin'), deleteFood);

router.get('/:id', getFood);

module.exports = router;