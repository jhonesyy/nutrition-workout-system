const pool = require('../../config/db');
const { configureCloudinary } = require('../../config/cloudinary');

const FIELDS = [
  'movement_key',
  'name',
  'body_area',
  'description',
  'instructions',
  'safety_notes',
  'sort_order',
  'is_active'
];

function validateMovement(data, partial = false) {
  const result = {};

  for (const field of FIELDS) {
    if (partial && data[field] === undefined) continue;

    const value = data[field];

    if (field === 'sort_order') {
      const number = Number(value);
      if (!Number.isInteger(number) || number < 0) {
        throw new Error('sort_order must be a non-negative integer.');
      }
      result[field] = number;
      continue;
    }

    if (field === 'is_active') {
      if (typeof value !== 'boolean') {
        throw new Error('is_active must be true or false.');
      }
      result[field] = value;
      continue;
    }

    if (value !== null && typeof value !== 'string') {
      throw new Error(`${field} must be a string.`);
    }

    const normalized = typeof value === 'string' ? value.trim() : null;

    if (['movement_key', 'name', 'body_area', 'instructions'].includes(field)) {
      if (!normalized) throw new Error(`${field} is required.`);
    }

    if (normalized && normalized.length > 5000) {
      throw new Error(`${field} is too long.`);
    }

    result[field] = normalized || null;
  }

  if (!partial) {
    for (const required of ['movement_key', 'name', 'body_area', 'instructions']) {
      if (!result[required]) throw new Error(`${required} is required.`);
    }
  }

  if (result.movement_key &&
      !/^[a-z0-9_]+$/.test(result.movement_key)) {
    throw new Error('movement_key can only contain lowercase letters, numbers, and underscores.');
  }

  return result;
}

async function getMovements(activeOnly = false) {
  const result = await pool.query(
    `SELECT id, movement_key, name, body_area, description,
            instructions, safety_notes, video_url,
            video_duration_seconds, video_bytes, video_format,
            sort_order, is_active, created_at, updated_at
     FROM workout.mobility_test_movements
     ${activeOnly ? 'WHERE is_active = TRUE' : ''}
     ORDER BY sort_order ASC, id ASC`
  );

  return result.rows;
}

async function createMovement(data) {
  const movement = validateMovement(data);

  const result = await pool.query(
    `INSERT INTO workout.mobility_test_movements (
       movement_key, name, body_area, description, instructions,
       safety_notes, sort_order, is_active
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      movement.movement_key,
      movement.name,
      movement.body_area,
      movement.description,
      movement.instructions,
      movement.safety_notes,
      movement.sort_order ?? 0,
      movement.is_active ?? true
    ]
  );

  return result.rows[0];
}

async function updateMovement(id, data) {
  const movement = validateMovement(data, true);
  const entries = Object.entries(movement);

  if (!entries.length) throw new Error('No changes provided.');

  const values = entries.map(([, value]) => value);
  values.push(id);

  const assignments = entries.map(
    ([field], index) => `${field} = $${index + 1}`
  );

  const result = await pool.query(
    `UPDATE workout.mobility_test_movements
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );

  if (!result.rows[0]) throw new Error('Mobility movement not found.');

  return result.rows[0];
}

async function deactivateMovement(id) {
  const result = await pool.query(
    `UPDATE workout.mobility_test_movements
     SET is_active = FALSE, updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, is_active`,
    [id]
  );

  if (!result.rows[0]) throw new Error('Mobility movement not found.');

  return result.rows[0];
}

function uploadToCloudinary(file) {
  const cloudinary = configureCloudinary();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'nutrifit/mobility-test-videos',
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
}

async function deleteCloudinaryVideo(publicId) {
  if (!publicId) return;

  const cloudinary = configureCloudinary();
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: 'video',
    invalidate: true
  });

  if (!['ok', 'not found'].includes(result.result)) {
    throw new Error('Cloudinary could not delete the video.');
  }
}

async function uploadMovementVideo(id, file) {
  if (!file) throw new Error('Select a tutorial video to upload.');

  const existingResult = await pool.query(
    `SELECT id, name, video_public_id
     FROM workout.mobility_test_movements
     WHERE id = $1`,
    [id]
  );

  const existing = existingResult.rows[0];
  if (!existing) throw new Error('Mobility movement not found.');

  const uploaded = await uploadToCloudinary(file);

  let updated;

  try {
    const result = await pool.query(
      `UPDATE workout.mobility_test_movements
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
        id
      ]
    );

    updated = result.rows[0];

    if (!updated) throw new Error('Mobility movement could not be updated.');
  } catch (error) {
    try {
      await deleteCloudinaryVideo(uploaded.public_id);
    } catch (cleanupError) {
      console.error('Cloudinary cleanup failed:', cleanupError);
    }
    throw error;
  }

  if (existing.video_public_id) {
    try {
      await deleteCloudinaryVideo(existing.video_public_id);
    } catch (error) {
      console.error('Previous mobility video cleanup failed:', error);
    }
  }

  return updated;
}

async function removeMovementVideo(id) {
  const existingResult = await pool.query(
    `SELECT id, name, video_public_id
     FROM workout.mobility_test_movements
     WHERE id = $1`,
    [id]
  );

  const existing = existingResult.rows[0];
  if (!existing) throw new Error('Mobility movement not found.');
  if (!existing.video_public_id) throw new Error('This movement has no video.');

  await pool.query(
    `UPDATE workout.mobility_test_movements
     SET video_url = NULL,
         video_public_id = NULL,
         video_duration_seconds = NULL,
         video_bytes = NULL,
         video_format = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [id]
  );

  try {
    await deleteCloudinaryVideo(existing.video_public_id);
  } catch (error) {
    console.error('Cloudinary video deletion failed:', error);
    throw new Error('Database video reference cleared, but Cloudinary cleanup failed. Check Cloudinary assets.');
  }

  return { id: existing.id, name: existing.name };
}

module.exports = {
  getMovements,
  createMovement,
  updateMovement,
  deactivateMovement,
  uploadMovementVideo,
  removeMovementVideo
};
