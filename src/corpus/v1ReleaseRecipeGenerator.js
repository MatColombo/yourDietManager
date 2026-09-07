import { createHash } from 'node:crypto';

const FAMILY = Object.freeze({
  breakfastBowl: 'recipe_family_porridge',
  egg: 'recipe_family_egg_dish',
  main: 'recipe_family_protein_plate',
  grainBowl: 'recipe_family_grain_bowl',
  snack: 'recipe_family_snack_plate',
  salad: 'recipe_family_salad'
});

const CUISINE = 'cuisine_international';

const PROFILES = Object.freeze({
  breakfast: [
    {
      id: 'breakfast-yogurt-cereal', family: FAMILY.breakfastBowl, noCook: true,
      slots: [
        { role: 'breakfastCereal', amount: 45, flexPriority: 1 },
        { role: 'fruitReady', amount: 140 },
        { role: 'dairyOrSoyYogurt', amount: 150 },
        { role: 'nutsSeeds', amount: 15, flexPriority: 2 }
      ],
      practical: { prepMinutes: 5, cookMinutes: 0, reheatingRequired: false, coldSuitable: true, portable: true, fridgeRequired: true, freezerSuitable: false, mealPrepSuitable: true }
    },
    {
      id: 'breakfast-warm-grain', family: FAMILY.breakfastBowl, noCook: true,
      slots: [
        { role: 'warmBreakfastGrain', amount: 210, flexPriority: 1 },
        { role: 'fruitReady', amount: 140 },
        { role: 'dairyOrSoyYogurt', amount: 120 },
        { role: 'nutsSeeds', amount: 18, flexPriority: 2 }
      ],
      practical: { prepMinutes: 6, cookMinutes: 0, reheatingRequired: false, coldSuitable: true, portable: true, fridgeRequired: true, freezerSuitable: false, mealPrepSuitable: true }
    },
    {
      id: 'breakfast-egg-grain', family: FAMILY.egg, noCook: false,
      slots: [
        { role: 'eggWhole', amount: 120, flexPriority: 2 },
        { role: 'carbCooked', amount: 150, flexPriority: 1 },
        { role: 'vegetableCook', amount: 110 },
        { role: 'oilCooking', amount: 5 },
        { role: 'seasoning', amount: 2 }
      ],
      practical: { prepMinutes: 8, cookMinutes: 10, reheatingRequired: false, coldSuitable: false, portable: true, fridgeRequired: true, freezerSuitable: false, mealPrepSuitable: true }
    }
  ],
  lunch: [
    mainProfile('lunch-legume-bowl', 'legumeCooked', FAMILY.grainBowl, true),
    mainProfile('lunch-poultry-plate', 'poultryLean', FAMILY.main, false),
    mainProfile('lunch-legume-salad-bowl', 'legumeCooked', FAMILY.grainBowl, true),
    mainProfile('lunch-meat-plate', 'meatLean', FAMILY.main, false),
    mainProfile('lunch-fish-plate', 'fishSeafood', FAMILY.main, false)
  ],
  dinner: [
    mainProfile('dinner-legume-bowl', 'legumeCooked', FAMILY.grainBowl, true),
    mainProfile('dinner-fish-plate', 'fishSeafood', FAMILY.main, false),
    mainProfile('dinner-legume-plate', 'legumeCooked', FAMILY.grainBowl, true),
    mainProfile('dinner-poultry-plate', 'poultryLean', FAMILY.main, false),
    mainProfile('dinner-meat-plate', 'meatLean', FAMILY.main, false)
  ],
  snack: [
    {
      id: 'snack-fruit-nuts', family: FAMILY.snack, noCook: true,
      slots: [{ role: 'fruitReady', amount: 160 }, { role: 'nutsSeeds', amount: 20, flexPriority: 1 }],
      practical: portableNoCook(4)
    },
    {
      id: 'snack-yogurt-fruit', family: FAMILY.snack, noCook: true,
      slots: [{ role: 'dairyOrSoyYogurt', amount: 150, flexPriority: 2 }, { role: 'fruitReady', amount: 120 }, { role: 'nutsSeeds', amount: 10, flexPriority: 1 }],
      practical: portableNoCook(5)
    },
    {
      id: 'snack-bean-vegetable', family: FAMILY.salad, noCook: true,
      slots: [{ role: 'legumeCooked', amount: 100, flexPriority: 1 }, { role: 'vegetableRaw', amount: 120 }, { role: 'oilCooking', amount: 5 }, { role: 'seasoning', amount: 2 }],
      practical: portableNoCook(7)
    }
  ],
  mini_meal: [
    {
      id: 'mini-fruit-nuts', family: FAMILY.snack, noCook: true,
      slots: [{ role: 'fruitReady', amount: 150 }, { role: 'nutsSeeds', amount: 22, flexPriority: 1 }],
      practical: portableNoCook(4)
    },
    {
      id: 'mini-yogurt-fruit', family: FAMILY.snack, noCook: true,
      slots: [{ role: 'dairyOrSoyYogurt', amount: 140, flexPriority: 2 }, { role: 'fruitReady', amount: 110 }, { role: 'nutsSeeds', amount: 10, flexPriority: 1 }],
      practical: portableNoCook(5)
    },
    {
      id: 'mini-bean-grain-cup', family: FAMILY.salad, noCook: true,
      slots: [{ role: 'legumeCooked', amount: 85, flexPriority: 2 }, { role: 'carbCooked', amount: 75, flexPriority: 1 }, { role: 'vegetableRaw', amount: 90 }, { role: 'oilCooking', amount: 5 }],
      practical: portableNoCook(8)
    }
  ]
});

