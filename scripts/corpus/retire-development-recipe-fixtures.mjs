import path from 'node:path';
import { SchemaRegistry } from '../../src/lib/schemaValidator.js';
import { loadCorpusInput, readJson, writeJson } from './io-lib.mjs';

const corpusInput=process.argv[2]; const retirementFile=process.argv[3] || 'corpus/curation/v1-legacy-fixture-retirement.json'; const output=process.argv[4] || 'corpus/staging/production-foundation-clean-bundle.json'; const reportFile=process.argv[5] || 'corpus/reports/development-fixture-retirement.json';
if(!corpusInput){console.error('Usage: node scripts/corpus/retire-development-recipe-fixtures.mjs <bundle.json|catalog-dir> [retirement-map.json] [output-bundle.json] [report.json]');process.exit(2);}
const registry=new SchemaRegistry(async file=>readJson(path.join('schemas',file))); await registry.loadAll();
const [corpus,retirement]=await Promise.all([loadCorpusInput(corpusInput),readJson(retirementFile)]); registry.assert('ingredientRetirementMap',retirement);
const requiredIngredients=new Set(['ing_salmon','ing_rice_cooked','ing_zucchini','ing_olive_oil']); const mapped=new Set((retirement.retirements||[]).map(item=>item.ingredientId));
for(const id of requiredIngredients) if(!mapped.has(id)) throw new Error(`Legacy fixture retirement map is missing ${id}`);
for(const family of corpus.ingredientFamilies){if(requiredIngredients.has(family.ingredientId)&&family.status!=='retired') throw new Error(`Development ingredient ${family.ingredientId} must be retired before recipe fixture retirement`);}
const recipeIds=new Set(['rec_salmon_rice','rec_zucchini_rice','rec_salmon_zucchini']); const families=structuredClone(corpus.recipeFamilies); const retired=[];
const now=new Date().toISOString();
for(const family of families){ if(!recipeIds.has(family.recipeId)) continue; if(family.origin!=='base') throw new Error(`Refusing to retire non-base recipe fixture ${family.recipeId}`); family.status='retired'; family.updatedAt=now; retired.push(family.recipeId); registry.assert('recipe',family); }
if(retired.length!==recipeIds.size) throw new Error(`Expected to retire ${recipeIds.size} recipe fixtures, retired ${retired.length}`);
const bundle={...corpus,recipeFamilies:families};
const report={schemaVersion:1,retirementId:'phase4-production-development-fixture-retirement-v1',retiredAt:now,ingredientRetirements:retirement.retirements,retiredRecipeIds:retired.sort(),historyPreserved:true};
await Promise.all([writeJson(output,bundle),writeJson(reportFile,report)]); console.log(JSON.stringify({output,reportFile,retiredRecipeIds:report.retiredRecipeIds},null,2));
