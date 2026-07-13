// run-e2e.js — end-to-end integration test.
//
// Spins up the controller and the headless simulator, then exercises every
// command through the REST API, verifying round-trip results. This validates
// the ENTIRE architecture: controller → WS → simulator (JSX dispatch on mock
// AE DOM) → WS → controller → REST response.
//
// Usage: node controller/test/e2e/run-e2e.js

import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, rmSync } from 'node:fs';
import WebSocket from 'ws';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..', '..');
const RENDER_OUT = resolve(ROOT, 'out', 'e2e-render.txt');

// Live event collection from a /agent WebSocket (proves the event broadcast
// path the UI/agents rely on, including render progress + completion).
const events = [];
let agentWs = null;
function connectAgent() {
  return new Promise((resolve, reject) => {
    agentWs = new WebSocket(`ws://${HOST}:${PORT}/agent`);
    agentWs.on('open', () => resolve());
    agentWs.on('error', reject);
    agentWs.on('message', (d) => {
      try {
        const env = JSON.parse(d.toString());
        if (env.type === 'event') events.push(env);
      } catch { /* ignore */ }
    });
  });
}
async function waitForEvent(predicate, maxMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const hit = events.find(predicate);
    if (hit) return hit;
    await sleep(50);
  }
  return null;
}

// Use a unique port to avoid conflicts with a running dev server.
const PORT = 18787;
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;

let controllerProc = null;
let simulatorProc = null;
let passed = 0;
let failed = 0;
const failures = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let chunks = '';
      res.on('data', (d) => { chunks += d; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); }
        catch (e) { resolve({ status: res.statusCode, body: chunks }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let chunks = '';
      res.on('data', (d) => { chunks += d; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); }
        catch (e) { resolve({ status: res.statusCode, body: chunks }); }
      });
    }).on('error', reject);
  });
}

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    failures.push(msg);
    console.log(`  ✗ ${msg}`);
  }
}

