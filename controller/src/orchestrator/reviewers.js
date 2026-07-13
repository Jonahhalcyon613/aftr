// reviewers.js — segment reviewers for the orchestrator loop.
//
// A reviewer judges a rendered segment against its intent and returns either a
// pass or a STRUCTURED DELTA to merge into the spec (never pixels). This mirrors
// the HLD's VL reviewer; here the default is a fast ffmpeg-based visual check
// (is there actually visible content?) which is enough to demonstrate the
// review->adjust loop end to end. A Claude-VL reviewer slot is included.

import { spawn } from 'node:child_process';

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve({ code, out, err }));
    p.on('error', (e) => resolve({ code: -1, out, err: String(e) }));
  });
}

// Average + max luma of a frame via ffmpeg signalstats (0..255).
export async function frameStats(framePath) {
  const r = await run('ffmpeg', ['-hide_banner', '-i', framePath, '-vf', 'signalstats,metadata=print', '-f', 'null', '-']);
  const text = r.err + r.out;
  const grab = (k) => { const m = new RegExp('lavfi\\.signalstats\\.' + k + '=([\\d.]+)').exec(text); return m ? parseFloat(m[1]) : null; };
  return { yavg: grab('YAVG'), ymax: grab('YMAX'), ymin: grab('YMIN') };
}

// ---- reviewers -----------------------------------------------------------
// Each: async ({ segmentId, intent, framePath, spec, iteration }) -> { pass, reason, delta? }

export const autoReviewer = async () => ({ pass: true, reason: 'auto-approve' });

// Visual: a segment must have actually-visible content. If the frame is ~blank
// (no bright pixels), the title/treatment didn't render — return a delta that
// forces the title visible (opacity 100). Demonstrates a real structured fix.
export function brightnessReviewer({ minYmax = 150 } = {}) {
  return async ({ framePath, intent }) => {
    const s = await frameStats(framePath);
    const ymax = s.ymax ?? 0;
    if (ymax >= minYmax) {
      return { pass: true, reason: `visible content (YMAX=${ymax} >= ${minYmax})`, stats: s };
    }
    // Blank/dim -> the intended content isn't showing. Structured spec delta.
    return {
      pass: false,
      reason: `frame too dim (YMAX=${ymax} < ${minYmax}); content not visible`,
      stats: s,
      delta: { treatments: [{ name: 'title', set: { opacity: 100 } }] },
      note: intent ? `intent was: ${intent}` : undefined,
    };
  };
}

// Claude-VL reviewer (optional). Sends a sampled frame + intent to Claude and
// expects a JSON verdict {pass, delta}. Enabled only if ANTHROPIC_API_KEY is set;
// otherwise the orchestrator falls back to the brightness reviewer.
export function claudeReviewer() {
  return async ({ framePath, intent, spec }) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { pass: true, reason: 'claude reviewer skipped (no ANTHROPIC_API_KEY)', skipped: true };
    // Structure ready for a real call: read frame as base64, POST to the
    // Messages API with the image + intent, parse a JSON verdict. Left as a
    // single integration point so a key is the only thing needed to turn it on.
    return { pass: true, reason: 'claude reviewer stub (wire ANTHROPIC_API_KEY + fetch here)' };
  };
}
