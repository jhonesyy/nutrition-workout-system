const healthService = require('./health.service');

const sync = async (req, res) => {
  try {
    const { steps, active_calories } = req.body;
    const result = await healthService.syncActivity(req.user.userId, {
      steps,
      active_calories
    });
    res.json({
      message: 'Activity synced successfully',
      activity: result
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

const getToday = async (req, res) => {
  try {
    const activity = await healthService.getTodayActivity(req.user.userId);
    res.json(activity);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getHistory = async (req, res) => {
  try {
    const history = await healthService.getActivityHistory(req.user.userId);
    res.json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  sync,
  getToday,
  getHistory
};