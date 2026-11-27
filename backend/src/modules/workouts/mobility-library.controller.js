const service = require('./mobility-library.service');

const getMemberMovements = async (req, res) => {
  try {
    res.json({ movements: await service.getMovements(true) });
  } catch (error) {
    console.error('Get member mobility movements error:', error);
    res.status(500).json({ message: 'Unable to load mobility movements.' });
  }
};

const getAdminMovements = async (req, res) => {
  try {
    res.json({ movements: await service.getMovements(false) });
  } catch (error) {
    console.error('Get admin mobility movements error:', error);
    res.status(500).json({ message: 'Unable to load mobility library.' });
  }
};

const createMovement = async (req, res) => {
  try {
    const movement = await service.createMovement(req.body);
    res.status(201).json({
      message: 'Mobility movement created successfully.',
      movement
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateMovement = async (req, res) => {
  try {
    const movement = await service.updateMovement(
      Number(req.params.id),
      req.body
    );
    res.json({
      message: 'Mobility movement updated successfully.',
      movement
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deactivateMovement = async (req, res) => {
  try {
    const movement = await service.deactivateMovement(
      Number(req.params.id)
    );
    res.json({
      message: 'Mobility movement deactivated. Existing member answers are preserved.',
      movement
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const uploadMovementVideo = async (req, res) => {
  try {
    const movement = await service.uploadMovementVideo(
      Number(req.params.id),
      req.file
    );
    res.json({
      message: 'Mobility tutorial video uploaded successfully.',
      movement
    });
  } catch (error) {
    console.error('Mobility video upload error:', error);
    res.status(400).json({ message: error.message });
  }
};

const deleteMovementVideo = async (req, res) => {
  try {
    const movement = await service.removeMovementVideo(
      Number(req.params.id)
    );
    res.json({
      message: 'Mobility tutorial video deleted.',
      movement
    });
  } catch (error) {
    console.error('Mobility video delete error:', error);
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getMemberMovements,
  getAdminMovements,
  createMovement,
  updateMovement,
  deactivateMovement,
  uploadMovementVideo,
  deleteMovementVideo
};
