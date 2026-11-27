const pool = require('../../config/db');
const {
  configureCloudinary
} = require('../../config/cloudinary');

const uploadToCloudinary = (file) => {
  const cloudinary = configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'nutrifit/exercise-videos',
        resource_type: 'video',
        allowed_formats: ['mp4', 'mov', 'webm'],
        chunk_size: 6000000
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(file.buffer);
  });
};

const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;

  const cloudinary = configureCloudinary();

  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: 'video',
    invalidate: true
  });

  if (!['ok', 'not found'].includes(result.result)) {
    throw new Error('Cloudinary could not delete the previous video.');
  }

  return result;
};

const uploadExerciseVideo = async (exerciseId, file) => {
  if (!file) {
    throw new Error('Select a video file to upload.');
  }

  const exerciseResult = await pool.query(
    `SELECT id, name, video_public_id
     FROM workout.exercises
     WHERE id = $1`,
    [exerciseId]
  );

  const exercise = exerciseResult.rows[0];

  if (!exercise) {
    throw new Error('Exercise not found.');
  }

  const uploaded = await uploadToCloudinary(file);

  try {
    const updateResult = await pool.query(
      `UPDATE workout.exercises
       SET video_url = $1,
           video_public_id = $2,
           video_duration_seconds = $3,
           video_bytes = $4,
           video_format = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, name, video_url, video_duration_seconds,
                 video_bytes, video_format`,
      [
        uploaded.secure_url,
        uploaded.public_id,
        Math.round(uploaded.duration || 0),
        uploaded.bytes,
        uploaded.format,
        exerciseId
      ]
    );

    if (!updateResult.rows[0]) {
      throw new Error('Exercise could not be updated.');
    }
  } catch (error) {
    try {
      await deleteFromCloudinary(uploaded.public_id);
    } catch (cleanupError) {
      console.error(
        'Cloudinary cleanup after failed database update:',
        cleanupError
      );
    }

    throw error;
  }

  if (exercise.video_public_id) {
    try {
      await deleteFromCloudinary(exercise.video_public_id);
    } catch (error) {
      console.error(
        'Previous exercise video cleanup failed:',
        error
      );
    }
  }

  return updateResultValue(exerciseId);
};

const updateResultValue = async (exerciseId) => {
  const result = await pool.query(
    `SELECT id, name, video_url, video_duration_seconds,
            video_bytes, video_format
     FROM workout.exercises
     WHERE id = $1`,
    [exerciseId]
  );

  return result.rows[0];
};

const deleteExerciseVideo = async (exerciseId) => {
  const result = await pool.query(
    `SELECT id, name, video_public_id
     FROM workout.exercises
     WHERE id = $1`,
    [exerciseId]
  );

  const exercise = result.rows[0];

  if (!exercise) {
    throw new Error('Exercise not found.');
  }

  if (!exercise.video_public_id) {
    throw new Error('This exercise has no uploaded video.');
  }

  await deleteFromCloudinary(exercise.video_public_id);

  const updateResult = await pool.query(
    `UPDATE workout.exercises
     SET video_url = NULL,
         video_public_id = NULL,
         video_duration_seconds = NULL,
         video_bytes = NULL,
         video_format = NULL,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name`,
    [exerciseId]
  );

  return updateResult.rows[0];
};

module.exports = {
  uploadExerciseVideo,
  deleteExerciseVideo
};
