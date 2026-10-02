const userService = require('./user.service');

// ======================
// USER (own profile)
// ======================
const getMyProfile = async (req, res) => {
  try {
    const profile = await userService.getProfile(req.user.userId);
    if (!profile) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(profile);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const updated = await userService.upsertProfile(req.user.userId, req.body);
    res.json({
      message: 'Profile updated successfully',
      profile: updated
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

const getTDEE = async (req, res) => {
  try {
    const result = await userService.calculateTDEE(req.user.userId);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
};

// ======================
// ADMIN FUNCTIONS
// ======================
const listUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createStaffAccount = async (req, res) => {
  try {
    const { email, password, full_name, role } = req.body;

    if (!email || !password || !full_name || !role) {
      return res.status(400).json({
        message: 'email, password, full_name and role are required'
      });
    }

    if (!['admin', 'gym_manager'].includes(role)) {
      return res.status(400).json({
        message: 'Role must be admin or gym_manager'
      });
    }

    const user = await userService.createStaffUser({
      email,
      password,
      full_name,
      role
    });

    res.status(201).json({
      message: 'Staff account created successfully',
      user
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const setUserActiveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ message: 'is_active must be true or false' });
    }

    // Prevent admin from deactivating themselves
    if (Number(id) === req.user.userId) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }

    const user = await userService.setActiveStatus(id, is_active);
    res.json({
      message: `User ${is_active ? 'activated' : 'deactivated'} successfully`,
      user
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// ======================
// EXPORT ONCE
// ======================
module.exports = {
  getMyProfile,
  updateMyProfile,
  getTDEE,
  listUsers,
  createStaffAccount,
  setUserActiveStatus
};