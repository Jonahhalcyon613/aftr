// engine.js — the HLD orchestrator loop.
//
// runPipeline(): build a comp, then for each segment run the loop
//   applySpec -> save -> scoped aerender -> visual review -> structured delta
// until the reviewer passes (or maxIterations). Finally concat the passing
// segment clips into one video. The orchestrator only ever reads/writes JSON
// spec + renders; it never touches pixels directly.

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Locate aerender cross-platform (env override wins). macOS: aerender sits at
// the app root; Windows: next to AfterFX.exe in "Support Files".
function findAerender() {
  if (process.env.AE_BRIDGE_AERENDER) return process.env.AE_BRIDGE_AERENDER;
  const cands = [];
  if (process.platform === 'darwin') {
    try {
      for (const d of readdirSync('/Applications')) {
        if (/^Adobe After Effects/i.test(d)) cands.push(`/Applications/${d}/aerender`);
      }
    } catch { /* ignore */ }
    cands.sort().reverse(); // newest year first
    cands.push('aerender');
  } else {
    for (const base of ['C:/Program Files/Adobe', 'D:/Adobe', 'D:/Program Files/Adobe', 'C:/Adobe', 'E:/Adobe']) {
      try {
        for (const d of readdirSync(base)) {
          if (/After Effects/i.test(d)) cands.push(`${base}/${d}/Support Files/aerender.exe`);
        }
      } catch { /* ignore */ }
    }
    cands.sort().reverse();
    cands.push('aerender.exe');
  }
  for (const c of cands) if (c.indexOf('/') < 0 || existsSync(c)) return c;
  return cands[cands.length - 1];
}
const DEFAULT_AERENDER = findAerender();

function sh(cmd, args, onLine) {
  return new Promise((res) => {
    const p = spawn(cmd, args);
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; if (onLine) onLine(String(d)); });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => res({ code, out, err }));
    p.on('error', (e) => res({ code: -1, out, err: String(e) }));
  });
}

// Deep-merge a structured delta into a spec (match treatments by name).
export function applyDelta(spec, delta) {
  const next = JSON.parse(JSON.stringify(spec));
  if (!delta || !delta.treatments) return next;
  for (const dt of delta.treatments) {
    let t = next.treatments.find((x) => x.name === dt.name);
    if (!t) { next.treatments.push(JSON.parse(JSON.stringify(dt))); continue; }
    for (const k of Object.keys(dt)) {
      if (k === 'name') continue;
      if (dt[k] && typeof dt[k] === 'object' && !Array.isArray(dt[k])) {
        t[k] = Object.assign({}, t[k], dt[k]);
      } else {
        t[k] = dt[k];
      }
    }
  }
  return next;
}

async function renderScoped({ aerender, projectPath, comp, output, startFrame, endFrame, omTemplate, log }) {
  const args = ['-project', projectPath, '-comp', comp, '-output', output,
    '-s', String(startFrame), '-e', String(endFrame)];
  if (omTemplate) args.push('-OMtemplate', omTemplate);
  const r = await sh(aerender, args, (line) => {
    const m = /\((\d+)\)/.exec(line);
    if (m && log) log(`    render frame ${m[1]}`, true);
  });
  return { ok: existsSync(output), code: r.code, log: r.err + r.out };
}

async function extractFrame(video, clipFrame, outPng) {
  const r = await sh('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', video,
    '-vf', `select=eq(n\\,${clipFrame})`, '-frames:v', '1', outPng]);
  return { ok: existsSync(outPng), code: r.code };
}

async function concat(clips, listPath, output) {
  writeFileSync(listPath, clips.map((c) => `file '${c.replace(/\\/g, '/')}'`).join('\n'));
  const r = await sh('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', output]);
  return { ok: existsSync(output), code: r.code };
}

// Run fn over items with bounded concurrency.
async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

