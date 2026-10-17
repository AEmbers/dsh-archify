import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Upstream parity proof for the ported skill payload.
//
// The upstream repository ships its own test suite under <repo>/test, but those
// tests resolve paths against upstream's own layout (repo-root examples/,
// docs/, README_*.md, benchmarks/) and are therefore not portable into this
// repo without rewriting them — a rewrite would break the "verbatim payload"
// guarantee. Instead this test proves the payload from the outside:
//
//   1. every shipped example spec renders with the shipped renderers, and
//   2. for each spec that has a canonical upstream render committed next to it,
//      the fresh render is byte-identical to that render.
//
// (2) is the strong claim: the renderer is deterministic, so a single byte of
// drift in renderers/, schemas/, assets/template.html, or the embedded validators
// shows up here even when the SHA-256 pins still match upstream (for example
// after a bad merge that changes both the tree and the pin block).

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const skillRoot = path.join(repoRoot, 'archify');
const examplesRoot = path.join(skillRoot, 'examples');

// spec file → canonical render committed by upstream in archify/examples/
const CANONICAL_RENDERS = {
  'payments.class.json': 'class-payments-rendered.html',
  'payment-processors.class.json': 'class-payment-processors-rendered.html',
  'product-analytics.dataflow.json': 'dataflow-product-analytics.html',
  'orders.erd.json': 'erd-orders-rendered.html',
  'subscription-billing.erd.json': 'subscription-billing-rendered.html',
  'agent-run.lifecycle.json': 'lifecycle-agent-run.html',
  'cache-miss-request.sequence.json': 'sequence-cache-miss-request.html',
  'archify-dev-activity.timeline.json': 'timeline-archify-dev-activity-rendered.html',
  'payment-incident.timeline.json': 'timeline-payment-incident-rendered.html',
  'archify-repository.tree.json': 'tree-archify-repository-rendered.html',
  'payment-platform.tree.json': 'tree-payment-platform-rendered.html',
  'checkout-request.waterfall.json': 'waterfall-checkout-request-rendered.html',
  'example-rebuild.waterfall.json': 'waterfall-example-rebuild-rendered.html',
  'web-app.architecture.json': 'web-app-rendered.html',
  'agent-tool-call.workflow.json': 'workflow-agent-tool-call-rendered.html',
};

const TYPES = [
  'architecture',
  'workflow',
  'sequence',
  'dataflow',
  'lifecycle',
  'erd',
  'tree',
  'class',
  'timeline',
  'waterfall',
];

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function typeOf(specName) {
  return TYPES.find((type) => specName.endsWith(`.${type}.json`));
}

test('every shipped example spec renders with the shipped skill payload', () => {
  const specs = fs.readdirSync(examplesRoot).filter((name) => name.endsWith('.json')).sort();
  assert.ok(specs.length >= 20, `expected the full example set, found ${specs.length}`);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-render-'));
  try {
    for (const spec of specs) {
      const type = typeOf(spec);
      assert.ok(type, `${spec}: example file name must end with one of the ten diagram types`);
      const out = path.join(scratch, `${spec}.html`);
      const run = spawnSync(
        process.execPath,
        ['bin/archify.mjs', 'render', type, path.join('examples', spec), out],
        { cwd: skillRoot, encoding: 'utf8' },
      );
      assert.equal(run.status, 0, `${spec}: ${run.stderr || run.stdout}`);
      assert.ok(fs.statSync(out).size > 100_000, `${spec}: render looks truncated`);
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('re-rendering a canonical example reproduces the committed HTML byte-for-byte', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'archify-parity-'));
  try {
    const drift = [];
    for (const [spec, renderName] of Object.entries(CANONICAL_RENDERS)) {
      const specPath = path.join(examplesRoot, spec);
      const renderPath = path.join(examplesRoot, renderName);
      assert.ok(fs.existsSync(specPath), `missing spec ${spec}`);
      assert.ok(fs.existsSync(renderPath), `missing canonical render ${renderName}`);
      const out = path.join(scratch, `${spec}.html`);
      const run = spawnSync(
        process.execPath,
        ['bin/archify.mjs', 'render', typeOf(spec), path.join('examples', spec), out],
        { cwd: skillRoot, encoding: 'utf8' },
      );
      assert.equal(run.status, 0, `${spec}: ${run.stderr || run.stdout}`);
      if (sha256(out) !== sha256(renderPath)) drift.push(`${spec} → ${renderName}`);
    }
    assert.deepEqual(drift, [], 'canonical renders drifted from a fresh render (non-deterministic or edited payload)');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