function mainProfile(id, proteinRole, family, vegetarian) {
  return {
    id, family, vegetarian, noCook: false, proteinRole,
    slots: [
      { role: proteinRole, amount: proteinRole === 'legumeCooked' ? 180 : 150, flexPriority: 2 },
      { role: 'carbCooked', amount: proteinRole === 'legumeCooked' ? 220 : 220, flexPriority: 1 },
      { role: 'vegetableCook', amount: 160 },
      { role: 'oilCooking', amount: 9 },
      { role: 'seasoning', amount: 3 }
    ],
    practical: { prepMinutes: 9, cookMinutes: proteinRole === 'legumeCooked' ? 10 : 15, reheatingRequired: false, coldSuitable: true, portable: true, fridgeRequired: true, freezerSuitable: false, mealPrepSuitable: true }
  };
}

function portableNoCook(prepMinutes) {
  return { prepMinutes, cookMinutes: 0, reheatingRequired: false, coldSuitable: true, portable: true, fridgeRequired: true, freezerSuitable: false, mealPrepSuitable: true };
}

function digestIndex(key, length) {
  if (!length) throw new Error(`Empty release recipe role pool for ${key}`);
  const value = createHash('sha256').update(key).digest().readUInt32BE(0);
  return value % length;
}

function entryMap(corpus) {
  const revisions = new Map((corpus.ingredientRevisions || []).map(item => [item.ingredientRevisionId, item]));
  return new Map((corpus.ingredientFamilies || []).filter(item => item.status === 'active').map(family => [family.ingredientId, { family, revision: revisions.get(family.currentRevisionId) }]));
}

function amountBounds(eligibility, role) {
  const bounds = eligibility.roles?.[role]?.portionG;
  if (!bounds) throw new Error(`Missing portion bounds for culinary role ${role}`);
  return { min: Number(bounds.min), max: Number(bounds.max), default: Number(bounds.default) };
}

function kcalPerGram(entry) { return Number(entry.revision?.nutrition?.energyKcal || 0) / Number(entry.revision?.basis?.amount || 100); }
function energy(lines) { return lines.reduce((sum, line) => sum + kcalPerGram(line.entry) * line.amount, 0); }
function round1(value) { return Math.round(value * 10) / 10; }

function solveEnergy(lines, eligibility, target) {
  const solved = lines.map(line => ({ ...line }));
  const flex = solved.filter(line => line.flexPriority != null).sort((a, b) => a.flexPriority - b.flexPriority);
  for (let pass = 0; pass < 3; pass += 1) {
    for (const line of flex) {
      const coefficient = kcalPerGram(line.entry);
      if (!(coefficient > 0)) continue;
      const current = energy(solved);
      const bounds = amountBounds(eligibility, line.role);
      const next = Math.max(bounds.min, Math.min(bounds.max, line.amount + (target - current) / coefficient));
      line.amount = round1(next);
    }
  }
  return { lines: solved, energyKcal: round1(energy(solved)) };
}

