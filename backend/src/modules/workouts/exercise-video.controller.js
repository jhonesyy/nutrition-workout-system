const exerciseVideoService = require('./exercise-video.service');

const uploadVideo = async (req, res) => {
  try {
    const exerciseId = Number(req.params.id);

    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
      return res.status(400).json({
        message: 'Invalid exercise ID.'
      });
    }

    const exercise = await exerciseVideoService.uploadExerciseVideo(
      exerciseId,
      req.file
    );

    return res.json({
      message: 'Exercise video uploaded successfully.',
      exercise
    });
  } catch (error) {
    console.error('Exercise video upload error:', error);

    return res.status(400).json({
      message: error.message || 'Exercise video upload failed.'
    });
  }
};

const deleteVideo = async (req, res) => {
  try {
    const exerciseId = Number(req.params.id);

    if (!Number.isInteger(exerciseId) || exerciseId <= 0) {
      return res.status(400).json({
        message: 'Invalid exercise ID.'
      });
    }

    const exercise = await exerciseVideoService.deleteExerciseVideo(
      exerciseId
    );

    return res.json({
      message: 'Exercise video deleted successfully.',
      exercise
    });
  } catch (error) {
    console.error('Exercise video deletion error:', error);

    return res.status(400).json({
      message: error.message || 'Exercise video deletion failed.'
    });
  }
};

module.exports = {
  uploadVideo,
  deleteVideo
};
