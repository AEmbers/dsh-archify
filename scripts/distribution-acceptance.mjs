#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnCli, spawnCliSync } from './resolve-cli.mjs';
import { excludeFromCleanStaging, listRelativeFiles } from './staging.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const integrationRoot = path.resolve(here, '..');
const repoRoot = integrationRoot;
const PACKAGE_NAME = 'dsh-archify';
const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(path.join(integrationRoot, 'package.json'), 'utf8'),
).version;
// Target runtime for the acceptance probe. Override for a different release:
// `DSH_SPEC=@deepseek-ai/dsh@<version> node scripts/distribution-acceptance.mjs`.
const DSH_SPEC = process.env.DSH_SPEC || '@deepseek-ai/dsh@0.2.1-alpha.5';
const PROFILE = 'dsh-archify-acceptance';
const DSH_RUNTIME_INSTALL_TIMEOUT = process.platform === 'win32' ? 600_000 : 300_000;
const PLUGIN_MUTATION_TIMEOUT = 180_000;

const receipt = {
  ok: false,
  adapter: { name: PACKAGE_NAME, version: PACKAGE_VERSION },
  dsh: { spec: DSH_SPEC },
  node: process.version,
  platform: process.platform,
  stages: [],
};

function fail(stage, message, extra = {}) {
  receipt.stages.push({ name: stage, ok: false, error: message, ...extra });
  receipt.ok = false;
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.exit(1);
}

function pass(stage, extra = {}) {
  receipt.stages.push({ name: stage, ok: true, ...extra });
}

function run(command, args, options = {}) {
  return spawnCliSync(command, args, {
    encoding: 'utf8',
    ...options,
    env: { ...process.env, ...options.env },
  });
}