function labels(entry, locale) {
  const raw = entry.revision?.i18n?.[locale]?.name || entry.revision?.i18n?.en?.name || entry.family.ingredientId;
  if (locale === 'it') return raw.split('—')[0].split(',')[0].trim();
  const parts = raw.split(',').map(value => value.trim()).filter(Boolean);
  if (['Nuts', 'Seeds', 'Fish', 'Crustaceans', 'Mollusks'].includes(parts[0]) && parts[1]) return `${parts[1][0].toUpperCase()}${parts[1].slice(1)}`;
  if (parts[0] === 'Cereals ready-to-eat') {
    const descriptor = raw.match(/OAT BRAN FLAKES/i) ? 'Oat bran flakes' : raw.match(/Shredded Wheat/i) ? 'Shredded wheat' : 'Breakfast cereal';
    return descriptor;
  }
  return (parts[0] || raw).replace(/\s*\([^)]*$/, '').trim();
}

function profileTitle(profile, entries, locale) {
  const names = entries.map(item => labels(item.entry, locale));
  if (locale === 'it') {
    if (profile.id.includes('yogurt-cereal')) return `Bowl di ${names[2]} con ${names[1]} e ${names[0]}`;
    if (profile.id.includes('warm-grain')) return `Bowl di ${names[0]} con ${names[1]} e ${names[2]}`;
    if (profile.id.includes('egg-grain')) return `${names[0]} con ${names[1]} e ${names[2]}`;
    if (profile.id.includes('fruit-nuts')) return `${names[0]} con ${names[1]}`;
    if (profile.id.includes('yogurt-fruit')) return `${names[0]} con ${names[1]} e ${names[2]}`;
    if (profile.id.includes('bean-vegetable')) return `Insalata di ${names[0]} e ${names[1]}`;
    if (profile.id.includes('bean-grain')) return `Cup di ${names[0]} con ${names[1]} e ${names[2]}`;
    return `${names[0]} con ${names[1]} e ${names[2]}`;
  }
  if (profile.id.includes('yogurt-cereal')) return `${names[2]} bowl with ${names[1]} and ${names[0]}`;
  if (profile.id.includes('warm-grain')) return `${names[0]} bowl with ${names[1]} and ${names[2]}`;
  if (profile.id.includes('egg-grain')) return `${names[0]} with ${names[1]} and ${names[2]}`;
  if (profile.id.includes('fruit-nuts')) return `${names[0]} with ${names[1]}`;
  if (profile.id.includes('yogurt-fruit')) return `${names[0]} with ${names[1]} and ${names[2]}`;
  if (profile.id.includes('bean-vegetable')) return `${names[0]} and ${names[1]} salad`;
  if (profile.id.includes('bean-grain')) return `${names[0]} cup with ${names[1]} and ${names[2]}`;
  return `${names[0]} with ${names[1]} and ${names[2]}`;
}

