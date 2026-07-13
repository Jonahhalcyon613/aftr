// demo-fire.js — "a fiery title card", orchestrated.
//
// Segment 0 spec asks for a FIRE treatment + an animated TITLE (the flaming
// title — fire behind, title in front). Segment 1's title is intentionally
// broken (opacity 0) so the visual reviewer sees a blank render and the loop
// self-corrects it. Then both passing clips are concatenated.
//
// Run: node controller/src/orchestrator/demo-fire.js  (controller + AE up)

import { resolve } from 'node:path';
import { AgentClient } from './agentClient.js';
import { runPipeline } from './engine.js';
import { brightnessReviewer, claudeReviewer } from './reviewers.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORK = resolve(ROOT, 'rendersave', 'fiery_title');
const PROJECT = resolve(WORK, 'fiery_title.aep');

const manifest = {
  fps: 30,
  segments: [
    { id: 0, start: 0, end: 3, start_frame: 0, end_frame: 90 },
    { id: 1, start: 3, end: 6, start_frame: 90, end_frame: 180 },
  ],
};

const specs = {
  0: {
    segment_id: 0,
    intent: 'A flaming title: realistic fire with the animated title "ON FIRE" in front',
    treatments: [
      { type: 'fire', name: 'fire', center: [540, 660], size: 1.05 },
      { type: 'title', name: 'title', text: 'ON FIRE', fontSize: 150, fillColor: [1, 0.95, 0.8], justification: 2, position: [540, 300], animator: 'blurFade' },
    ],
  },
  1: {
    segment_id: 1,
    intent: 'Title "AUTO FIXED" visible',
    treatments: [
      // BROKEN: opacity 0 -> renders blank -> reviewer forces a fix
      { type: 'title', name: 'title', text: 'AUTO FIXED', fontSize: 140, fillColor: [0.5, 1, 0.8], justification: 2, position: [540, 540], set: { opacity: 0 } },
    ],
  },
};

function log(msg, inline) { if (inline) process.stdout.write(`\r${msg}            `); else console.log(msg); }

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Orchestrator — "a fiery title card" (self-correcting)');
  console.log('═══════════════════════════════════════════════════');
  const agent = new AgentClient();
  await agent.connect();
  const ping = await agent.sendCommand('ping');
  if (!ping.ok) { console.error('bridge not connected:', ping.error); process.exit(1); }
  console.log(`  bridge connected — AE ${ping.result.ae}`);
  const reviewer = process.env.ANTHROPIC_API_KEY ? claudeReviewer() : brightnessReviewer({ minYmax: 150 });
  console.log(`  reviewer: ${process.env.ANTHROPIC_API_KEY ? 'claude-VL' : 'visual brightness (ffmpeg)'}\n`);

  const t0 = Date.now();
  const result = await runPipeline({
    agent, manifest, specs, reviewer,
    comp: { name: 'FieryTitle', width: 1080, height: 1080 },
    background: [0, 0, 0],
    maxIterations: 3, workDir: WORK, projectPath: PROJECT, log,
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  RESULT');
  for (const s of result.segments) {
    console.log(`  segment ${s.segmentId}: ${s.passed ? 'PASSED' : 'not passed'} after ${s.iterations} iteration(s)`);
  }
  console.log(`  final video: ${result.finalVideo || '(none)'}`);
  console.log(`  total time:  ${secs}s`);
  console.log('═══════════════════════════════════════════════════\n');
  agent.close();
  process.exit(0);
}

main().catch((e) => { console.error('orchestrator error:', e); process.exit(1); });
