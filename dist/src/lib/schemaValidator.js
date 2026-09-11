import { assetPath } from './appBase.js';

export const SCHEMA_FILES = [
  'allergy-intolerance-profile.schema.json', 'app-config.schema.json', 'backup.schema.json', 'calendar-day.schema.json',
  'catalog-manifest.schema.json', 'catalog-publication.schema.json', 'production-review-publication.schema.json', 'recipe-human-review.schema.json', 'recipe-human-review-bundle.schema.json', 'catalog-pack.schema.json', 'cycle.schema.json', 'day-class.schema.json',
  'domain-enums.schema.json', 'food-preferences.schema.json', 'generation-run.schema.json', 'ingredient-revision.schema.json',
  'ingredient.schema.json', 'meal-class.schema.json', 'nutrition-profile.schema.json', 'operation.schema.json',
  'plan-instance.schema.json', 'recipe-corpus-orchestration-run.schema.json', 'recipe-corpus-policy.schema.json',
  'recipe-corpus-snapshot.schema.json', 'recipe-generation-job.schema.json', 'production-corpus-contract.schema.json',
  'production-corpus-intake.schema.json', 'production-corpus-readiness-report.schema.json', 'production-recipe-pipeline-policy.schema.json', 'production-recipe-batch-report.schema.json', 'production-recipe-review-decisions.schema.json', 'production-scale-gate-report.schema.json', 'controlled-scale-plan.schema.json', 'ingredient-curation-policy.schema.json',
  'ingredient-curation-batch.schema.json', 'ingredient-curation-report.schema.json', 'ingredient-retirement-map.schema.json', 'pilot-wave-report.schema.json', 'recipe-version.schema.json',
  'recipe.schema.json', 'shopping-checklist.schema.json', 'taxonomy.schema.json', 'taxonomy-term.schema.json', 'reference-data-proposal.schema.json', 'theme-profile.schema.json'
];

export const SCHEMA_BY_NAME = {
  catalogManifest: 'catalog-manifest.schema.json', catalogPublication: 'catalog-publication.schema.json', productionReviewPublication: 'production-review-publication.schema.json', recipeHumanReview: 'recipe-human-review.schema.json', recipeHumanReviewBundle: 'recipe-human-review-bundle.schema.json', catalogPack: 'catalog-pack.schema.json', ingredient: 'ingredient.schema.json',
  ingredientRevision: 'ingredient-revision.schema.json', recipe: 'recipe.schema.json', recipeVersion: 'recipe-version.schema.json',
  appConfig: 'app-config.schema.json', themeProfile: 'theme-profile.schema.json', nutritionProfile: 'nutrition-profile.schema.json',
  allergyIntoleranceProfile: 'allergy-intolerance-profile.schema.json', foodPreferences: 'food-preferences.schema.json',
  mealClass: 'meal-class.schema.json', dayClass: 'day-class.schema.json', cycle: 'cycle.schema.json',
  planInstance: 'plan-instance.schema.json', calendarDay: 'calendar-day.schema.json', generationRun: 'generation-run.schema.json',
  recipeCorpusPolicy: 'recipe-corpus-policy.schema.json', recipeCorpusSnapshot: 'recipe-corpus-snapshot.schema.json',
  recipeCorpusOrchestrationRun: 'recipe-corpus-orchestration-run.schema.json', recipeGenerationJob: 'recipe-generation-job.schema.json',
  productionCorpusContract: 'production-corpus-contract.schema.json', productionCorpusIntake: 'production-corpus-intake.schema.json',
  productionCorpusReadinessReport: 'production-corpus-readiness-report.schema.json',
  productionRecipePipelinePolicy: 'production-recipe-pipeline-policy.schema.json', productionRecipeBatchReport: 'production-recipe-batch-report.schema.json',
  productionRecipeReviewDecisions: 'production-recipe-review-decisions.schema.json', productionScaleGateReport: 'production-scale-gate-report.schema.json', controlledScalePlan: 'controlled-scale-plan.schema.json',
  ingredientCurationPolicy: 'ingredient-curation-policy.schema.json', ingredientCurationBatch: 'ingredient-curation-batch.schema.json',
  ingredientCurationReport: 'ingredient-curation-report.schema.json', ingredientRetirementMap: 'ingredient-retirement-map.schema.json', pilotWaveReport: 'pilot-wave-report.schema.json',
  operation: 'operation.schema.json', shoppingChecklist: 'shopping-checklist.schema.json', taxonomy: 'taxonomy.schema.json', taxonomyTerm: 'taxonomy-term.schema.json', referenceDataProposal: 'reference-data-proposal.schema.json', backup: 'backup.schema.json'
};

