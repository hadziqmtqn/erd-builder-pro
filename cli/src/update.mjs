export function isNewerVersion(latest, current) {
  const parse = value => {
    const [core, prerelease = ''] = String(value).trim().replace(/^v/, '').split('-', 2);
    return { numbers: core.split('.').map(part => Number.parseInt(part, 10) || 0), prerelease };
  };
  const next = parse(latest);
  const installed = parse(current);
  for (let index = 0; index < Math.max(next.numbers.length, installed.numbers.length); index++) {
    const difference = (next.numbers[index] || 0) - (installed.numbers[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  if (!next.prerelease && installed.prerelease) return true;
  if (next.prerelease && !installed.prerelease) return false;
  return next.prerelease.localeCompare(installed.prerelease, undefined, { numeric: true }) > 0;
}

export function updateInstallCommand(tag = 'latest') {
  return `npm install -g erdbpro@${tag} --prefer-online`;
}