function preparationInstructions(profile, selected, locale) {
  const byRole = new Map(selected.map(item => [item.role, item]));
  const name = role => labels(byRole.get(role)?.entry, locale);
  const proteinRole = profile.proteinRole;
  if (locale === 'it') {
    if (profile.id.includes('yogurt-cereal') || profile.id.includes('warm-grain')) return [
      'Pesare gli ingredienti nelle quantità indicate.',
      'Tagliare la frutta se necessario e unire cereale, yogurt o bevanda lattiero-casearia e frutta.',
      'Aggiungere la frutta secca o i semi e consumare subito oppure conservare in frigorifero.'
    ];
    if (profile.id.includes('egg-grain')) return [
      `Pesare gli ingredienti. Cuocere completamente ${name('eggWhole')} con ${name('vegetableCook')} usando l'olio indicato.`,
      `Scaldare ${name('carbCooked')}, già cotto, e unirlo alle uova e alle verdure.`,
      'Condire con la spezia prevista e servire nella porzione indicata.'
    ];
    if (profile.id.includes('fruit-nuts') || profile.id.includes('yogurt-fruit')) return [
      'Pesare gli ingredienti nelle quantità indicate e preparare la frutta.',
      'Unire gli ingredienti in un contenitore monoporzione.',
      'Consumare subito oppure conservare in frigorifero fino al consumo.'
    ];
    if (profile.id.includes('bean-vegetable') || profile.id.includes('bean-grain')) return [
      'Scolare se necessario i legumi già cotti e pesare tutti gli ingredienti.',
      'Tagliare le verdure crude, unire gli ingredienti e mescolare con l’olio previsto.',
      'Conservare in frigorifero e trasportare in un contenitore chiuso.'
    ];
    if (proteinRole === 'legumeCooked') return [
      'Pesare gli ingredienti; usare legumi e cereale già cotti.',
      `Cuocere ${name('vegetableCook')} finché tenera, quindi unire legumi e ${name('carbCooked')}.`,
      'Aggiungere l’olio e la spezia indicati, mescolare e porzionare.'
    ];
    const protein = byRole.get(proteinRole);
    const raw = protein?.entry?.revision?.basis?.state === 'raw';
    return [
      'Pesare gli ingredienti nelle quantità indicate.',
      raw ? `Cuocere completamente ${name(proteinRole)} fino a raggiungere una cottura sicura; cuocere anche le verdure finché tenere.` : `Scaldare ${name(proteinRole)} già cotto e cuocere le verdure finché tenere.`,
      `Unire con ${name('carbCooked')} già cotto, aggiungere l’olio e la spezia indicati e servire.`
    ];
  }
  if (profile.id.includes('yogurt-cereal') || profile.id.includes('warm-grain')) return [
    'Weigh the ingredients in the stated amounts.',
    'Cut the fruit if needed, then combine the cereal or cooked grain with the yogurt or milk ingredient and fruit.',
    'Add the nuts or seeds and eat immediately or keep refrigerated.'
  ];
  if (profile.id.includes('egg-grain')) return [
    `Weigh the ingredients. Fully cook ${name('eggWhole')} with ${name('vegetableCook')} using the stated oil.`,
    `Warm ${name('carbCooked')}, which is already cooked, and combine it with the eggs and vegetables.`,
    'Season with the stated spice and serve as one portion.'
  ];
  if (profile.id.includes('fruit-nuts') || profile.id.includes('yogurt-fruit')) return [
    'Weigh the ingredients in the stated amounts and prepare the fruit.',
    'Combine the ingredients in a single-serving container.',
    'Eat immediately or keep refrigerated until serving.'
  ];
  if (profile.id.includes('bean-vegetable') || profile.id.includes('bean-grain')) return [
    'Drain the already-cooked legumes if needed and weigh all ingredients.',
    'Cut the raw vegetables, combine the ingredients, and toss with the stated oil.',
    'Keep refrigerated and transport in a closed container.'
  ];
  if (proteinRole === 'legumeCooked') return [
    'Weigh the ingredients; use already-cooked legumes and grain.',
    `Cook ${name('vegetableCook')} until tender, then combine with the legumes and ${name('carbCooked')}.`,
    'Add the stated oil and seasoning, mix, and portion.'
  ];
  const protein = byRole.get(proteinRole);
  const raw = protein?.entry?.revision?.basis?.state === 'raw';
  return [
    'Weigh the ingredients in the stated amounts.',
    raw ? `Cook ${name(proteinRole)} thoroughly to a safe doneness and cook the vegetables until tender.` : `Warm the already-cooked ${name(proteinRole)} and cook the vegetables until tender.`,
    `Combine with the already-cooked ${name('carbCooked')}, add the stated oil and seasoning, and serve.`
  ];
}

function practicalTags(practical) {
  const tags = [];
  if (Number(practical.prepMinutes || 0) + Number(practical.cookMinutes || 0) <= 20) tags.push('practical_quick');
  if (practical.portable) tags.push('practical_portable');
  if (practical.coldSuitable) tags.push('practical_cold_suitable');
  if (practical.reheatingRequired) tags.push('practical_reheatable');
  if (practical.mealPrepSuitable) tags.push('practical_meal_prep');
  if (!practical.cookMinutes) tags.push('practical_no_cook');
  return tags.sort();
}

function description(meal, profile, locale) {
  const kind = profile.proteinRole === 'legumeCooked' || profile.id.includes('bean-') ? (locale === 'it' ? 'vegetariana' : 'vegetarian') : '';
  if (locale === 'it') return `Ricetta ${meal} ${kind} con ingredienti e porzioni esplicitamente approvati per il corpus V1.`.replace('  ', ' ');
  return `${kind ? 'Vegetarian ' : ''}${meal.replace('_', ' ')} recipe using ingredients and portions explicitly approved for the V1 corpus.`;
}