// Parallel pipeline: build all segments (fast sequential edits), save once, then
// render the pending segments CONCURRENTLY each round; revise + re-render only
// the failing ones. Renders are the slow part, so parallelizing them is the win.
export async function runPipelineParallel(opts) {
  const {
    agent, manifest, specs, reviewer,
    comp = { name: 'Showreel', width: 1920, height: 1080 },
    background = [0, 0, 0],
    // NOTE: aerender already multi-frame-renders across all cores, so high
    // concurrency oversubscribes a single machine. 2 is a safe default; raise it
    // only across multiple machines or for short/startup-bound renders.
    maxIterations = 3, concurrency = 2,
    workDir, projectPath,
    omTemplate = 'H.264 - Match Render Settings - 15 Mbps',
    aerender = DEFAULT_AERENDER,
    log = () => {},
  } = opts;

  mkdirSync(workDir, { recursive: true });
  const fps = manifest.fps;
  const totalDuration = Math.max(...manifest.segments.map((s) => s.end));

  log(`[setup] comp "${comp.name}" (${totalDuration}s @ ${fps}fps), concurrency=${concurrency}`);
  const compId = (await agent.must('createComp', {
    name: comp.name, width: comp.width, height: comp.height, duration: totalDuration, frameRate: fps,
  })).compId;
  await agent.must('addSolid', { compId, name: 'bg', color: background });
  await agent.must('setCompSettings', { compId, motionBlur: true });

  const state = manifest.segments.map((seg) => ({
    seg, spec: JSON.parse(JSON.stringify(specs[seg.id])), passed: false, iters: [], finalClip: null, lastClip: null,
  }));

  for (let round = 1; round <= maxIterations; round++) {
    const pending = state.filter((s) => !s.passed);
    if (!pending.length) break;
    log(`\n[round ${round}] realize + render ${pending.length} segment(s) in parallel`);

    // edits are fast — do them sequentially, then one save
    for (const st of pending) {
      await agent.must('applySpec', { compId, segmentId: st.seg.id, spec: st.spec, segment: { start: st.seg.start, end: st.seg.end } });
    }
    await agent.must('saveProject', { path: projectPath });

    // renders are slow — run them concurrently
    const t0 = Date.now();
    await pool(pending, concurrency, async (st) => {
      const clip = resolve(workDir, `seg${st.seg.id}_r${round}.mp4`);
      const r = await renderScoped({ aerender, projectPath, comp: comp.name, output: clip, startFrame: st.seg.start_frame, endFrame: st.seg.end_frame, omTemplate });
      st.lastClip = r.ok ? clip : null;
    });
    log(`  rendered ${pending.length} segment(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s (parallel)`);

    // review
    for (const st of pending) {
      if (!st.lastClip) { st.iters.push({ error: 'render failed' }); continue; }
      const midClipFrame = Math.max(0, Math.round((st.seg.end_frame - st.seg.start_frame) / 2) - 1);
      const png = resolve(workDir, `seg${st.seg.id}_r${round}.png`);
      await extractFrame(st.lastClip, midClipFrame, png);
      const verdict = await reviewer({ segmentId: st.seg.id, intent: st.spec.intent, framePath: png, spec: st.spec, iteration: round });
      st.iters.push({ verdict });
      log(`  seg ${st.seg.id}: ${verdict.pass ? 'PASS' : 'REVISE'} — ${verdict.reason}`);
      if (verdict.pass) { st.passed = true; st.finalClip = st.lastClip; }
      else if (verdict.delta) { st.spec = applyDelta(st.spec, verdict.delta); }
      else { st.finalClip = st.lastClip; }
    }
  }

  for (const st of state) if (!st.finalClip && st.lastClip) st.finalClip = st.lastClip;
  const clips = state.map((s) => s.finalClip).filter(Boolean);
  const finalOut = resolve(workDir, 'final.mp4');
  let finalOk = false;
  if (clips.length) {
    log(`\n[assemble] concatenating ${clips.length} clips -> final.mp4`);
    finalOk = (await concat(clips, resolve(workDir, 'concat.txt'), finalOut)).ok;
  }
  return {
    compId,
    segments: state.map((s) => ({ segmentId: s.seg.id, passed: s.passed, iterations: s.iters.length, finalClip: s.finalClip })),
    finalVideo: finalOk ? finalOut : null,
  };
}

