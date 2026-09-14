// A runtime presentation migration may advance a base current pointer. Only
// an explicit, same-family supersedes link to an installed version admits it.
export async function availableCurrentRecipeIds(repo, packId = '') {
  const catalogVersion = await repo.getMeta('activeCatalogVersion');
  const packs = catalogVersion ? await repo.getAllByIndex('catalogPacks', 'catalogVersion', { kind: 'only', value: catalogVersion }) : [];
  const installed = new Set(packs.filter(pack => pack.status === 'installed' && (!packId || pack.packId === packId)).flatMap(pack => pack.recipeVersionIds || []));
  const families = (await repo.getAll('recipes')).filter(family => family.status === 'active');
  const pending = families.filter(family => family.origin !== 'user' && !installed.has(family.currentVersionId));
  const versions = await repo.getMany('recipeVersions', pending.map(family => family.currentVersionId));
  const migrated = new Set(versions.filter(version => version.generation?.pipelineVersion === 'recipe-presentation-r2-1'
    && installed.has(version.supersedesVersionId)
    && families.some(family => family.recipeId === version.recipeId && family.currentVersionId === version.recipeVersionId)).map(version => version.recipeVersionId));
  return families.filter(family => (family.origin === 'user' && !packId) || installed.has(family.currentVersionId) || migrated.has(family.currentVersionId)).map(family => family.currentVersionId).sort();
}