export function releaseRecipeProfiles() { return structuredClone(PROFILES); }

export function generateV1ReleaseCandidates({ meal, count, eligibility, corpus, multiplier = 12 }) {
  const target = eligibility.mealTargets?.[meal];
  if (!target) throw new Error(`Missing V1 meal target ${meal}`);
  const profiles = PROFILES[meal];
  if (!profiles) throw new Error(`Missing V1 profiles for ${meal}`);
  const entries = entryMap(corpus);
  const seenSets = new Set();
  const candidates = [];
  const attempts = Math.max(count * multiplier, count + 50);
  for (let index = 0; index < attempts; index += 1) {
    const profile = profiles[index % profiles.length];
    const selected = [];
    let invalid = false;
    for (let slotIndex = 0; slotIndex < profile.slots.length; slotIndex += 1) {
      const slot = profile.slots[slotIndex];
      const role = eligibility.roles?.[slot.role];
      if (!role?.ingredientIds?.length) throw new Error(`Missing V1 culinary role ${slot.role}`);
      const ingredientId = role.ingredientIds[digestIndex(`${meal}|${profile.id}|${index}|${slotIndex}`, role.ingredientIds.length)];
      const entry = entries.get(ingredientId);
      if (!entry?.revision) throw new Error(`Unknown V1 release ingredient ${ingredientId}`);
      if (selected.some(item => item.entry.family.ingredientId === ingredientId)) { invalid = true; break; }
      selected.push({ role: slot.role, entry, amount: Number(slot.amount ?? role.portionG.default), flexPriority: slot.flexPriority ?? null });
    }
    if (invalid) continue;
    const setKey = [...selected.map(item => item.entry.family.ingredientId)].sort().join('|');
    if (seenSets.has(`${meal}|${profile.family}|${setKey}`)) continue;
    const solved = solveEnergy(selected, eligibility, Number(target.energyKcal.target));
    if (solved.energyKcal < Number(target.energyKcal.min) || solved.energyKcal > Number(target.energyKcal.max)) continue;
    const releaseRules = eligibility.releaseRules || {};
    if (solved.lines.some(item => item.amount <= 0 || item.amount > Number(releaseRules.maxIngredientAmountG || 300))) continue;
    const oil = solved.lines.find(item => item.role === 'oilCooking');
    const nuts = solved.lines.find(item => item.role === 'nutsSeeds');
    const seasoning = solved.lines.find(item => item.role === 'seasoning');
    if (oil && oil.amount > Number(releaseRules.maxOilAmountG || 12)) continue;
    if (nuts && nuts.amount > Number(releaseRules.maxNutsSeedsAmountG || 30)) continue;
    if (seasoning && seasoning.amount > Number(releaseRules.maxSeasoningAmountG || 6)) continue;
    seenSets.add(`${meal}|${profile.family}|${setKey}`);
    const practical = { ...profile.practical, finalWeightG: round1(solved.lines.reduce((sum, item) => sum + item.amount, 0)), finalVolumeMl: null, yieldNotes: 'One standard V1 serving.' };
    candidates.push({
      candidateId: `v1-${meal}-${String(candidates.length + 1).padStart(4, '0')}-${profile.id}`,
      i18n: {
        it: { title: profileTitle(profile, solved.lines, 'it'), description: description(meal, profile, 'it'), instructions: preparationInstructions(profile, solved.lines, 'it') },
        en: { title: profileTitle(profile, solved.lines, 'en'), description: description(meal, profile, 'en'), instructions: preparationInstructions(profile, solved.lines, 'en') }
      },
      mealArchetypes: [meal],
      ingredientLines: solved.lines.map(item => ({ ingredientId: item.entry.family.ingredientId, amount: item.amount, unit: item.entry.revision.basis.unit, optional: false })),
      practical,
      tags: { families: [profile.family], cuisines: [CUISINE], practical: practicalTags(practical) },
      culinaryReview: { status: 'approved', notes: `Generated from explicit culinary-role policy ${eligibility.policyId}@${eligibility.policyVersion}; profile ${profile.id}; portions constrained before pipeline validation.` },
      releaseProfileId: profile.id,
      expectedEnergyKcal: solved.energyKcal
    });
  }
  if (candidates.length < count) throw new Error(`V1 ${meal} generator produced only ${candidates.length}/${count} feasible candidates`);
  return candidates;
}
