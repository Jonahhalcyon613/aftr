// Run an arbitrary ExtendScript snippet in the panel's CEP context via CDP.
// Usage: node tools/cdp_eval.mjs <wsUrl> <jsxFilePath>
import WebSocket from 'ws';
import { readFileSync } from 'node:fs';

const WS_URL = process.argv[2];
const jsx = readFileSync(process.argv[3], 'utf8');

const expression = `
new Promise(function(resolve){
  try { new CSInterface().evalScript(${JSON.stringify(jsx)}, function(r){ resolve(String(r)); }); }
  catch(e){ resolve("FATAL:"+e.toString()); }
})`;

const ws = new WebSocket(WS_URL);
ws.on('open', () => ws.send(JSON.stringify({
  id: 1, method: 'Runtime.evaluate',
  params: { expression, awaitPromise: true, returnByValue: true },
})));
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    console.log(msg.result?.result?.value ?? ('RAW: ' + JSON.stringify(msg.result || msg.error)));
    ws.close(); process.exit(0);
  }
});
ws.on('error', (e) => { console.log('WS error:', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout'); process.exit(1); }, 15000);
