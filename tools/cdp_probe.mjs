import WebSocket from 'ws';

const WS_URL = process.argv[2];
// Test File+eval (NOT $.evalFile) in the panel's CEP ExtendScript context.
// If this works, dispatch becomes global in the panel's persistent engine.
const jsx = [
  'var out=[];',
  'var path="C:/Users/arham/AppData/Roaming/Adobe/CEP/extensions/com.ae-bridge.panel/jsx/bundle.jsx";',
  'try{ out.push("engine="+$.engineName); }catch(e){ out.push("engine?"); }',
  'out.push("exists="+(new File(path).exists));',
  'try{',
  ' var f=new File(path); f.encoding="UTF-8";',
  ' var opened=f.open("r"); out.push("opened="+opened);',
  ' var c=f.read(); f.close(); out.push("len="+c.length);',
  ' eval(c);',
  ' out.push("dispatch="+(typeof dispatch));',
  ' out.push("JSON="+(typeof JSON));',
  ' try{ out.push("ping="+dispatch("ping","{}")); }catch(pe){ out.push("pingERR="+pe.toString()); }',
  '}catch(e){ out.push("EVAL_ERR="+e.toString()+"@"+(e.line||"?")); }',
  'out.join(" | ");',
].join('');

const expression = `
new Promise(function(resolve){
  try {
    new CSInterface().evalScript(${JSON.stringify(jsx)}, function(r){ resolve(r); });
  } catch(e){ resolve("FATAL:"+e.toString()); }
})`;

const ws = new WebSocket(WS_URL);
ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1, method: 'Runtime.evaluate',
    params: { expression, awaitPromise: true, returnByValue: true },
  }));
});
ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    console.log(msg.result?.result?.value ?? ('RAW: ' + JSON.stringify(msg.result || msg.error)));
    ws.close(); process.exit(0);
  }
});
ws.on('error', (e) => { console.log('WS error:', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout'); process.exit(1); }, 15000);
