// These are drafts, never an automatic persistence migration. Old rules keep
// their exact soft weights until the user explicitly replaces them and saves.
export function preferenceEditingDraft(profile) {
  return profile.schemaVersion === 2 ? structuredClone(profile) : { schemaVersion: 2, id: profile.id, rules: [], legacyRules: structuredClone(profile.rules) };
}
export function safetyEditingDraft(profile) {
  return profile.schemaVersion === 2 ? structuredClone(profile) : { schemaVersion: 2, id: profile.id, rules: [], legacyRules: structuredClone(profile.rules) };
}
export function blankFrequencyRule(id, effectiveFrom) {
  return { id, enabled: true, mode: 'frequency', target: { type: 'productFood', id: '' }, scope: { mealClassIds: [] },
    countUnit: 'meal', countBasis: 'planned', window: { kind: 'rolling', days: 7 }, minOccurrences: null, targetOccurrences: null, maxOccurrences: null, priority: 'normal', effectiveFrom };
}
export function convertLegacyPreference(profile, ruleId, chosenRule) {
  const old = profile.legacyRules?.find(rule => rule.id === ruleId);
  if (!old || chosenRule.id !== ruleId) throw new Error('Legacy conversion must identify the exact source rule');
  profile.legacyRules = profile.legacyRules.filter(rule => rule.id !== ruleId);
  profile.rules.push(structuredClone(chosenRule));
  return profile;
}
