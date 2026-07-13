// demo-showcase.js — a parallel-rendered VFX showreel.
// 4 segments, each a different VFX preset + text style, all declared as specs,
// realized by the bridge, and rendered CONCURRENTLY, then concatenated.
//
// Run: node controller/src/orchestrator/demo-showcase.js
import { resolve } from 'node:path';
import { AgentClient } from './agentClient.js';
import { runPipelineParallel } from './engine.js';
import { brightnessReviewer } from './reviewers.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORK = resolve(ROOT, 'rendersave', 'showreel');
const PROJECT = resolve(WORK, 'showreel.aep');

const manifest = {
  fps: 30,
  segments: [
    { id: 0, start: 0.0, end: 2.5, start_frame: 0, end_frame: 75 },
    { id: 1, start: 2.5, end: 5.0, start_frame: 75, end_frame: 150 },
    { id: 2, start: 5.0, end: 7.5, start_frame: 150, end_frame: 225 },
    { id: 3, start: 7.5, end: 10.0, start_frame: 225, end_frame: 300 },
  ],
};

const specs = {
  0: { segment_id: 0, intent: 'fire title INFERNO', treatments: [
    { type: 'fire', name: 'fire', center: [960, 660], size: 0.95 },
    { type: 'title', name: 'title', text: 'INFERNO', fontSize: 180, fillColor: [1, 0.9, 0.7], justification: 2, position: [960, 300], animator: 'blurFade' },
  ] },
  1: { segment_id: 1, intent: 'smoke title MYSTERY', treatments: [
    { type: 'smoke', name: 'smoke', center: [960, 560], size: 1.1, color: [0.6, 0.65, 0.78] },
    { type: 'title', name: 'title', text: 'MYSTERY', fontSize: 165, fillColor: [0.85, 0.92, 1], justification: 2, position: [960, 540], animator: 'charScale' },
  ] },
  2: { segment_id: 2, intent: 'glitch title GLITCH', treatments: [
    { type: 'title', name: 'title', text: 'GLITCH', fontSize: 210, fillColor: [0.2, 1, 0.7], justification: 2, position: [960, 540], animator: 'bunchRotate', glitch: { amount: 50, shake: 18 } },
  ] },
  3: { segment_id: 3, intent: 'neon title NEON', treatments: [
    { type: 'title', name: 'title', text: 'NEON', fontSize: 230, fillColor: [1, 0.3, 0.85], justification: 2, position: [960, 540], animator: 'wordReveal', neon: { radius: 28 } },
  ] },
};

function log(msg) { console.log(msg); }

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  VFX SHOWREEL — parallel render (fire/smoke/glitch/neon)');
  console.log('═══════════════════════════════════════════════════');
  const agent = new AgentClient();
  await agent.connect();
  const ping = await agent.sendCommand('ping');
  if (!ping.ok) { console.error('bridge not connected:', ping.error); process.exit(1); }
  console.log(`  bridge connected — AE ${ping.result.ae}\n`);

  const t0 = Date.now();
  const result = await runPipelineParallel({
    agent, manifest, specs, reviewer: brightnessReviewer({ minYmax: 140 }),
    comp: { name: 'Showreel', width: 1920, height: 1080 },
    maxIterations: 2, concurrency: 2, workDir: WORK, projectPath: PROJECT, log,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n═══════════════════════════════════════════════════');
  for (const s of result.segments) console.log(`  segment ${s.segmentId}: ${s.passed ? 'PASSED' : 'kept'} (${s.iterations} round[s])`);
  console.log(`  final video: ${result.finalVideo || '(none)'}`);
  console.log(`  total time:  ${secs}s`);
  console.log('═══════════════════════════════════════════════════\n');
  agent.close();
  process.exit(0);
}
main().catch((e) => { console.error('showreel error:', e); process.exit(1); });
