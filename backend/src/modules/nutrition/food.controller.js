const foodService = require('./food.service');

const getFoods = async (req, res) => {
  try {
    const search = req.query.search || '';
    const foods = await foodService.getAllFoods(search);
    res.json(foods);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getFood = async (req, res) => {
  try {
    const food = await foodService.getFoodById(req.params.id);
    if (!food) {
      return res.status(404).json({ message: 'Food not found' });
    }
    res.json(food);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const addFood = async (req, res) => {
  try {
    const food = await foodService.createFood(req.body);
    res.status(201).json({
      message: 'Food added successfully',
      food
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateFood = async (req, res) => {
  try {
    const { id } = req.params;
    const food = await foodService.updateFood(id, req.body);
    if (!food) {
      return res.status(404).json({ message: 'Food not found' });
    }
    res.json({ message: 'Food updated successfully', food });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteFood = async (req, res) => {
  try {
    const { id } = req.params;
    const food = await foodService.softDeleteFood(id);
    if (!food) {
      return res.status(404).json({ message: 'Food not found' });
    }
    res.json({ message: 'Food deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getSafeFoodsForUser = async (req, res) => {
  try {
    const search = req.query.search || '';
    const foods = await foodService.getSafeFoods(req.user.userId, search);
    res.json(foods);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getFoods,
  getFood,
  addFood,
  updateFood,
  deleteFood,
  getSafeFoodsForUser
};