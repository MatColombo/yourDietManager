function parts(version) { return version.split(/[.+-]/).slice(0, 3).map(part => Number.parseInt(part, 10) || 0); }
export function compareSemver(a, b) {
  const av = parts(a), bv = parts(b);
  for (let index = 0; index < 3; index += 1) {
    const delta = (av[index] || 0) - (bv[index] || 0);
    if (delta) return delta;
  }
  return 0;
}
