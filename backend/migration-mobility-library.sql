CREATE TABLE IF NOT EXISTS workout.mobility_test_movements (
    id SERIAL PRIMARY KEY,
    movement_key VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    body_area VARCHAR(100) NOT NULL,
    description TEXT,
    instructions TEXT NOT NULL,
    safety_notes TEXT,
    video_url TEXT,
    video_public_id TEXT,
    video_duration_seconds INTEGER,
    video_bytes BIGINT,
    video_format VARCHAR(20),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mobility_movements_active_order
ON workout.mobility_test_movements (is_active, sort_order, id);

INSERT INTO workout.mobility_test_movements
(movement_key, name, body_area, description, instructions, safety_notes, sort_order)
VALUES
(
    'neck_rotation',
    'Neck Rotation',
    'Neck',
    'Checks comfortable side-to-side neck movement.',
    'Sit or stand upright. Slowly turn your head to the left, return to center, then turn to the right. Do not force the movement.',
    'Stop if you feel pain, dizziness, numbness, or tingling.',
    1
),
(
    'shoulder_raise',
    'Shoulder Raise',
    'Shoulders',
    'Checks overhead shoulder mobility.',
    'Stand upright. Slowly raise both arms overhead as far as comfortable, then lower them.',
    'Do not force your arms overhead. Stop if you feel pain or pinching.',
    2
),
(
    'shoulder_external_rotation',
    'Shoulder External Rotation',
    'Shoulders',
    'Checks comfortable outward shoulder rotation.',
    'Keep your elbows close to your sides and bent at approximately 90 degrees. Slowly rotate your forearms outward.',
    'Avoid forcing the shoulders or arching your back.',
    3
),
(
    'wall_slide',
    'Wall Slide',
    'Shoulders and Upper Back',
    'Checks shoulder movement while maintaining upper-back posture.',
    'Stand with your back near a wall. Place your arms in a comfortable goalpost position and slowly slide them upward.',
    'Only move through a comfortable range. Stop if you feel shoulder pain.',
    4
),
(
    'thoracic_rotation',
    'Thoracic Rotation',
    'Upper Back',
    'Checks upper-back rotational movement.',
    'Sit upright with arms crossed over your chest. Slowly rotate your upper body left and right while keeping your hips facing forward.',
    'Avoid twisting forcefully or moving through lower-back pain.',
    5
),
(
    'wrist_extension',
    'Wrist Extension',
    'Wrists',
    'Checks comfortable wrist extension.',
    'Extend one arm forward with the palm facing down. Gently raise the hand at the wrist, then repeat on the other side.',
    'Do not pull or push the wrist into a painful position.',
    6
),
(
    'overhead_reach',
    'Overhead Reach',
    'Shoulders and Torso',
    'Checks comfortable overhead reaching.',
    'Stand naturally and slowly reach both hands overhead without leaning backward.',
    'Avoid arching your lower back or forcing the reach.',
    7
),
(
    'toe_touch',
    'Standing Toe Touch',
    'Hamstrings and Lower Back',
    'Checks comfortable forward bending.',
    'Stand with feet comfortable and knees slightly relaxed. Hinge at the hips and reach toward your feet only as far as comfortable.',
    'Do not bounce or force the stretch. Stop if you feel sharp back or leg pain.',
    8
),
(
    'hip_flexor',
    'Half-Kneeling Hip Flexor Check',
    'Hips',
    'Checks comfortable hip extension.',
    'Use a stable support if needed. Place one knee on a padded surface and the other foot in front. Gently shift forward without arching your back.',
    'Use padding. Skip this movement if kneeling is uncomfortable.',
    9
),
(
    'hip_rotation',
    'Seated Hip Rotation',
    'Hips',
    'Checks comfortable inward and outward hip rotation.',
    'Sit upright on a stable chair. Keep your knees bent and gently move one foot inward and outward. Repeat on the other side.',
    'Do not force the hip or continue through groin or joint pain.',
    10
),
(
    'ankle_dorsiflexion',
    'Knee-to-Wall Ankle Check',
    'Ankles',
    'Checks ankle movement while the heel stays grounded.',
    'Face a wall in a staggered stance. Keep the front heel on the floor and gently move the knee toward the wall.',
    'Do not force the knee forward or allow the heel to lift.',
    11
),
(
    'bodyweight_squat',
    'Bodyweight Squat',
    'Hips, Knees and Ankles',
    'Checks comfortable squat movement.',
    'Stand with feet at a comfortable width. Slowly lower into a shallow squat, then return to standing. Use a stable support if needed.',
    'Only squat as far as comfortable. Stop if you feel pain, dizziness, or instability.',
    12
),
(
    'single_leg_balance',
    'Single-Leg Balance',
    'Balance and Lower Body',
    'Checks basic standing balance.',
    'Stand beside a stable support. Shift your weight to one foot and briefly lift the other foot if safe. Repeat on the other side.',
    'Keep a hand near a stable support. Skip this check if you have balance concerns.',
    13
),
(
    'calf_raise',
    'Calf Raise',
    'Calves and Ankles',
    'Checks comfortable ankle plantar flexion and balance.',
    'Stand beside a stable support. Slowly rise onto your toes, then lower your heels. Use both feet.',
    'Avoid this movement if it causes ankle, foot, or calf pain.',
    14
),
(
    'supported_lunge',
    'Supported Split-Stance Lunge',
    'Hips and Lower Body',
    'Checks comfortable split-stance movement.',
    'Stand near a stable support with one foot forward and one foot behind. Bend both knees slightly, then return to standing. Repeat on the other side.',
    'Use support and a shallow range. Skip if kneeling or lunging is uncomfortable.',
    15
)
ON CONFLICT (movement_key) DO NOTHING;
