// Shared clean-staging rules for the Archify skill payload.
//
// Single source for the port-invented copies of the "what ships in the skill
// tarball" contract, so staging, distribution acceptance, and contract tests
// cannot drift apart. The upstream repo itself tolerates two copies of these
// rules (scripts/pack.mjs + scripts/build-zip.sh); pack.mjs keeps its
// upstream-inherited inline copy for a minimal diff, and every other consumer
// imports from here.
//
// The exclusion set mirrors upstream pack.mjs exactly: node_modules never
// ships; test/ is repo-only; local agent coordination folders cannot leak;
// package-lock.json is stripped; runtime schema validation comes from the
// committed standalone validators, so the installed skill never requires
// npm install.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** True when `relative` (posix or native, under the skill root) must not ship. */
export function excludeFromCleanStaging(relative) {
  const parts = relative.split(/[\\/]/);
  if (parts.includes('node_modules')) return true;
  if (parts.includes('test')) return true;
  if (parts.includes('.DS_Store')) return true;
  if (parts.includes('.hive')) return true;
  if (parts.includes('.workbuddy')) return true;
  if (parts.some((part) => part.startsWith('.validator-check-'))) return true;
  if (parts.join('/') === 'scripts/generate-validators.mjs') return true;
  if (relative === 'package-lock.json') return true;
  return false;
}

/** Sorted relative file list under `root`, posix separators. */
export function listRelativeFiles(root) {
  const files = [];
  function walkDir(dir, prefix) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) walkDir(path.join(dir, entry.name), relative);
      else files.push(relative);
    }
  }
  walkDir(root, '');
  return files.sort();
}

/** Tracked files under `archify/` in the repo at `repoRoot`. */
export function trackedArchifyFiles(repoRoot) {
  const tracked = spawnSync('git', ['ls-files', '-z', '--', 'archify'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (tracked.status !== 0) {
    throw new Error(`unable to enumerate tracked Archify files: ${tracked.stderr || tracked.error?.message}`);
  }
  return tracked.stdout.split('\0').filter(Boolean);
}

/**
 * Copy `repoRoot/archify` to `dest` excluding `excludeFromCleanStaging`
 * entries, then strip npm scripts / devDependencies / package-lock.json from
 * the staged copy. Requires the committed generated validators to exist.
 */
export function stageCleanArchify({ repoRoot, dest }) {
  const archifySource = path.join(repoRoot, 'archify');
  const validators = path.join(archifySource, 'renderers/shared/generated-validators.mjs');
  if (!fs.existsSync(validators)) {
    throw new Error('generated validators are missing — run npm run generate:validators in archify/');
  }
  for (const repoRelative of trackedArchifyFiles(repoRoot)) {
    const src = path.join(repoRoot, ...repoRelative.split('/'));
    const relative = path.relative(archifySource, src);
    if (!relative || relative === '.' || excludeFromCleanStaging(relative)) continue;
    const destination = path.join(dest, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(src, destination);
  }
  const packagePath = path.join(dest, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  delete pkg.scripts;
  delete pkg.devDependencies;
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  fs.rmSync(path.join(dest, 'package-lock.json'), { force: true });
}
