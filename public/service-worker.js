const BASE_URL = new URL('./', self.location.href);
const BASE_PATH = BASE_URL.pathname.endsWith('/') ? BASE_URL.pathname : `${BASE_URL.pathname}/`;
const CACHE_SCOPE_KEY = BASE_PATH.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'root';
const SHELL_CACHE = `ydm-shell-v47-${CACHE_SCOPE_KEY}`;
const DATA_CACHE = `ydm-data-v23-${CACHE_SCOPE_KEY}`;
const scoped = path => new URL(String(path || '').replace(/^\/+/, ''), BASE_URL).pathname;
const DATA_PREFIX = scoped('data/');
const SCHEMA_PREFIX = scoped('schemas/');
const CATALOG_PATH = scoped('data/catalog.json');
const INDEX_PATH = scoped('index.html');

const SHELL = [
  'src/domain/productExtensions.js', 'src/services/productExtensionService.js', 'src/ui/productExtensionPages.js', 'schemas/backup-v4.schema.json', 'schemas/recipe-favorite.schema.json', 'schemas/saved-menu.schema.json', 'schemas/pantry-entry.schema.json', 'schemas/production-batch.schema.json', 'schemas/seasonality-profile.schema.json', 'schemas/ingredient-price.schema.json',
  'src/services/portableBackup.js', 'src/services/localDiagnostics.js', 'schemas/backup-v3.schema.json',
  'src/ui/profileStatus.js',
  'src/domain/foodPresentationCorrections.js', 'src/services/foodPresentationMigration.js',
  'src/planner/constraintPolicy.js', 'src/corpus/deterministicRecipeGenerator.js', 'src/corpus/v1ReleaseRecipeGenerator.js', 'src/corpus/controlledScale.js', 'src/corpus/productionCorpus.js', 'src/corpus/fdcAutoCuration.js', 'src/corpus/v1PhaseBRecipeGenerator.js', 'src/corpus/corpusOrchestrator.js', 'src/corpus/v1PhaseBRoleClassifier.js', 'src/corpus/ingredientCuration.js', 'src/corpus/corpusScanner.js', 'src/corpus/recipePipeline.js', 'src/corpus/productionRecipePipeline.js', 'src/corpus/corpusMath.js', 'src/services/localDataService.js',
  'src/domain/frequencyCounter.js', 'src/domain/recipePresentation.js', 'src/domain/legacyRuleAdapter.js', 'src/domain/ingredientPresentation.js', 'src/domain/safetyPolicy.js', 'src/services/ingredientConceptQuery.js', 'src/services/recipePresentationMigration.js', 'src/services/plannerWorker.js', 'src/services/plannerExecution.js', 'src/services/catalogAvailability.js', 'src/services/planPolicyValidation.js', 'src/planner/frequencyPlanGenerator.js', 'src/ui/frequencySummary.js', 'src/ui/configurationRulesV2Ui.js', 'src/ui/foodGroupEditor.js',
  'src/domain/catalogQuarantine.js', 'src/domain/safetyCompatibility.js', 'src/domain/ingredientIdentity.js', 'src/domain/ingredientConversion.js', 'src/domain/revisionV2Contracts.js', 'src/domain/productFoodTaxonomy.js', 'src/services/planPreviewGuard.js', 'src/services/ingredientModelMigration.js', 'src/services/revisionV2Service.js', 'schemas/safety-evidence.schema.json', 'schemas/food-preferences-v2.schema.json', 'schemas/production-corpus-intake.schema.json', 'schemas/ingredient-revision-v2.schema.json', 'schemas/recipe-version-v1.schema.json', 'schemas/ingredient-curation-batch.schema.json', 'schemas/allergy-intolerance-profile-v1.schema.json', 'schemas/ingredient-retirement-map.schema.json', 'schemas/production-corpus-contract.schema.json', 'schemas/ingredient-curation-policy.schema.json', 'schemas/backup-v2.schema.json', 'schemas/ingredient-conversion.schema.json', 'schemas/ingredient-curation-report.schema.json', 'schemas/ingredient-revision-v1.schema.json', 'schemas/food-group.schema.json', 'schemas/allergy-intolerance-profile-v2.schema.json', 'schemas/production-corpus-readiness-report.schema.json', 'schemas/ingredient-mapping.schema.json', 'schemas/recipe-version-v2.schema.json', 'schemas/backup-v1.schema.json', 'schemas/food-preferences-v1.schema.json', 'schemas/pilot-wave-report.schema.json',
  '', 'index.html', 'manifest.webmanifest', 'icons/icon.svg',
  'src/bootstrapVisual.js', 'src/recoveryBootstrap.js', 'src/db/constants.js', 'src/db/database.js', 'src/domain/configurationRules.js', 'src/domain/catalogEnums.js', 'src/domain/nutritionCore.js',
  'src/i18n/i18n.js', 'src/lib/appBase.js', 'src/lib/crypto.js', 'src/lib/schemaValidator.js', 'src/lib/semver.js', 'src/catalog/cleanCatalogCompiler.js', 'src/services/cleanCatalogLoader.js', 'src/main.js',
  'src/repositories/domainRepositories.js', 'src/repositories/repositoryHub.js',
  'src/services/backupEngine.js', 'src/services/preV1DataEpoch.js', 'src/services/catalogDataSource.js', 'src/services/catalogImporter.js', 'src/services/catalogUpdater.js', 'src/services/catalogQuery.js',
  'src/services/configurationBootstrap.js', 'src/services/configurationService.js', 'src/services/configurationTransfer.js', 'src/services/customCatalogTransfer.js', 'src/services/migrationRunner.js', 'src/services/personalCatalogService.js',
  'src/services/manualAcceptanceService.js', 'src/services/planCandidateService.js', 'src/services/planGenerationService.js', 'src/services/plannerValidationService.js', 'src/services/effectivePlanService.js', 'src/services/operationHistoryService.js', 'src/services/shoppingService.js',
  'src/services/offlineCatalog.js', 'src/services/recipeHumanReviewService.js', 'src/services/storageMetrics.js', 'src/services/referenceDataService.js', 'src/services/referenceDataProposalService.js', 'src/services/referenceDataEditorService.js',
  'src/planner/seededRandom.js', 'src/planner/varietyPolicy.js', 'src/planner/planMath.js', 'src/planner/recipeFeatures.js', 'src/planner/hardFilter.js', 'src/planner/qualityPolicy.js', 'src/planner/qualityMetrics.js', 'src/planner/softScoring.js', 'src/planner/beamSolver.js', 'src/planner/planGenerator.js', 'src/planner/validationProfiles.js',
  'src/styles.css', 'src/theme/themeEngine.js', 'src/ui/app.js', 'src/ui/manualAcceptancePage.js', 'src/ui/catalogPages.js', 'src/ui/configurationPages.js', 'src/ui/referenceDataPages.js', 'src/ui/guidedControls.js', 'src/ui/planPages.js', 'src/ui/plannerValidationPage.js', 'src/ui/shoppingPages.js', 'src/ui/dom.js', 'src/ui/router.js', 'src/ui/uiState.js',
  'schemas/allergy-intolerance-profile.schema.json', 'schemas/app-config.schema.json', 'schemas/catalog-publication.schema.json', 'schemas/production-review-publication.schema.json', 'schemas/recipe-human-review.schema.json', 'schemas/recipe-human-review-bundle.schema.json', 'schemas/backup.schema.json', 'schemas/calendar-day.schema.json', 'schemas/catalog-manifest.schema.json', 'schemas/catalog-pack.schema.json', 'schemas/cycle.schema.json', 'schemas/day-class.schema.json', 'schemas/domain-enums.schema.json', 'schemas/food-preferences.schema.json', 'schemas/generation-run.schema.json', 'schemas/ingredient-revision.schema.json', 'schemas/ingredient.schema.json', 'schemas/meal-class.schema.json', 'schemas/nutrition-profile.schema.json', 'schemas/operation.schema.json', 'schemas/plan-instance.schema.json', 'schemas/recipe-corpus-orchestration-run.schema.json', 'schemas/recipe-corpus-policy.schema.json', 'schemas/recipe-corpus-snapshot.schema.json', 'schemas/recipe-generation-job.schema.json', 'schemas/recipe-version.schema.json', 'schemas/recipe.schema.json', 'schemas/shopping-checklist.schema.json', 'schemas/taxonomy.schema.json', 'schemas/taxonomy-term.schema.json', 'schemas/reference-data-proposal.schema.json', 'schemas/production-recipe-pipeline-policy.schema.json', 'schemas/production-recipe-batch-report.schema.json', 'schemas/production-recipe-review-decisions.schema.json', 'schemas/production-scale-gate-report.schema.json', 'schemas/controlled-scale-plan.schema.json', 'schemas/theme-profile.schema.json',
  'data/locales/it.json', 'data/locales/en.json'
].map(scoped);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => {
      const legacy = new Set(['ydm-shell-v9', 'ydm-data-v5']);
      return Promise.all(keys.filter(key => (legacy.has(key) || key.endsWith(`-${CACHE_SCOPE_KEY}`)) && ![SHELL_CACHE, DATA_CACHE].includes(key)).map(key => caches.delete(key)));
    })
  ]));
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'YDM_CACHE_URLS') return;
  const urls = [...new Set((event.data.urls || []).filter(value => typeof value === 'string'))];
  event.waitUntil((async () => {
    const cache = await caches.open(DATA_CACHE);
    let count = 0;
    const failed = [];
    for (const raw of urls) {
      const url = new URL(raw, self.location.origin);
      const allowed = url.pathname.startsWith(DATA_PREFIX) || url.pathname.startsWith(SCHEMA_PREFIX);
      if (url.origin !== self.location.origin || !allowed) { failed.push(raw); continue; }
      try {
        const existing = await cache.match(url.href);
        if (existing) { count += 1; continue; }
        const response = await fetch(url.href, { cache: 'no-cache' });
        if (!response.ok) { failed.push(raw); continue; }
        await cache.put(url.href, response.clone());
        count += 1;
      } catch { failed.push(raw); }
    }
    event.ports?.[0]?.postMessage({ cached: failed.length === 0, count, failed });
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE_PATH)) return;

  if (url.pathname.startsWith(SCHEMA_PREFIX)) {
    event.respondWith(caches.open(SHELL_CACHE).then(async cache => {
      const cached = await cache.match(event.request);
      try {
        const response = await fetch(event.request, { cache: 'no-cache' });
        if (response.ok) await cache.put(event.request, response.clone());
        return response.ok ? response : (cached || response);
      } catch {
        return cached || Response.error();
      }
    }));
    return;
  }
  if (url.pathname.startsWith(scoped('data/locales/'))) {
    event.respondWith(caches.open(SHELL_CACHE).then(cache => cache.match(event.request)).then(response => response || Response.error())); return;
  }
  if (url.pathname === CATALOG_PATH) {
    event.respondWith(caches.open(DATA_CACHE).then(async cache => {
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return (await cache.match(event.request)) || Response.error();
      }
    }));
    return;
  }

  if (url.pathname.startsWith(DATA_PREFIX) || url.pathname.startsWith(SCHEMA_PREFIX)) {
    event.respondWith(caches.open(DATA_CACHE).then(async cache => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    }));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(caches.open(SHELL_CACHE).then(cache => cache.match(INDEX_PATH)).then(response => response || Response.error()));
    return;
  }

  event.respondWith(caches.open(SHELL_CACHE).then(cache => cache.match(event.request)).then(async cached => {
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && /\.(?:js|css|svg|webmanifest)$/.test(url.pathname)) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(event.request, response.clone());
    }
    return response;
  }));
});
