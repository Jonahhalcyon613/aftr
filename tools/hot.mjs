// hot.mjs — SIGNATURE-SAFE dev hot-reload. Rebuilds the JSX bundle and evals its
// CONTENT directly into the live panel via the CEF DevTools protocol. It does
// NOT modify the deployed (signed) bundle on disk, so the extension's signature
// stays valid and an AE restart won't reject it. Run `npm run deploy:panel` to
// PERSIST changes (re-sign). Usage: node tools/hot.mjs
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import http from 'node:http';
import WebSocket from 'ws';

const ROOT = resolve(import.meta.dirname, '..');
const DEBUG_PORT = 39729;

function getTargets() {
  return new Promise((res, rej) => {
    http.get(`http://localhost:${DEBUG_PORT}/json`, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

execSync('node panel/build/bundle-jsx.js', { cwd: ROOT, stdio: 'inherit' });
const bundle = readFileSync(resolve(ROOT, 'panel', 'jsx', 'bundle.jsx'), 'utf8');
// Eval the bundle CONTENT, then confirm dispatch + report command count.
const jsx = bundle + '\n;(typeof dispatch === "function") ? ("OK cmds=" + (function(){var n=0;for(var k in COMMANDS){n++;}return n;})() + " " + dispatch("ping","{}")) : "NO_DISPATCH";';
const expr = `new Promise(function(resolve){ new CSInterface().evalScript(${JSON.stringify(jsx)}, function(r){ resolve(String(r)); }); })`;

let targets;
try { targets = await getTargets(); } catch { console.log('[hot] no debug port (panel open?)'); process.exit(1); }
const t = targets.find((x) => /com\.ae-bridge\.panel/.test(x.url)) || targets[0];
if (!t) { console.log('[hot] no panel target'); process.exit(1); }

const ws = new WebSocket(t.webSocketDebuggerUrl);
ws.on('open', () => ws.send(JSON.stringify({
  id: 1, method: 'Runtime.evaluate',
  params: { expression: expr, awaitPromise: true, returnByValue: true },
})));
ws.on('message', (data) => {
  const m = JSON.parse(data.toString());
  if (m.id === 1) { console.log('[hot] (in-memory, signature untouched):', m.result?.result?.value ?? JSON.stringify(m.result)); ws.close(); process.exit(0); }
});
ws.on('error', (e) => { console.log('[hot] WS error:', e.message); process.exit(1); });
setTimeout(() => process.exit(1), 15000);
