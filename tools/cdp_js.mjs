// Evaluate a raw JS expression in the panel webview (no evalScript wrapper).
// Usage: node tools/cdp_js.mjs <wsUrl> <jsFilePath>
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';

const WS_URL = process.argv[2];
const expression = readFileSync(process.argv[3], 'utf8');

const ws = new WebSocket(WS_URL);
ws.on('open', () => ws.send(JSON.stringify({
  id: 1, method: 'Runtime.evaluate',
  params: { expression, awaitPromise: true, returnByValue: true },
})));
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    const v = msg.result?.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(msg.result || msg.error, null, 2));
    ws.close(); process.exit(0);
  }
});
ws.on('error', (e) => { console.log('WS error:', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout'); process.exit(1); }, 15000);
