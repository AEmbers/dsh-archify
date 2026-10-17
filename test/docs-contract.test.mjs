import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const readmePath = path.join(repoRoot, 'README.md');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('README is a single bilingual file with both language sections present', () => {
  const readme = read('README.md');
  assert.match(readme, /简体中文/);
  assert.match(readme, /English/);
  const cnStart = readme.indexOf('简体中文');
  const enStart = readme.indexOf('English');
  assert.ok(cnStart !== -1 && enStart !== -1, 'both language labels must exist');
  assert.ok(enStart > cnStart, 'Chinese section must come first (CN-default)');
});

test('README covers install, invoke, uninstall, produced-files, security, and upstream attribution', () => {
  const readme = read('README.md');
  // Install must use the git spec — dsh-archify is not on npm yet (npm view
  // returns 404), so a bare `add dsh-archify` would 404 (G1/H1).
  assert.match(readme, /dsh plugin[^\n]*add github:AEmbers\/dsh-archify/);
  // The fork ships the staged skills/ payload, so the docs must say the install
  // runs no build script (the "no allowBuilds needed" claim).
  assert.match(readme, /allowBuilds/);
  assert.match(readme, /no build script|不含任何构建脚本/);
  assert.match(readme, /node -v|^22\.19\.0|\^22\.19\.0/);
  assert.doesNotMatch(readme, /dsh plugin[^\n]*add dsh-archify\s*$/m);
  assert.doesNotMatch(readme, /allowBuilds:\s*true/);
  assert.doesNotMatch(readme, /npm install github:/);
  // Invoke example and uninstall.
  assert.match(readme, /Use the archify skill to map this repository's runtime architecture/);
  assert.match(readme, /dsh plugin[^\n]*remove dsh-archify/);
  // Produced Files limitation and security posture are honest disclosures.
  assert.match(readme, /Produced Files/i);
  assert.match(readme, /exact workspace paths|workspace paths/i);
  assert.match(readme, /no telemetry|无遥测/i);
  // Upstream attribution: port wording + link to the upstream repo (A-report).
  assert.match(readme, /移植自/);
  assert.match(readme, /https:\/\/github\.com\/tt-a1i\/archify/);
  // The fleet convention asks for a "star the upstream" call (2/18).
  assert.match(readme, /star/i);
});

test('README must not teach the upstream skills-CLI install as the dsh path', () => {
  const readme = read('README.md');
  assert.doesNotMatch(readme, /npx skills add tt-a1i\/archify/);
});
