import { repositories } from './repositoryHub.js';

export const appConfigRepository = {
  get: () => repositories.get('appConfigs', 'active'),
  save: config => repositories.put('appConfigs', config)
};

export const themeRepository = {
  get: id => repositories.get('themeProfiles', id),
  save: theme => repositories.put('themeProfiles', theme),
  getAll: () => repositories.getAll('themeProfiles')
};

export const recipeRepository = {
  count: () => repositories.count('recipes'),
  versionCount: () => repositories.count('recipeVersions'),
  getFamily: id => repositories.get('recipes', id),
  getVersion: id => repositories.get('recipeVersions', id)
};

export const ingredientRepository = {
  count: () => repositories.count('ingredients'),
  revisionCount: () => repositories.count('ingredientRevisions')
};