function assertEqual(actual, expected, msg) {
  const match = JSON.stringify(actual) === JSON.stringify(expected);
  assert(match, `${msg} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function waitForServer(url, maxMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await get('/api/health');
      if (r.status === 200) return true;
    } catch { /* not ready yet */ }
    await sleep(200);
  }
  throw new Error(`Server at ${url} did not start within ${maxMs}ms`);
}

async function waitForPanel(maxMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await get('/api/status');
      if (r.body?.status?.connected) return true;
    } catch { /* not ready */ }
    await sleep(200);
  }
  throw new Error(`Simulator did not connect within ${maxMs}ms`);
}

// ---------------------------------------------------------------------------
// Process management
// ---------------------------------------------------------------------------
function startController() {
  return new Promise((resolve, reject) => {
    controllerProc = spawn('node', ['controller/src/server.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        AE_BRIDGE_PORT: String(PORT),
        AE_BRIDGE_HOST: HOST,
        AE_BRIDGE_ALLOW_DEV: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    controllerProc.stdout.on('data', (d) => {
      const line = d.toString().trim();
      if (line) console.log(`[ctrl] ${line}`);
    });
    controllerProc.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line) console.log(`[ctrl:err] ${line}`);
    });
    controllerProc.on('error', reject);
    // Give it a moment to bind.
    setTimeout(resolve, 300);
  });
}

function startSimulator() {
  return new Promise((resolve, reject) => {
    simulatorProc = spawn('node', ['simulator/src/index.js'], {
      cwd: ROOT,
      env: {
        ...process.env,
        AE_BRIDGE_PORT: String(PORT),
        AE_BRIDGE_HOST: HOST,
        AE_BRIDGE_ALLOW_DEV: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    simulatorProc.stdout.on('data', (d) => {
      const line = d.toString().trim();
      if (line) console.log(`[sim] ${line}`);
    });
    simulatorProc.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line) console.log(`[sim:err] ${line}`);
    });
    simulatorProc.on('error', reject);
    setTimeout(resolve, 300);
  });
}

function cleanup() {
  if (agentWs) { try { agentWs.close(); } catch { /* ignore */ } agentWs = null; }
  if (controllerProc) { controllerProc.kill('SIGTERM'); controllerProc = null; }
  if (simulatorProc) { simulatorProc.kill('SIGTERM'); simulatorProc = null; }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
async function runTests() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  aftr E2E Test Suite');
  console.log('═══════════════════════════════════════════\n');

  // --- Setup ---
  console.log('[setup] Building JSX bundle…');
  const { execSync } = await import('node:child_process');
  execSync('node panel/build/bundle-jsx.js', { cwd: ROOT, stdio: 'pipe' });

  console.log('[setup] Starting controller…');
  await startController();
  await waitForServer(BASE);
  console.log('[setup] Controller ready');

  console.log('[setup] Starting simulator…');
  await startSimulator();
  await waitForPanel();
  console.log('[setup] Simulator connected');

  console.log('[setup] Connecting agent WS for event capture…');
  await connectAgent();
  rmSync(RENDER_OUT, { force: true });
  console.log('[setup] Agent connected\n');

  // --- REST API tests ---
  console.log('── REST API ──');
  {
    const r = await get('/api/health');
    assert(r.status === 200 && r.body.ok === true, 'GET /api/health returns 200');
  }
  {
    const r = await get('/api/status');
    assert(r.body.status.connected === true, 'GET /api/status shows panel connected');
    assert(typeof r.body.status.ae === 'string', '/api/status has ae version');
  }
  {
    const r = await get('/api/commands');
    assert(Array.isArray(r.body.commands), 'GET /api/commands returns array');
    const names = r.body.commands.map((c) => c.name);
    assert(names.includes('ping'), 'commands include ping');
    assert(names.includes('createComp'), 'commands include createComp');
    assert(names.includes('runJSX'), 'commands include runJSX (dev mode on)');
  }

  // --- Command round-trips ---
  console.log('\n── Command Round-trips ──');

  // ping
  {
    const r = await post('/command', { command: 'ping' });
    assert(r.body.ok === true, 'ping: ok');
    assert(r.body.result.pong === true, 'ping: pong is true');
    assert(typeof r.body.result.ae === 'string', 'ping: ae version present');
  }

  // getProjectInfo
  {
    const r = await post('/command', { command: 'getProjectInfo' });
    assert(r.body.ok === true, 'getProjectInfo: ok');
    assert(r.body.result.name === 'Untitled', 'getProjectInfo: name is Untitled');
    assertEqual(r.body.result.numItems, 0, 'getProjectInfo: numItems is 0');
  }

  // listComps (empty)
  {
    const r = await post('/command', { command: 'listComps' });
    assert(r.body.ok === true, 'listComps (empty): ok');
    assert(Array.isArray(r.body.result) && r.body.result.length === 0, 'listComps: empty array');
  }

  // createComp
  let compId;
  {
    const r = await post('/command', {
      command: 'createComp',
      params: { name: 'E2E Test', width: 1920, height: 1080, duration: 5, frameRate: 24 },
    });
    assert(r.body.ok === true, 'createComp: ok');
    assert(r.body.result.name === 'E2E Test', 'createComp: name matches');
    assert(typeof r.body.result.compId === 'number', 'createComp: compId is number');
    compId = r.body.result.compId;
  }

  // listComps (after create)
  {
    const r = await post('/command', { command: 'listComps' });
    assert(r.body.result.length === 1, 'listComps: 1 comp after create');
    assertEqual(r.body.result[0].name, 'E2E Test', 'listComps: comp name');
    assertEqual(r.body.result[0].width, 1920, 'listComps: comp width');
  }

  // addSolid
  {
    const r = await post('/command', {
      command: 'addSolid',
      params: { compId, name: 'BG', color: [1, 0, 0] },
    });
    assert(r.body.ok === true, 'addSolid: ok');
    assert(typeof r.body.result.layerIndex === 'number', 'addSolid: layerIndex');
  }

  // addTextLayer
  {
    const r = await post('/command', {
      command: 'addTextLayer',
      params: { compId, text: 'Hello E2E', fontSize: 72 },
    });
    assert(r.body.ok === true, 'addTextLayer: ok');
    assert(typeof r.body.result.layerIndex === 'number', 'addTextLayer: layerIndex');
  }

  // setLayerProperty
  {
    const r = await post('/command', {
      command: 'setLayerProperty',
      params: { compId, layerIndex: 1, property: 'opacity', value: 50 },
    });
    assert(r.body.ok === true, 'setLayerProperty: ok');
  }

  // render — non-blocking: responds immediately, then streams events.
  let renderJobId;
  {
    const r = await post('/command', {
      command: 'render',
      params: { compId, outputPath: RENDER_OUT },
    });
    assert(r.body.ok === true, 'render: responds ok immediately');
    assert(typeof r.body.result.jobId === 'string', 'render: jobId returned');
    assert(r.body.result.status === 'rendering', 'render: status is rendering (non-blocking)');
    renderJobId = r.body.result.jobId;
  }

  // render events: progress + completion must arrive over the /agent socket.
  {
    const progress = await waitForEvent(
      (e) => e.event === 'progress' && e.data.jobId === renderJobId,
    );
    assert(progress !== null, 'render: at least one progress event received');
    const done = await waitForEvent(
      (e) => e.event === 'renderComplete' && e.data.jobId === renderJobId,
    );
    assert(done !== null, 'render: renderComplete event received');
    assert(done && done.data.ok === true, 'render: renderComplete ok=true');
    assert(existsSync(RENDER_OUT), 'render: output file written to disk');
  }

  // runJSX (dev)
  {
    const r = await post('/command', {
      command: 'runJSX',
      params: { script: '2 + 2' },
    });
    assert(r.body.ok === true, 'runJSX: ok');
    assertEqual(r.body.result.value, 4, 'runJSX: 2+2=4');
  }

  // --- Validation error tests ---
  console.log('\n── Validation Errors ──');

  {
    const r = await post('/command', { command: 'createComp', params: {} });
    assert(r.body.ok === false, 'createComp without name: fails');
    assert(r.body.code === 'INVALID', 'createComp without name: code is INVALID');
  }

  {
    const r = await post('/command', { command: 'nonexistent' });
    assert(r.body.ok === false, 'unknown command: fails');
  }

  {
    const r = await post('/command', {});
    assert(r.status === 400, 'missing command field: 400');
  }

  // --- Summary ---
  console.log('\n═══════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\n  Failures:');
    failures.forEach((f) => console.log(`    ✗ ${f}`));
  }
  console.log('═══════════════════════════════════════════\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
try {
  await runTests();
} catch (e) {
  console.error('\n[e2e] Fatal error:', e.message);
  failed++;
} finally {
  cleanup();
  process.exit(failed > 0 ? 1 : 0);
}
