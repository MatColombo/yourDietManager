import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const fail = message => failures.push(message);
const read = file => readFile(path.join(root, file), 'utf8');
const uiDir = path.join(root, 'src/ui');
const uiFiles = (await readdir(uiDir)).filter(name => name.endsWith('.js'));
const uiSources = Object.fromEntries(await Promise.all(uiFiles.map(async name => [name, await readFile(path.join(uiDir, name), 'utf8')])));
const config = uiSources['configurationPages.js'];
const main = await read('src/main.js');
const sw = await read('public/service-worker.js');
const bootstrap = JSON.parse(await read('public/data/bootstrap/default-configuration.json'));

if (!config.includes('capabilitiesEditor(state, day.capabilities)')) fail('DayClass capabilities editor is not bound to day.capabilities');
if (/capabilitiesEditor\(state, day\)(?!\.)/.test(config)) fail('DayClass capabilities editor still writes at the DayClass root');
if (!config.includes('save.disabled = !result.valid')) fail('configuration Save is not disabled from live diagnostics');
if (!config.includes("day.dayArchetype !== 'free' && day.mealSlots.length <= 1")) fail('non-free DayClass can be reduced to zero meal slots');
for (const [name, source] of Object.entries(uiSources)) {
  if (name !== 'uiState.js' && /element\('details'/.test(source)) fail(`${name}: disclosure bypasses controlledDetails`);
  if (name !== 'uiState.js' && /history\.(?:pushState|replaceState)/.test(source)) fail(`${name}: navigation bypasses the global dirty guard`);
}
if (!uiSources['uiState.js'].includes('beforeunload')) fail('dirty-state guard does not protect tab close/reload');
if (!uiSources['uiState.js'].includes('ydm:draft-change')) fail('programmatic form mutations are not tracked as dirty');
if (!main.includes('onboardingEnabled: false')) fail('onboarding is not explicitly disabled');
if (!sw.includes('src/ui/uiState.js')) fail('service worker does not precache uiState.js');
if ((bootstrap.allergyIntoleranceProfiles?.[0]?.rules || []).length) fail('standard bootstrap contains allergy/intolerance rules');
if ((bootstrap.foodPreferences?.[0]?.rules || []).length) fail('standard bootstrap contains food-preference rules');
if (bootstrap.appConfig?.shoppingPeopleMultiplier !== 1) fail('standard bootstrap shopping multiplier is not neutral (1)');
if (bootstrap.dayClasses?.length !== 1 || bootstrap.cycles?.[0]?.length !== 1) fail('standard bootstrap is not a simple one-day cycle');
for (const nutrient of Object.values(bootstrap.nutritionProfiles?.[0]?.nutrients || {})) {
  if (nutrient.enabled || nutrient.min !== null || nutrient.target !== null || nutrient.max !== null || nutrient.weight !== 0) fail('standard bootstrap contains an active nutrient constraint');
}

const report = { version: 1, generatedAt: new Date().toISOString(), pass: failures.length === 0, checks: 12, failures };
console.log(`Pass C form/contract audit: ${failures.length ? 'FAIL' : 'PASS'} (${failures.length ? failures.length + ' failures' : 'all checks'})`);
for (const failure of failures) console.error(`- ${failure}`);
if (failures.length) process.exit(1);
