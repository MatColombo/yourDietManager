import { hardFilterRecipe } from '../planner/hardFilter.js';
import { currentSafetyRevisionMap } from '../domain/safetyPolicy.js';
import { repositories } from '../repositories/repositoryHub.js';
import { availableCurrentRecipeIds } from './catalogAvailability.js';
import { allergenCompatibility } from '../domain/safetyCompatibility.js';
import { recipeMatchesTarget } from '../planner/recipeFeatures.js';
import { frequencyRules } from '../domain/frequencyCounter.js';

export const MAX_PLANNER_CANDIDATES_PER_ARCHETYPE = 500;
export class PlanCandidateService {
  constructor({ repo = repositories } = {}) { this.repo = repo; this.lastDiagnostics = null; }
  async installedRecipeVersionIds() { return new Set(await availableCurrentRecipeIds(this.repo)); }
  async retrieve(mealArchetype, { limit = MAX_PLANNER_CANDIDATES_PER_ARCHETYPE, excludeAllergens = [], foodPreferences = null, foodGroups = [], eligibilityContexts = [] } = {}) {
    const bounded = Math.min(MAX_PLANNER_CANDIDATES_PER_ARCHETYPE, Math.max(1, Number(limit) || MAX_PLANNER_CANDIDATES_PER_ARCHETYPE));
    const ids = await availableCurrentRecipeIds(this.repo);
    const versions = await this.repo.getMany('recipeVersions', ids);
    const unresolved = new Set(((await this.repo.getMeta('contentMigration:4'))?.unresolved || []).map(item => item.ingredientId));
    const revisions = new Map((await this.repo.getMany('ingredientRevisions', [...new Set(versions.flatMap(version => version.ingredientLines.map(line => line.ingredientRevisionId)))])).map(row => [row.ingredientRevisionId, row]));
    const ingredientFamilies = eligibilityContexts.length ? await this.repo.getAll('ingredients') : [];
    const safetyRevisionById = currentSafetyRevisionMap([...revisions.values()], ingredientFamilies, [...revisions.values(), ...await this.repo.getMany('ingredientRevisions', ingredientFamilies.map(f => f.currentRevisionId))]);
    const hardRejectionCounts = {};
    const eligible = versions.filter(version => version.mealArchetypes.includes(mealArchetype) && ['validated', 'curated'].includes(version.quality?.status)
      && !version.ingredientLines.some(line => unresolved.has(line.ingredientId)) && excludeAllergens.every(id => allergenCompatibility(version, id, revisions) === 'compatible')).filter(version => {
      if (!eligibilityContexts.length) return true;
      const checks = eligibilityContexts.map(context => hardFilterRecipe(version, { ...context, revisionById: revisions, safetyRevisionById, foodGroups, foodPreferences }));
      if (checks.some(check => check.allowed)) return true;
      for (const reason of new Set(checks.flatMap(check => check.reasons))) hardRejectionCounts[reason] = (hardRejectionCounts[reason] || 0) + 1;
      return false;
    });
    const targets = frequencyRules(foodPreferences).filter(rule => rule.mode === 'frequency').map(rule => rule.target);
    const buckets = new Map();
    for (const recipe of eligible.sort((a, b) => a.calculatedNutrition.energyKcal - b.calculatedNutrition.energyKcal || a.recipeVersionId.localeCompare(b.recipeVersionId))) {
      const key = `${Math.floor(recipe.calculatedNutrition.energyKcal / 100)}|${targets.map(target => recipeMatchesTarget(recipe, target.type, target.id, revisions, foodGroups) ? '1' : '0').join('')}`;
      if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(recipe);
    }
    const selected = []; const ordered = [...buckets.keys()].sort(); let depth = 0;
    while (selected.length < bounded) {
      let added = 0;
      for (const key of ordered) { const value = buckets.get(key)[depth]; if (value && selected.length < bounded) { selected.push(value); added += 1; } }
      if (!added) break; depth += 1;
    }
    this.lastDiagnostics = { currentAvailableCount: versions.length, eligibleCount: eligible.length, selectedCount: selected.length, limit: bounded,
      hardRejectionCounts, truncated: eligible.length > selected.length, selection: 'deterministic_energy_and_target_strata', strata: buckets.size };
    return selected;
  }
}