function requireStatus(stage, result, extra = {}) {
  if (result.error || result.status !== 0) {
    fail(stage, [
      result.error?.message,
      `${extra.command || 'command'} exited ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'), extra);
  }
}

function parseDump(yaml) {
  const layers = [];
  const rows = [];
  let layer = { name: 'root', rows: [] };
  let current = null;
  for (const line of yaml.split('\n')) {
    const header = line.match(/^# ==\s+(.+)$/);
    if (header) {
      layer = { name: header[1].trim(), rows: [] };
      layers.push(layer);
      current = null;
      continue;
    }
    const id = line.match(/^- id:\s+(\S+)/);
    if (id) {
      current = { id: id[1].replace(/['"]/g, ''), name: '', config: {} };
      rows.push(current);
      layer.rows.push(current);
      continue;
    }
    if (!current) continue;
    const name = line.match(/^\s+name:\s+(.+)$/);
    if (name) current.name = name[1].replace(/^['"]|['"]$/g, '');
    const provider = line.match(/^\s+providerName:\s+(\S+)/);
    if (provider) current.config.providerName = provider[1];
    const includeDefault = line.match(/^\s+includeDefaultRoots:\s+(\S+)/);
    if (includeDefault) current.config.includeDefaultRoots = includeDefault[1] === 'true';
  }
  return { layers, rows };
}

function waitForProbe(child, file, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const started = Date.now();
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setInterval(() => {
      if (fs.existsSync(file)) {
        finish();
        return;
      }
      if (Date.now() - started > timeoutMs) finish(new Error('skill probe timed out'));
    }, 250);
    child.once('error', (error) => {
      if (fs.existsSync(file)) finish();
      else finish(error);
    });
    child.once('exit', (code, signal) => {
      if (fs.existsSync(file)) finish();
      else finish(new Error(`dsh boot exited ${code} signal ${signal} before writing the skill probe`));
    });
  });
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-archify-acceptance-'));
const tarball = path.join(scratch, `dsh-archify-${PACKAGE_VERSION}.tgz`);
const dshHome = path.join(scratch, 'dsh-home');
const agentsHome = path.join(scratch, 'agents-home');
const dshRuntime = path.join(scratch, 'dsh-runtime');
const workspace = path.join(scratch, 'workspace');
const probeOut = path.join(scratch, 'skill-probe.json');
fs.mkdirSync(dshHome);
fs.mkdirSync(agentsHome);
fs.mkdirSync(dshRuntime);
fs.mkdirSync(workspace);

function cleanup() {
  fs.rmSync(scratch, { recursive: true, force: true });
}
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
process.on('SIGTERM', () => process.exit(143));

const pack = run(process.execPath, [
  path.join(integrationRoot, 'scripts', 'pack.mjs'),
  '--out', tarball,
  '--json',
], { cwd: repoRoot });
requireStatus('pack', pack, { command: 'pack.mjs' });
let packReceipt;
try {
  packReceipt = JSON.parse(pack.stdout);
} catch (error) {
  fail('pack', `pack did not emit JSON: ${error.message}\n${pack.stdout}`);
}
if (packReceipt.name !== PACKAGE_NAME || packReceipt.version !== PACKAGE_VERSION || !fs.existsSync(tarball)) {
  fail('pack', 'pack receipt identity mismatch', { packReceipt, tarball });
}
pass('pack', { filename: packReceipt.filename, fileCount: packReceipt.files?.length });

const inspectRoot = path.join(scratch, 'tarball');
fs.mkdirSync(inspectRoot);
requireStatus('tarball-inspect', run('tar', ['-xzf', path.basename(tarball), '-C', inspectRoot], {
  cwd: path.dirname(tarball),
}));
const packedPkg = JSON.parse(fs.readFileSync(path.join(inspectRoot, 'package', 'package.json'), 'utf8'));
const packedFiles = listRelativeFiles(path.join(inspectRoot, 'package'));
const forbidden = packedFiles.filter((file) => (
  file.startsWith('test/')
  || file.includes('node_modules/')
  || file.includes('package-lock.json')
  || file.includes('.hive')
  || file.includes('.workbuddy')
  || file.includes('probe-skills')
  || file.includes('generate-validators.mjs')
));
if (packedPkg.name !== PACKAGE_NAME || packedPkg.version !== PACKAGE_VERSION || forbidden.length > 0) {
  fail('tarball-inspect', 'packed identity or exclusions failed', { forbidden, packedPkg });
}
if (!packedFiles.includes('skills/archify/SKILL.md')) {
  fail('tarball-inspect', 'packed tarball is missing the clean Archify Skill');
}
pass('tarball-inspect', { fileCount: packedFiles.length });

const dshEnv = {
  ...process.env,
  DSH_HOME: dshHome,
  DSH_AGENTS_HOME: agentsHome,
  DSH_TELEMETRY_DISABLED: '1',
  ARCHIFY_DSH_PROBE_OUT: probeOut,
  npm_config_update_notifier: 'false',
};

// Install the pinned host once, as a user-level global install would. Keeping
// this separate from plugin mutation makes a slow first-time npm download
// distinguishable from `dsh plugin add`, especially on Windows runners.
const runtimeInstall = run('npm', [
  'install',
  '--prefix', dshRuntime,
  '--no-save',
  '--package-lock=false',
  '--no-audit',
  '--no-fund',
  '--foreground-scripts',
  '--loglevel=warn',
  DSH_SPEC,
], {
  cwd: scratch,
  env: dshEnv,
  // Stream npm lifecycle diagnostics without polluting the JSON-only receipt
  // written to this process's stdout.
  stdio: ['ignore', 2, 2],
  timeout: DSH_RUNTIME_INSTALL_TIMEOUT,
});
requireStatus('dsh-runtime-install', runtimeInstall, { command: `npm install ${DSH_SPEC}` });
const dshPackageRoot = path.join(dshRuntime, 'node_modules', '@deepseek-ai', 'dsh');
const dshManifest = JSON.parse(fs.readFileSync(path.join(dshPackageRoot, 'package.json'), 'utf8'));
const dshBin = path.join(dshPackageRoot, 'lib', 'bin.js');
if (dshManifest.version !== DSH_SPEC.slice(DSH_SPEC.lastIndexOf('@') + 1) || !fs.existsSync(dshBin)) {
  fail('dsh-runtime-install', 'installed DSH runtime identity mismatch', {
    version: dshManifest.version,
    binExists: fs.existsSync(dshBin),
  });
}
pass('dsh-runtime-install', { version: dshManifest.version });

function dsh(args, options = {}) {
  return run(process.execPath, [dshBin, ...args], {
    cwd: options.cwd || workspace,
    env: dshEnv,
    timeout: options.timeout ?? 120_000,
  });
}

const install = dsh(['plugin', '--profile', PROFILE, 'add', tarball], { timeout: PLUGIN_MUTATION_TIMEOUT });
requireStatus('plugin-install', install, { command: `dsh plugin --profile ${PROFILE} add <tarball>` });
pass('plugin-install', { profile: PROFILE });

const profileDir = path.join(dshHome, 'profiles', PROFILE);
const profileManifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
const bundles = profileManifest.dsh?.profile?.bundles || [];
const deps = profileManifest.dependencies || {};
if (!bundles.includes(PACKAGE_NAME) || !deps[PACKAGE_NAME]) {
  fail('profile-identity', 'installed profile does not name the real package identity', { bundles, deps });
}
if (String(deps[PACKAGE_NAME]).includes('link:') || String(deps[PACKAGE_NAME]).includes(integrationRoot)) {
  fail('profile-identity', 'profile was installed from a source checkout or link instead of the tarball', { deps });
}
pass('profile-identity', { bundles, dependency: deps[PACKAGE_NAME] });

const dump = dsh(['--profile', PROFILE, '--dump-config']);
requireStatus('compose', dump, { command: 'dsh --dump-config' });
const composed = parseDump(dump.stdout);
const archifyLayer = composed.layers.find((layer) => layer.name === PACKAGE_NAME);
const originalFilesystem = composed.rows.find((row) => row.id === 'skill-filesystem');
const archifyProvider = composed.rows.find((row) => row.id === 'archify-skill-filesystem');
const extraProviders = composed.rows.filter((row) => row.config.providerName === 'archify-plugin');
if (!dump.stdout.includes(`# == ${PACKAGE_NAME}`) || !archifyLayer) {
  fail('compose', 'composed dump does not include the Archify bundle layer', { layers: composed.layers.map((layer) => layer.name) });
}
if (!originalFilesystem || originalFilesystem.config.providerName === 'archify-plugin') {
  fail('compose', 'original DSH skill-filesystem row was replaced', { originalFilesystem });
}
if (!archifyProvider || extraProviders.length !== 1 || archifyLayer.rows.length !== 1) {
  fail('compose', 'composed config did not insert exactly one Archify Skill provider', {
    extra: extraProviders.map((row) => row.id),
    layerRows: archifyLayer.rows.map((row) => row.id),
  });
}
if (archifyProvider.config.includeDefaultRoots !== false || archifyProvider.config.providerName !== 'archify-plugin') {
  fail('compose', 'Archify provider config is not isolated', { archifyProvider });
}
pass('compose', {
  extraIds: archifyLayer.rows.map((row) => row.id),
  providerName: 'archify-plugin',
});

const probePatch = path.join(scratch, 'probe.patch.yml');
const probeModule = path.join(integrationRoot, 'test', 'probe-skills.mjs');
fs.writeFileSync(probePatch, `- insert:
    - id: archify-dsh-skill-probe
      name: ${JSON.stringify(pathToFileURL(probeModule).href)}
      inject: [skills]
`);
const probeChild = spawnCli(process.execPath, [dshBin, '--profile', PROFILE, '--patch', probePatch], {
  cwd: workspace,
  env: dshEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let probeStdout = '';
let probeStderr = '';
probeChild.stdout.on('data', (chunk) => { probeStdout += chunk; });
probeChild.stderr.on('data', (chunk) => { probeStderr += chunk; });
try {
  await waitForProbe(probeChild, probeOut, 90_000);
} catch (error) {
  probeChild.kill('SIGTERM');
  fail('skill-discovery', error.message, { stdout: probeStdout, stderr: probeStderr });
}
probeChild.kill('SIGTERM');
const probeReceipt = JSON.parse(fs.readFileSync(probeOut, 'utf8'));
const archifyHits = (probeReceipt.skills || []).filter((skill) => skill.name === 'archify');
if (archifyHits.length !== 1 || archifyHits[0].provider !== 'archify-plugin') {
  fail('skill-discovery', 'public Skill registry did not discover archify only from archify-plugin', {
    probeReceipt,
    stdout: probeStdout,
    stderr: probeStderr,
  });
}
pass('skill-discovery', { provider: 'archify-plugin' });

if (!probeReceipt.definition?.contentLength || probeReceipt.definition.provider !== 'archify-plugin') {
  fail('skill-load', 'full Skill definition was not loaded', { definition: probeReceipt.definition });
}
pass('skill-load', { contentLength: probeReceipt.definition.contentLength });

const resourcePath = probeReceipt.definition.resourceBase?.path || probeReceipt.definition.path;
const installedPackage = path.join(profileDir, 'node_modules', 'dsh-archify');
let resourceReal;
let packageReal;
try {
  resourceReal = fs.realpathSync(resourcePath);
  packageReal = fs.realpathSync(installedPackage);
} catch (error) {
  fail('resource-base', `cannot realpath installed Skill root: ${error.message}`, { resourcePath, installedPackage });
}
const resourceRelative = path.relative(packageReal, resourceReal);
const resourceInsidePackage = resourceRelative
  && !resourceRelative.startsWith(`..${path.sep}`)
  && resourceRelative !== '..'
  && !path.isAbsolute(resourceRelative);
if (!resourceInsidePackage || !resourceReal.includes(`${path.sep}skills${path.sep}archify`)) {
  fail('resource-base', 'Skill resource base is not inside the installed tarball package', {
    resourcePath: resourceReal,
    installedPackage: packageReal,
  });
}
pass('resource-base', { resourcePath: resourceReal });

const skillRoot = fs.existsSync(path.join(resourceReal, 'SKILL.md'))
  ? resourceReal
  : path.join(resourceReal, 'archify');
const smoke = run(process.execPath, [path.join(repoRoot, 'scripts', 'package-smoke.mjs'), skillRoot], {
  cwd: repoRoot,
  timeout: 120_000,
});
requireStatus('package-smoke', smoke, { command: 'package-smoke.mjs <installed-skill-root>' });
pass('package-smoke', { skillRoot, output: smoke.stdout.trim() });

const remove = dsh(['plugin', '--profile', PROFILE, 'remove', PACKAGE_NAME], { timeout: PLUGIN_MUTATION_TIMEOUT });
requireStatus('uninstall', remove, { command: `dsh plugin --profile ${PROFILE} remove ${PACKAGE_NAME}` });
const removedManifest = JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'));
if ((removedManifest.dsh?.profile?.bundles || []).includes(PACKAGE_NAME)
  || removedManifest.dependencies?.[PACKAGE_NAME]) {
  fail('uninstall', 'adapter dependency or bundle layer remained after plugin remove', { removedManifest });
}
pass('uninstall', { bundles: removedManifest.dsh?.profile?.bundles || [] });

const baseBootDump = dsh(['--profile', PROFILE, '--dump-config']);
requireStatus('base-profile', baseBootDump, { command: 'dsh --dump-config after uninstall' });
const leftover = parseDump(baseBootDump.stdout).rows.filter((row) => (
  row.id === 'archify-skill-filesystem' || row.config.providerName === 'archify-plugin'
));
if (leftover.length > 0) {
  fail('base-profile', 'uninstalled profile still contains the Archify provider', { leftover });
}
pass('base-profile', { bundles: removedManifest.dsh?.profile?.bundles || [] });

const packedSkill = path.join(inspectRoot, 'package', 'skills', 'archify');
const repoSkill = path.join(repoRoot, 'archify');

// Port zero-regression: the packed skill must equal the repo `archify/` tree
// minus the clean-staging exclusions (test/, node_modules, generate-validators,
// package-lock). The upstream script compared against its committed
// `archify.zip` and git blob pins — that machinery does not exist in a port
// repo, and the same byte-level contract is enforced by comparing the packed
// payload against the tracked skill tree here. Exclusion rules are shared with
// staging via ./staging.mjs.
function trackedSkillFiles() {
  const tracked = run('git', ['ls-files', '-z', '--', 'archify'], { cwd: repoRoot });
  return tracked.stdout.split('\0').filter(Boolean)
    .map((entry) => entry.replace(/^archify\//, ''))
    .filter((relative) => !excludeFromCleanStaging(relative));
}

const packedList = listRelativeFiles(packedSkill);
const expectedList = trackedSkillFiles().sort();
if (packedList.join('\n') !== expectedList.join('\n')) {
  fail('fidelity', 'packed skill file list drifted from the tracked skill tree', {
    missing: expectedList.filter((file) => !packedList.includes(file)),
    extra: packedList.filter((file) => !expectedList.includes(file)),
  });
}
const drifted = packedList.filter((file) => {
  if (file === 'package.json') return false; // scripts/devDependencies stripped by staging
  const left = fs.readFileSync(path.join(packedSkill, ...file.split('/')));
  const right = fs.readFileSync(path.join(repoSkill, ...file.split('/')));
  return !left.equals(right);
});
if (drifted.length > 0) {
  fail('fidelity', 'packed skill bytes drifted from the tracked skill tree', { drifted });
}
const notices = fs.readFileSync(path.join(repoRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8');
if (!notices.includes('archify-dsh-v0.1.0') || !notices.includes('fc6e8aca')) {
  fail('fidelity', 'THIRD_PARTY_NOTICES.md must pin the upstream release tag and commit', {});
}
pass('fidelity', { packedFiles: packedList.length, upstreamCommit: 'fc6e8aca' });

receipt.ok = receipt.stages.every((stage) => stage.ok);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
process.exit(receipt.ok ? 0 : 1);
