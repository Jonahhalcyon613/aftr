// render.js — simulated render for the headless simulator.
//
// Mirrors the real panel's render handler (panel/src/render.js): respond to the
// command immediately with { jobId, status:'rendering' }, stream `progress`
// events, write a real placeholder file at outputPath, then emit a
// `renderComplete` event. This validates M5's event plumbing without AE/aerender.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let _seq = 0;

/**
 * @param {object} env - the incoming command envelope { id, command, params }
 * @param {object} runner - the jsxRunner (for __prepareRender)
 * @param {(obj:object)=>void} sendEnvelope
 * @param {(event:string,data:object)=>void} sendEvent
 * @param {(level:string,msg:string)=>void} log
 */
export function simulateRender(env, runner, sendEnvelope, sendEvent, log) {
  const prep = runner.dispatch('__prepareRender', env.params || {});
  if (!prep.ok) {
    sendEnvelope({ id: env.id, type: 'result', ok: false, error: prep.error });
    return;
  }
  const info = prep.result;
  const jobId = 'render_' + info.compId + '_' + Date.now() + '_' + ++_seq;

  // Respond immediately — render is non-blocking by contract.
  sendEnvelope({
    id: env.id,
    type: 'result',
    ok: true,
    result: { jobId, status: 'rendering', outputPath: info.outputPath },
  });
  log('info', `render ${jobId} → ${info.outputPath} (simulated)`);

  const total = info.totalFrames || 100;
  let pct = 0;
  const timer = setInterval(() => {
    pct += 25;
    const capped = Math.min(pct, 100);
    sendEvent('progress', {
      jobId,
      percent: capped,
      message: `frame ${Math.round((total * capped) / 100)}/${total}`,
    });
    if (capped >= 100) {
      clearInterval(timer);
      let ok = true;
      let error = null;
      try {
        mkdirSync(dirname(info.outputPath), { recursive: true });
        writeFileSync(
          info.outputPath,
          `aftr simulated render\njob: ${jobId}\ncomp: ${info.compName}\nframes: ${total}\n`,
        );
      } catch (e) {
        ok = false;
        error = e.message;
      }
      sendEvent('renderComplete', {
        jobId,
        ok,
        outputPath: info.outputPath,
        error,
      });
      log('info', `render ${jobId} complete (ok=${ok})`);
    }
  }, 40);
  if (typeof timer.unref === 'function') timer.unref();
}
