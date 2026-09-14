export const DB_NAME = 'yourDietManager';
export const DB_VERSION = 6;
export const CONTENT_SCHEMA_VERSION = 3;
export const BACKUP_FORMAT_VERSION = 1;
export const APP_VERSION = '1.0.0-rc.34';
export const PRE_V1_DATA_EPOCH = 'v1-planner-phase-d-epoch-1';

export const STORE_DEFINITIONS = {
  meta: { keyPath: 'key', indexes: [] },
  appConfigs: { indexes: [] },
  nutritionProfiles: { keyPath: 'id', indexes: [] },
  allergyIntoleranceProfiles: { keyPath: 'id', indexes: [] },
  foodPreferences: { keyPath: 'id', indexes: [] },
  themeProfiles: { keyPath: 'id', indexes: [] },
  mealClasses: { keyPath: 'id', indexes: [] },
  dayClasses: { keyPath: 'id', indexes: [] },
  cycles: { keyPath: 'id', indexes: [] },
  taxonomies: {
    keyPath: 'taxonomyId',
    indexes: [
      { name: 'status', keyPath: 'status' },
      { name: 'origin', keyPath: 'origin' }
    ]
  },
  taxonomyTerms: {
    keyPath: 'termId',
    indexes: [
      { name: 'taxonomyId', keyPath: 'taxonomyId' },
      { name: 'parentTermId', keyPath: 'parentTermId' },
      { name: 'status', keyPath: 'status' },
      { name: 'origin', keyPath: 'origin' },
      { name: 'taxonomyAndStatus', keyPath: ['taxonomyId', 'status'] },
      { name: 'searchTokens', keyPath: 'searchTokens', options: { multiEntry: true } }
    ]
  },
  ingredients: {
    keyPath: 'ingredientId',
    indexes: [
      { name: 'origin', keyPath: 'origin' },
      { name: 'status', keyPath: 'status' },
      { name: 'originAndStatus', keyPath: ['origin', 'status'] }
    ]
  },
  ingredientRevisions: {
    keyPath: 'ingredientRevisionId',
    indexes: [
      { name: 'ingredientId', keyPath: 'ingredientId' },
      { name: 'origin', keyPath: 'origin' },
      { name: 'catalogVersion', keyPath: 'catalogVersion' },
      { name: 'originAndCatalogVersion', keyPath: ['origin', 'catalogVersion'] },
      { name: 'taxonomy.foodGroup', keyPath: 'taxonomy.foodGroup' },
      { name: 'productTaxonomy.categoryId', keyPath: 'productTaxonomy.categoryId' },
      { name: 'productTaxonomy.subcategoryId', keyPath: 'productTaxonomy.subcategoryId' },
      { name: 'productTaxonomy.conceptId', keyPath: 'productTaxonomy.conceptId' },
      { name: 'allergenIds', keyPath: 'allergenIds', options: { multiEntry: true } }
    ]
  },
  recipes: {
    keyPath: 'recipeId',
    indexes: [
      { name: 'origin', keyPath: 'origin' },
      { name: 'status', keyPath: 'status' },
      { name: 'originAndStatus', keyPath: ['origin', 'status'] },
      { name: 'currentVersionId', keyPath: 'currentVersionId', options: { unique: true } }
    ]
  },
  recipeVersions: {
    keyPath: 'recipeVersionId',
    indexes: [
      { name: 'recipeId', keyPath: 'recipeId' },
      { name: 'origin', keyPath: 'origin' },
      { name: 'catalogVersion', keyPath: 'catalogVersion' },
      { name: 'originAndCatalogVersion', keyPath: ['origin', 'catalogVersion'] },
      { name: 'mealArchetypes', keyPath: 'mealArchetypes', options: { multiEntry: true } },
      { name: 'calculatedNutrition.energyKcal', keyPath: 'calculatedNutrition.energyKcal' },
      { name: 'calculatedNutrition.proteinG', keyPath: 'calculatedNutrition.proteinG' },
      { name: 'calculatedNutrition.fiberG', keyPath: 'calculatedNutrition.fiberG' },
      { name: 'practical.prepMinutes', keyPath: 'practical.prepMinutes' },
      { name: 'allergenIds', keyPath: 'allergenIds', options: { multiEntry: true } },
      { name: 'searchTokens', keyPath: 'searchTokens', options: { multiEntry: true } }
    ]
  },
  catalogPacks: {
    keyPath: ['catalogVersion', 'packId'],
    indexes: [
      { name: 'catalogVersionAndPackId', keyPath: ['catalogVersion', 'packId'], options: { unique: true } },
      { name: 'catalogVersion', keyPath: 'catalogVersion' },
      { name: 'status', keyPath: 'status' }
    ]
  },
  recipeHumanReviews: {
    keyPath: 'reviewId',
    indexes: [
      { name: 'catalogVersion', keyPath: 'catalogVersion' },
      { name: 'publicationId', keyPath: 'publicationId' },
      { name: 'recipeVersionId', keyPath: 'recipeVersionId' },
      { name: 'decision', keyPath: 'decision' },
      { name: 'publicationAndDecision', keyPath: ['publicationId', 'decision'] }
    ]
  },
  planInstances: { keyPath: 'planInstanceId', indexes: [] },
  calendarDays: {
    keyPath: 'calendarDayId',
    indexes: [
      { name: 'planAndDate', keyPath: ['planInstanceId', 'date'], options: { unique: true } },
      { name: 'planInstanceId', keyPath: 'planInstanceId' },
      { name: 'date', keyPath: 'date' }
    ]
  },
  generationRuns: { keyPath: 'generationRunId', indexes: [] },
  operations: {
    keyPath: 'operationId',
    indexes: [
      { name: 'planAndSequence', keyPath: ['planInstanceId', 'sequence'], options: { unique: true } },
      { name: 'planInstanceId', keyPath: 'planInstanceId' },
      { name: 'createdAt', keyPath: 'createdAt' }
    ]
  },
  shoppingChecklists: {
    keyPath: 'checklistId',
    indexes: [
      { name: 'planInstanceId', keyPath: 'planInstanceId' },
      { name: 'planAndRange', keyPath: ['planInstanceId', 'range.startCivilDate', 'range.endCivilDate'] },
      { name: 'updatedAt', keyPath: 'updatedAt' }
    ]
  }
};

export const STORE_NAMES = Object.freeze(Object.keys(STORE_DEFINITIONS));
