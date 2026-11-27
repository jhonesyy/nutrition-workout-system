const multer = require('multer');

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;

const allowedMimeTypes = [
  'video/mp4',
  'video/quicktime',
  'video/webm'
];

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_VIDEO_SIZE,
    files: 1
  },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error('Only MP4, MOV, and WebM videos are allowed.')
      );
    }

    callback(null, true);
  }
});

const handleExerciseVideoUpload = (req, res, next) => {
  upload.single('video')(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          message: 'Video exceeds the 100 MB upload limit.'
        });
      }

      return res.status(400).json({
        message: error.message
      });
    }

    return res.status(400).json({
      message: error.message || 'Video upload validation failed.'
    });
  });
};

module.exports = {
  handleExerciseVideoUpload
};
