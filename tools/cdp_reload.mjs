// Force the CEP panel webview to reload from disk (busts the cache).
import WebSocket from 'ws';
const WS_URL = process.argv[2];
const ws = new WebSocket(WS_URL);
let step = 0;
ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'Page.enable' })));
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    ws.send(JSON.stringify({ id: 2, method: 'Page.reload', params: { ignoreCache: true } }));
  } else if (msg.id === 2) {
    console.log('reload requested');
    ws.close(); process.exit(0);
  }
});
ws.on('error', (e) => { console.log('WS error:', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout'); process.exit(1); }, 10000);
