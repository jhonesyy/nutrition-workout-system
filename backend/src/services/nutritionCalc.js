'use strict';

// Shared nutrition math. Single source of truth.
// Used by: meal.service (summary), user.service (calculateTDEE), ai.controller (plans/chat).

const ACTIVITY_MIN = 1.2;
const ACTIVITY_MAX = 1.9;
const DEFAULT_ACTIVITY = 1.2;

// Floor applied only when a calorie deficit is requested.
const CALORIE_FLOOR = { male: 1500, female: 1200, other: 1200 };

// Mifflin-St Jeor sex offset. 'other' uses midpoint.
const SEX_OFFSET = { male: 5, female: -161, other: -78 };

const DEFAULT_GOAL = { adj: 0, protein: 0.3, carbs: 0.4, fat: 0.3 };

const GOAL_PROFILES = {
  'weight loss': { adj: -500, protein: 0.35, carbs: 0.35, fat: 0.3 },
  cutting: { adj: -500, protein: 0.35, carbs: 0.35, fat: 0.3 },
  bulking: { adj: 400, protein: 0.3, carbs: 0.45, fat: 0.25 },
  recomposition: { adj: 0, protein: 0.35, carbs: 0.35, fat: 0.3 },
  toning: { adj: 0, protein: 0.35, carbs: 0.35, fat: 0.3 },
  athletic: { adj: 250, protein: 0.3, carbs: 0.45, fat: 0.25 },
  performance: { adj: 250, protein: 0.3, carbs: 0.45, fat: 0.25 },
  hypertrophy: { adj: 250, protein: 0.3, carbs: 0.45, fat: 0.25 },
  strength: { adj: 300, protein: 0.3, carbs: 0.4, fat: 0.3 },
};

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const incompleteError = (message) => {
  const err = new Error(
    message || 'Incomplete profile. Please update age, sex, height, and weight first.'
  );
  err.code = 'INCOMPLETE_PROFILE';
  return err;
};

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const normalizeSex = (sex) => {
  const s = String(sex ?? '').trim().toLowerCase();
  return own(SEX_OFFSET, s) ? s : null;
};

const normalizeGoal = (goal) => String(goal ?? '').trim().toLowerCase();

const normalizeAllergens = (value) => {
  const list = typeof value === 'string' ? value.split(',') : value;
  if (!Array.isArray(list)) return [];
  const cleaned = list.map((a) => String(a).trim().toLowerCase()).filter(Boolean);
  return [...new Set(cleaned)];
};

const pct = (ratio) => `${Math.round(ratio * 100)}%`;

const computeTargets = (profile) => {
  if (!profile) {
    throw incompleteError('Profile not found. Please complete your profile first.');
  }

  const age = toNumber(profile.age);
  const height = toNumber(profile.height_cm);
  const weight = toNumber(profile.weight_kg);
  const sex = normalizeSex(profile.sex);

  if (!age || !height || !weight || !sex) throw incompleteError();
  if (age < 10 || age > 120 || height <= 0 || weight <= 0) {
    throw incompleteError('Profile values are out of range.');
  }

  const activity = Math.min(
    ACTIVITY_MAX,
    Math.max(ACTIVITY_MIN, toNumber(profile.activity_factor) ?? DEFAULT_ACTIVITY)
  );

  const bmr = 10 * weight + 6.25 * height - 5 * age + SEX_OFFSET[sex];
  const tdee = Math.round(bmr * activity);

  const goalKey = normalizeGoal(profile.goal_type);
  const goal = own(GOAL_PROFILES, goalKey) ? GOAL_PROFILES[goalKey] : DEFAULT_GOAL;

  let target = tdee + goal.adj;
  const floor = CALORIE_FLOOR[sex];
  const floorApplied = goal.adj < 0 && target < floor;
  if (floorApplied) target = floor;
  target = Math.round(target);

  return {
    bmr: Math.round(bmr),
    tdee,
    target_calories: target,
    calorie_adjustment: target - tdee,
    floor_applied: floorApplied,
    protein_g: Math.round((target * goal.protein) / 4),
    carbs_g: Math.round((target * goal.carbs) / 4),
    fat_g: Math.round((target * goal.fat) / 9),
    macro_ratios: {
      protein: pct(goal.protein),
      carbs: pct(goal.carbs),
      fat: pct(goal.fat),
    },
  };
};

module.exports = {
  computeTargets,
  normalizeSex,
  normalizeGoal,
  normalizeAllergens,
  GOAL_PROFILES,
  CALORIE_FLOOR,
};