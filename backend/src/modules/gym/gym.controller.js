const gymService = require('./gym.service');

const getSettings = async (req, res) => {
  try {
    const settings = await gymService.getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    const settings = await gymService.updateSettings(req.body);
    res.json({ message: 'Gym settings updated', settings });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const listRewards = async (req, res) => {
  try {
    const rewards = await gymService.getAllRewards();
    res.json({ rewards });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addReward = async (req, res) => {
  try {
    const reward = await gymService.createReward(req.body);
    res.status(201).json({ message: 'Reward created', reward });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const editReward = async (req, res) => {
  try {
    const reward = await gymService.updateReward(req.params.id, req.body);
    if (!reward) return res.status(404).json({ message: 'Reward not found' });
    res.json({ message: 'Reward updated', reward });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const removeReward = async (req, res) => {
  try {
    const reward = await gymService.deleteReward(req.params.id);
    if (!reward) return res.status(404).json({ message: 'Reward not found' });
    res.json({ message: 'Reward deactivated' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getSettings,
  updateSettings,
  listRewards,
  addReward,
  editReward,
  removeReward
};