const fs = require('fs');
const path = './src/modules/workouts/workout.routes.js';

let source = fs.readFileSync(path, 'utf8');

if (!source.includes("require('./mobility-library.controller')")) {
  const importBlock = `
const {
  getMemberMovements,
  getAdminMovements,
  createMovement,
  updateMovement,
  deactivateMovement,
  uploadMovementVideo,
  deleteMovementVideo
} = require('./mobility-library.controller');
`;
  source = source.replace(
    "const {\n  uploadVideo,\n  deleteVideo\n} = require('./exercise-video.controller');",
    "const {\n  uploadVideo,\n  deleteVideo\n} = require('./exercise-video.controller');\n" + importBlock
  );
}

if (!source.includes("router.get('/mobility-test/movements'")) {
  const routes = `
// Mobility movement library - member access
router.get(
  '/mobility-test/movements',
  authenticateToken,
  getMemberMovements
);

// Mobility movement library - admin management
router.get(
  '/admin/mobility-test/movements',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  getAdminMovements
);

router.post(
  '/admin/mobility-test/movements',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  createMovement
);

router.put(
  '/admin/mobility-test/movements/:id',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  updateMovement
);

router.delete(
  '/admin/mobility-test/movements/:id',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  deactivateMovement
);

router.put(
  '/admin/mobility-test/movements/:id/video',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  handleExerciseVideoUpload,
  uploadMovementVideo
);

router.delete(
  '/admin/mobility-test/movements/:id/video',
  authenticateToken,
  authorizeRoles('admin', 'super_admin'),
  deleteMovementVideo
);

`;
  source = source.replace('// Workout logs', routes + '// Workout logs');
}

fs.writeFileSync(path, source, 'utf8');
console.log('Mobility library routes added.');
