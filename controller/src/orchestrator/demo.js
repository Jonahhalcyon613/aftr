// demo.js — a concrete HLD orchestrator run.
//
// Two segments in one comp. Segment 1's spec is intentionally BROKEN (title
// opacity 0), so the visual reviewer sees a blank render, emits a structured
// delta (opacity -> 100), and the loop re-renders until it passes. Segment 0 is
// correct and passes on the first iteration. Finally the passing clips are
// concatenated into one video.
//
// Run: node controller/src/orchestrator/demo.js   (controller + AE panel must be up)

import { resolve } from 'node:path';
import { AgentClient } from './agentClient.js';
import { runPipeline } from './engine.js';
import { brightnessReviewer, claudeReviewer } from './reviewers.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORK = resolve(ROOT, 'rendersave', 'orchestrated');
const PROJECT = resolve(WORK, 'orchestrated.aep');

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
    intent: 'White title "SEGMENT ONE" centered and visible',
    treatments: [
      { type: 'title', name: 'title', text: 'SEGMENT ONE', fontSize: 140, fillColor: [1, 1, 1], position: [480, 540],
        keyframes: { opacity: [{ t: 0, v: 0 }, { t: 0.5, v: 100 }] } },
    ],
  },
  1: {
    segment_id: 1,
    intent: 'Green title "SEGMENT TWO" centered and visible',
    treatments: [
      // BROKEN ON PURPOSE: opacity pinned to 0 -> renders blank.
      { type: 'title', name: 'title', text: 'SEGMENT TWO', fontSize: 140, fillColor: [0.4, 1, 0.7], position: [480, 540],
        set: { opacity: 0 } },
    ],
  },
};

function log(msg, inline) {
  if (inline) process.stdout.write(`\r${msg}            `);
  else console.log(msg);
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  HLD Orchestrator — autonomous segment loop');
  console.log('═══════════════════════════════════════════════════');

  const agent = new AgentClient();
  await agent.connect();
  // confirm AE is reachable through the bridge
  const ping = await agent.sendCommand('ping');
  if (!ping.ok) { console.error('AE bridge not connected:', ping.error); process.exit(1); }
  console.log(`  bridge connected — AE ${ping.result.ae}\n`);

  const reviewer = process.env.ANTHROPIC_API_KEY ? claudeReviewer() : brightnessReviewer({ minYmax: 150 });
  console.log(`  reviewer: ${process.env.ANTHROPIC_API_KEY ? 'claude-VL' : 'visual brightness (ffmpeg)'}\n`);

  const t0 = Date.now();
  const result = await runPipeline({
    agent, manifest, specs, reviewer,
    comp: { name: 'Orchestrated', width: 1920, height: 1080 },
    maxIterations: 3,
    workDir: WORK,
    projectPath: PROJECT,
    log,
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
