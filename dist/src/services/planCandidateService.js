import { repositories } from '../repositories/repositoryHub.js';

export const MAX_PLANNER_CANDIDATES_PER_ARCHETYPE = 500;

export class PlanCandidateService {
  constructor({ repo = repositories } = {}) { this.repo = repo; }

  async installedRecipeVersionIds() {
    const version = await this.repo.getMeta('activeCatalogVersion');
    if (!version) return new Set();
    const packs = await this.repo.getAllByIndex('catalogPacks', 'catalogVersion', { kind: 'only', value: version });
    return new Set(packs.filter(pack => pack.status === 'installed').flatMap(pack => pack.recipeVersionIds || []));
  }

  async retrieve(mealArchetype, { limit = MAX_PLANNER_CANDIDATES_PER_ARCHETYPE, excludeAllergens = [] } = {}) {
    const bounded = Math.min(MAX_PLANNER_CANDIDATES_PER_ARCHETYPE, Math.max(1, Number(limit) || MAX_PLANNER_CANDIDATES_PER_ARCHETYPE));
    const versions = await this.repo.getAllByIndex('recipeVersions', 'mealArchetypes', { kind: 'only', value: mealArchetype }, bounded);
    const families = new Map((await this.repo.getMany('recipes', [...new Set(versions.map(version => version.recipeId))])).map(record => [record.recipeId, record]));
    const installed = await this.installedRecipeVersionIds();
    const excluded = new Set(excludeAllergens);
    return versions.filter(version => {
      const family = families.get(version.recipeId);
      if (!family || family.status !== 'active' || family.currentVersionId !== version.recipeVersionId) return false;
      if (version.origin === 'base' && !installed.has(version.recipeVersionId)) return false;
      if (!['validated', 'curated'].includes(version.quality?.status)) return false;
      if (excluded.size && (version.allergenIds || []).some(id => excluded.has(id))) return false;
      return true;
    }).slice(0, bounded);
  }
}