function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function actualType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  if (typeof value === 'number') return 'number';
  if (isObject(value)) return 'object';
  return typeof value;
}
function typeMatches(value, type) {
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'object') return isObject(value);
  if (type === 'array') return Array.isArray(value);
  if (type === 'null') return value === null;
  return typeof value === type;
}
function pointerGet(root, fragment) {
  if (!fragment || fragment === '#') return root;
  const pointer = fragment.replace(/^#\/?/, '');
  if (!pointer) return root;
  return pointer.split('/').reduce((value, token) => value?.[token.replace(/~1/g, '/').replace(/~0/g, '~')], root);
}
function validFormat(format, value) {
  if (format === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (format === 'date-time') return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
  return true;
}

export class SchemaRegistry {
  constructor(loader = async file => (await fetch(assetPath(`/schemas/${file}`))).json()) {
    this.loader = loader;
    this.schemas = new Map();
  }

  async loadAll() {
    if (this.schemas.size) return;
    for (const file of SCHEMA_FILES) {
      const schema = await this.loader(file);
      this.schemas.set(file, schema);
      if (schema.$id) this.schemas.set(schema.$id, schema);
    }
  }

  resolveRef(ref, currentRoot) {
    if (ref.startsWith('#')) return { schema: pointerGet(currentRoot, ref), root: currentRoot };
    const [target, fragment = ''] = ref.split('#');
    const file = target.split('/').at(-1);
    const root = this.schemas.get(target) || this.schemas.get(file);
    if (!root) throw new Error(`Unresolved JSON Schema reference: ${ref}`);
    return { schema: pointerGet(root, fragment ? `#${fragment}` : '#'), root };
  }

  validate(name, value) {
    const file = SCHEMA_BY_NAME[name] || name;
    const schema = this.schemas.get(file);
    if (!schema) throw new Error(`Schema not loaded: ${file}`);
    const errors = [];
    this.validateNode(schema, value, '$', schema, errors);
    return { valid: errors.length === 0, errors };
  }

  assert(name, value) {
    const result = this.validate(name, value);
    if (!result.valid) throw new Error(`${name} schema validation failed: ${result.errors.slice(0, 8).join('; ')}`);
  }

  validateNode(schema, value, path, root, errors) {
    if (!schema || typeof schema !== 'object') return;
    if (schema.$ref) {
      const resolved = this.resolveRef(schema.$ref, root);
      this.validateNode(resolved.schema, value, path, resolved.root, errors);
      return;
    }

    if (schema.allOf) for (const part of schema.allOf) this.validateNode(part, value, path, root, errors);
    if (schema.anyOf) {
      const matches = schema.anyOf.filter(part => {
        const local = [];
        this.validateNode(part, value, path, root, local);
        return local.length === 0;
      }).length;
      if (matches === 0) errors.push(`${path}: must match at least one anyOf branch`);
    }
    if (schema.oneOf) {
      const matches = schema.oneOf.filter(part => {
        const local = [];
        this.validateNode(part, value, path, root, local);
        return local.length === 0;
      }).length;
      if (matches !== 1) errors.push(`${path}: must match exactly one oneOf branch`);
    }
    if (schema.if) {
      const conditionErrors = [];
      this.validateNode(schema.if, value, path, root, conditionErrors);
      if (conditionErrors.length === 0 && schema.then) this.validateNode(schema.then, value, path, root, errors);
    }

    if (schema.type !== undefined) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      if (!types.some(type => typeMatches(value, type))) {
        errors.push(`${path}: expected ${types.join('|')}, got ${actualType(value)}`);
        return;
      }
    }
    if ('const' in schema && !deepEqual(value, schema.const)) errors.push(`${path}: must equal const ${JSON.stringify(schema.const)}`);
    if (schema.enum && !schema.enum.some(entry => deepEqual(entry, value))) errors.push(`${path}: value is not in enum`);

    if (typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: minLength ${schema.minLength}`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: maxLength ${schema.maxLength}`);
      if (schema.pattern && !(new RegExp(schema.pattern).test(value))) errors.push(`${path}: does not match pattern ${schema.pattern}`);
      if (schema.format && !validFormat(schema.format, value)) errors.push(`${path}: invalid ${schema.format}`);
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: minimum ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: maximum ${schema.maximum}`);
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${path}: exclusiveMinimum ${schema.exclusiveMinimum}`);
    }

    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: minItems ${schema.minItems}`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: maxItems ${schema.maxItems}`);
      if (schema.uniqueItems) {
        const seen = new Set(value.map(item => JSON.stringify(item)));
        if (seen.size !== value.length) errors.push(`${path}: items must be unique`);
      }
      if (schema.items && typeof schema.items === 'object') value.forEach((item, index) => this.validateNode(schema.items, item, `${path}[${index}]`, root, errors));
      if (schema.contains) {
        const matches = value.some((item, index) => {
          const local = [];
          this.validateNode(schema.contains, item, `${path}[${index}]`, root, local);
          return local.length === 0;
        });
        if (!matches) errors.push(`${path}: contains constraint failed`);
      }
    }

    if (isObject(value)) {
      const keys = Object.keys(value);
      if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push(`${path}: minProperties ${schema.minProperties}`);
      if (schema.required) for (const key of schema.required) if (!(key in value)) errors.push(`${path}: missing required property ${key}`);
      if (schema.properties) {
        for (const [key, childSchema] of Object.entries(schema.properties)) {
          if (key in value) this.validateNode(childSchema, value[key], `${path}.${key}`, root, errors);
        }
      }
      const known = new Set(Object.keys(schema.properties || {}));
      const extras = keys.filter(key => !known.has(key));
      if (schema.additionalProperties === false && extras.length) errors.push(`${path}: additional properties not allowed: ${extras.join(', ')}`);
      else if (isObject(schema.additionalProperties)) {
        for (const key of extras) this.validateNode(schema.additionalProperties, value[key], `${path}.${key}`, root, errors);
      }
    }
  }
}
