import { seededTie } from './seededRandom.js';
import { families, cuisines, primaryIngredientId } from './recipeFeatures.js';

export const EXPLORATION_POLICY_VERSION = 'planner-exposure-1';

const PROFILES = Object.freeze([
  Object.freeze({ mode: 'balanced', weight: 0.3, randomShare: 0.4, qualityShare: 0.25, targetShare: 0.2, featureShare: 0.15, scoreJitter: 4, planScoreJitter: 4, pickMode: 'weighted' }),
  Object.freeze({ mode: 'broad', weight: 0.35, randomShare: 0.55, qualityShare: 0.15, targetShare: 0.15, featureShare: 0.15, scoreJitter: 10, planScoreJitter: 10, pickMode: 'uniform_feasible' }),
  Object.freeze({ mode: 'energy_stratified', weight: 0.15, randomShare: 0.35, qualityShare: 0.2, targetShare: 0.3, featureShare: 0.15, scoreJitter: 5, planScoreJitter: 5, pickMode: 'weighted' }),
  Object.freeze({ mode: 'taxonomy_stratified', weight: 0.2, randomShare: 0.4, qualityShare: 0.15, targetShare: 0.15, featureShare: 0.3, scoreJitter: 7, planScoreJitter: 7, pickMode: 'wide_weighted' })
]);

export function explorationProfile(seed, scopeKey = 'plan') {
  const roll = seededTie(`${seed}|exploration-mode`, scopeKey);
  let cumulative = 0;
  for (const profile of PROFILES) {
    cumulative += profile.weight;
    if (roll < cumulative) return profile;
  }
  return PROFILES.at(-1);
}

export function seededExposureOrder(values, seed, keyFor) {
  return [...values].sort((a, b) => {
    const aKey = keyFor(a); const bKey = keyFor(b);
    const delta = seededTie(`${seed}|exposure`, aKey) - seededTie(`${seed}|exposure`, bKey);
    return delta || String(aKey).localeCompare(String(bKey));
  });
}

export function signedSeedJitter(seed, key, amplitude) {
  if (!amplitude) return 0;
  return (seededTie(`${seed}|score-jitter`, key) * 2 - 1) * Number(amplitude || 0);
}

export function exploratoryScore(score, seed, key, amplitude) {
  return Number(score || 0) + signedSeedJitter(seed, key, amplitude);
}

export function recipeFeatureSignature(recipe) {
  const family = families(recipe).slice().sort().join(',') || 'family:none';
  const cuisine = cuisines(recipe).slice().sort().join(',') || 'cuisine:none';
  const primary = primaryIngredientId(recipe) || 'primary:none';
  return `${family}|${cuisine}|${primary}`;
}

export function quotaCounts(limit, profile) {
  const total = Math.max(0, Number(limit) || 0);
  if (!total) return { random: 0, quality: 0, target: 0, feature: 0 };
  const random = Math.max(1, Math.round(total * profile.randomShare));
  const feature = Math.max(1, Math.round(total * profile.featureShare));
  const target = Math.max(1, Math.round(total * profile.targetShare));
  const quality = Math.max(1, total - random - feature - target);
  return { random, quality, target, feature };
}