export async function runPipeline(opts) {
  const {
    agent, manifest, specs, reviewer,
    comp = { name: 'Orchestrated', width: 1920, height: 1080 },
    background = [0.06, 0.06, 0.1],
    maxIterations = 3,
    workDir, projectPath,
    omTemplate = 'H.264 - Match Render Settings - 15 Mbps',
    aerender = DEFAULT_AERENDER,
    log = () => {},
    onSegment = () => {},
  } = opts;

  mkdirSync(workDir, { recursive: true });
  const fps = manifest.fps;
  const totalDuration = Math.max(...manifest.segments.map((s) => s.end));

  // 1. Setup: one comp + a persistent background (survives seg{id}_ wipes).
  log(`[setup] creating comp "${comp.name}" (${totalDuration}s @ ${fps}fps)`);
  const created = await agent.must('createComp', {
    name: comp.name, width: comp.width, height: comp.height, duration: totalDuration, frameRate: fps,
  });
  const compId = created.compId;
  await agent.must('addSolid', { compId, name: 'bg', color: background });
  await agent.must('setCompSettings', { compId, motionBlur: true });

  const segmentResults = [];

  // 2. Per-segment review->adjust loop.
  for (const seg of manifest.segments) {
    log(`\n[segment ${seg.id}] frames ${seg.start_frame}-${seg.end_frame} (${seg.start}s-${seg.end}s)`);
    let spec = JSON.parse(JSON.stringify(specs[seg.id]));
    const iterations = [];
    let finalClip = null;

    for (let iter = 1; iter <= maxIterations; iter++) {
      log(`  [iter ${iter}] applySpec -> render -> review`);
      // realize
      const applied = await agent.must('applySpec', {
        compId, segmentId: seg.id, spec, segment: { start: seg.start, end: seg.end },
      });
      // persist so aerender sees it
      await agent.must('saveProject', { path: projectPath });
      // scoped render
      const clip = resolve(workDir, `seg${seg.id}_v${iter}.mp4`);
      const r = await renderScoped({
        aerender, projectPath, comp: comp.name, output: clip,
        startFrame: seg.start_frame, endFrame: seg.end_frame, omTemplate, log,
      });
      if (!r.ok) { log(`    render FAILED (code ${r.code})`); iterations.push({ iter, error: 'render failed' }); break; }
      // review on the segment's mid frame
      const midClipFrame = Math.max(0, Math.round((seg.end_frame - seg.start_frame) / 2) - 1);
      const framePng = resolve(workDir, `seg${seg.id}_v${iter}.png`);
      await extractFrame(clip, midClipFrame, framePng);
      const verdict = await reviewer({
        segmentId: seg.id, intent: spec.intent, framePath: framePng, spec, iteration: iter,
      });
      log(`    review: ${verdict.pass ? 'PASS' : 'REVISE'} — ${verdict.reason}`);
      iterations.push({ iter, clip, framePng, verdict, layers: applied.built });
      onSegment({ segmentId: seg.id, iter, verdict, clip });

      if (verdict.pass) { finalClip = clip; break; }
      if (verdict.delta) { spec = applyDelta(spec, verdict.delta); log(`    applied delta -> re-render`); }
      if (iter === maxIterations) finalClip = clip; // give up gracefully, keep last
    }

    segmentResults.push({ segmentId: seg.id, finalClip, iterations, finalSpec: spec });
  }

  // 3. Final assembly: concat passing clips.
  const clips = segmentResults.map((s) => s.finalClip).filter(Boolean);
  const finalOut = resolve(workDir, 'final.mp4');
  let finalOk = false;
  if (clips.length) {
    log(`\n[assemble] concatenating ${clips.length} segment clips -> final.mp4`);
    const c = await concat(clips, resolve(workDir, 'concat.txt'), finalOut);
    finalOk = c.ok;
  }

  return {
    compId,
    segments: segmentResults.map((s) => ({
      segmentId: s.segmentId,
      iterations: s.iterations.length,
      passed: s.iterations.some((i) => i.verdict && i.verdict.pass),
      finalClip: s.finalClip,
    })),
    finalVideo: finalOk ? finalOut : null,
  };
}
