import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PLANNER_CONSTRAINTS, PLANNER_CONSTRAINT_POLICY_VERSION } from '../../src/planner/constraintPolicy.js';
import { SIMPLE_SNACK_MAX_PREP_MINUTES } from '../../src/planner/hardFilter.js';

const root = process.cwd();
const readText = file => readFile(path.join(root, file), 'utf8');
const readJson = async file => JSON.parse(await readText(file));
const [planMath, hardFilter, beamSolver, generator, effective, configurationService, configurationUi, calendarSchema, recipeSchema, dayClassSchema, planSpec, nutritionSpec, daySpec, validationPlan, packageJson] = await Promise.all([
  readText('src/planner/planMath.js'), readText('src/planner/hardFilter.js'), readText('src/planner/beamSolver.js'), readText('src/planner/planGenerator.js'), readText('src/services/effectivePlanService.js'),
  readText('src/services/configurationService.js'), readText('src/ui/configurationPages.js'),
  readJson('schemas/calendar-day.schema.json'), readJson('schemas/recipe-version.schema.json'), readJson('schemas/day-class.schema.json'), readText('specs/PLAN_GENERATOR_SPEC.md'), readText('specs/NUTRITION_ENGINE_SPEC.md'), readText('specs/DAY_CLASS_SPEC.md'),
  readText('V1_PLANNER_VALIDATION_PLAN.md'), readJson('package.json')
]);

const checks = []; const failures = [];
function check(id, pass, detail) { const row = { id, pass: Boolean(pass), detail }; checks.push(row); if (!row.pass) failures.push(row); }
const hard = new Set(PLANNER_CONSTRAINTS.filter(item => item.strength === 'hard').map(item => item.id));
const soft = new Set(PLANNER_CONSTRAINTS.filter(item => item.strength === 'soft').map(item => item.id));
const componentServingConst = calendarSchema.properties.nutritionSummary ? calendarSchema.properties.mealSlots.items.properties.recipeComponents.items.properties.servings.const : null;
const recipeServingConst = recipeSchema.properties.servingCount.const;

check('policy-versioned', PLANNER_CONSTRAINT_POLICY_VERSION === 'planner-constraint-policy-1', PLANNER_CONSTRAINT_POLICY_VERSION);
check('energy-tolerance-hard', hard.has('daily_energy_tolerance') && /energyToleranceWindow/.test(planMath) && /energyDistanceKcal/.test(beamSolver) && /daily_energy_tolerance/.test(generator), 'daily energy tolerance is a hard finalist constraint');
check('fixed-serving-hard', hard.has('fixed_serving') && componentServingConst === 1 && recipeServingConst === 1 && /servings:\s*1/.test(generator) && /servings:\s*1/.test(effective), `calendar=${componentServingConst}, recipe=${recipeServingConst}`);
check('numeric-forbid-correct', /numericRuleSatisfied\(recipe, rule\)\) reject/.test(hardFilter) && !/!numericRuleSatisfied\(recipe, rule\)\) reject/.test(hardFilter), 'matching numeric forbid predicate is rejected');
check('cooking-hard', /capabilities\.cooking === false/.test(hardFilter) && /capability:cooking/.test(hardFilter), 'cooking=false rejects cooked recipes');
check('complex-snack-hard', SIMPLE_SNACK_MAX_PREP_MINUTES === 10 && /capability:complex_snack/.test(hardFilter), `simple snack prep<=${SIMPLE_SNACK_MAX_PREP_MINUTES}`);
check('replacement-preserves-energy', /rejectedByEnergy/.test(effective) && /Selected replacement violates daily energy tolerance/.test(effective), 'preview and commit both enforce day energy');
check('energy-frontier-before-soft-ranking', /selectCandidateFrontier/.test(beamSolver) && /energyQuantiles/.test(beamSolver) && /remainingEnergyBounds/.test(beamSolver), 'candidate/option energy diversity and remaining-energy bounds are preserved');
check('bounded-search-honesty', /proof:\s*'bounded_search'/.test(beamSolver) && /bounded search space/i.test(validationPlan), 'NO_FEASIBLE_PLAN is not presented as a mathematical impossibility proof');
check('planned-protein-guidance-not-fake-constraint', /proteinMinG is external-meal guidance only/.test(configurationService) && /slot\.mode === 'external'.*proteinMin/s.test(configurationUi) && /Planned vs external slot constraint semantics/.test(daySpec), 'proteinMinG is external-only guidance');
check('soft-semantics-explicit', ['nutrient_targets','meal_rule_preferences','food_preferences','frequency_limits','variety','slot_energy_share'].every(id => soft.has(id)), `soft=${[...soft].join(',')}`);
check('no-feasible-plan-contract', /code:\s*'no_feasible_plan'/.test(generator) && /NO_FEASIBLE_PLAN/.test(planSpec) && /NO_FEASIBLE_PLAN/.test(validationPlan), 'out-of-range day cannot be success');
check('external-unknown-classified', /external_energy_unknown/.test(generator) && /external.*unknown/i.test(validationPlan), 'unknown external energy cannot certify hard daily range');
check('manual-range-800-2600', /800/.test(validationPlan) && /2600/.test(validationPlan), 'manual envelope includes 800–2600 kcal');
check('phase-a-test-wired', packageJson.scripts?.['v1:engine-phase-a']?.includes('v1-engine-phase-a.test.mjs') && packageJson.scripts?.['v1:engine-phase-a']?.includes('audit-v1-feasibility.mjs') && packageJson.scripts?.check?.includes('v1:engine-phase-a'), packageJson.scripts?.['v1:engine-phase-a'] || 'missing');
check('spec-energy-hard', /hard constraint/i.test(nutritionSpec) && /tolleranza energetica giornaliera.*hard/i.test(planSpec), 'planner/nutrition specs agree');

const report = { schemaVersion: 1, suite: 'v1-planner-validation-phase-a', checkedAt: new Date().toISOString(), status: failures.length ? 'failed' : 'passed', checks, failures };
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/v1-engine-phase-a-gate.json'), JSON.stringify(report, null, 2) + '\n');
for (const row of checks) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.id}: ${row.detail}`);
if (failures.length) { console.error(`V1 Engine Phase A gate failed: ${failures.map(item => item.id).join(', ')}`); process.exitCode = 1; }
else console.log(`V1 Engine Phase A gate PASS (${checks.length}/${checks.length})`);
