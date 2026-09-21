import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui=await readFile(new URL('../src/ui/configurationRulesV2Ui.js',import.meta.url),'utf8');
const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
const schema=JSON.parse(await readFile(new URL('../schemas/food-preferences-v2.schema.json',import.meta.url),'utf8'));

test('preferences expose the three planner variety strategies',()=>{
  for (const symbol of ['VARIETY_MODES.maximum','VARIETY_MODES.perishables','VARIETY_MODES.none']) assert.ok(ui.includes(symbol));
  assert.deepEqual(schema.properties.plannerPolicy.properties.varietyMode.enum, ['maximum_variety','perishable_proximity','none']);
});

test('preference rules use compact collapsible cards',()=>{
  assert.ok(ui.includes("className: 'preference-rule'"));
  assert.ok(ui.includes("className: 'preference-rule__summary'"));
  assert.ok(css.includes('.preference-rule__body'));
});
