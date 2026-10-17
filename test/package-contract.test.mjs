import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const manifestPath = path.join(repoRoot, 'package.json');

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'bundledDependencies',
  'bundleDependencies',
];
// Upstream ships prebuilt npm tarballs, so its integration package deliberately
// has no lifecycle scripts at all. The fork removes the port's original
// `prepare` too (B1 fix): `skills/` is committed instead of staged at install
// time, because pnpm 11 refuses to run build scripts for git-hosted
// dependencies unless the consuming profile allowlists them. `npm run stage`
// regenerates the committed copy, and zero-regression.test.mjs diffs it against
// a fresh clean staging so it cannot go stale.
const FORBIDDEN_LIFECYCLE_SCRIPTS = ['install', 'postinstall', 'preinstall', 'prepare', 'prepublishOnly'];

test('the port repo is a standalone package with the skill and adapter at the root', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, 'package.json')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'package-lock.json')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'archify/SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'lib/index.js')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'cordis.patch.yml')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'pnpm-workspace.yaml')), false);
});

test('publishable manifest is dsh-archify@0.1.1 with a DSH bundle patch and no install surface', () => {
  const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(pkg.name, 'dsh-archify');
  assert.equal(pkg.version, '0.1.1');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.main, './lib/index.js');
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml');
  assert.equal(fs.existsSync(path.join(repoRoot, pkg.dsh.bundle.patch)), true);
  assert.equal(pkg.repository?.url, 'git+https://github.com/AEmbers/dsh-archify.git');
  assert.equal(pkg.engines?.dsh, '>=0.2.1-alpha.5');
  for (const keyword of ['dsh-plugin', 'deepseek-harness', 'agent-skill', 'architecture-diagram']) {
    assert.ok(pkg.keywords?.includes(keyword), `missing keyword ${keyword}`);
  }
  for (const field of DEPENDENCY_FIELDS) {
    assert.equal(Object.prototype.hasOwnProperty.call(pkg, field), false, field);
  }
  for (const script of FORBIDDEN_LIFECYCLE_SCRIPTS) {
    assert.equal(pkg.scripts?.[script], undefined, script);
  }
  assert.equal(typeof pkg.scripts?.stage, 'string', 'stage regenerates the committed skills/ payload');
  assert.equal(fs.existsSync(path.join(repoRoot, 'skills/archify/SKILL.md')), true);
  assert.match(pkg.exports?.['./package.json'] || '', /package\.json/);
});

test('bundle patch inserts one uniquely named filesystem Skill provider resolved from the installed package', () => {
  const patch = fs.readFileSync(path.join(repoRoot, 'cordis.patch.yml'), 'utf8');
  assert.match(patch, /^- insert:/m);
  assert.match(patch, /id:\s*archify-skill-filesystem/);
  assert.match(patch, /name:\s*'@deepseek-ai\/dsh-skill-filesystem'/);
  assert.match(patch, /providerName:\s*archify-plugin/);
  assert.match(patch, /includeDefaultRoots:\s*false/);
  assert.match(patch, /bundledSkillDir:\s*!!js/);
  assert.doesNotMatch(patch, /customSkillDirs/);
  assert.match(
    patch,
    /createRequire\(baseUrl\)\.resolve\('dsh-archify\/package\.json'\)/,
  );
  assert.doesNotMatch(patch, /new URL\(\s*['"]skills\//);
  assert.doesNotMatch(patch, /archify_render|archify_deliver|dsh\.client|ui-deliverables/);
  const insertBlocks = patch.split(/^- insert:/m).slice(1);
  assert.equal(insertBlocks.length, 1);
  const insertedIds = [...insertBlocks[0].matchAll(/^\s+- id:\s*(\S+)/gm)].map((match) => match[1]);
  assert.deepEqual(insertedIds, ['archify-skill-filesystem']);
});

test('distribution acceptance reserves stdout for its machine-readable JSON receipt', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'distribution-acceptance.mjs'),
    'utf8',
  );
  const runtimeInstall = source.match(/const runtimeInstall = run\([\s\S]*?\n\}\);/)?.[0] || '';
  assert.match(runtimeInstall, /stdio:\s*\['ignore',\s*2,\s*2\]/);
  assert.doesNotMatch(source, /stdio:\s*['"]inherit['"]/);
  assert.equal([...source.matchAll(/process\.stdout\.write/g)].length, 2);
});
