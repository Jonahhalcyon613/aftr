// examples/flaming-title.mjs
// Build a flaming title programmatically using the SDK's agent client.
// Requires: the controller running (`npm run controller`) and the AE panel connected.
//
//   node examples/flaming-title.mjs "YOUR TEXT"

import { AgentClient } from '../controller/src/orchestrator/agentClient.js';

const text = process.argv[2] || 'ON FIRE';

const ae = new AgentClient();
await ae.connect();

const ping = await ae.sendCommand('ping');
if (!ping.ok) { console.error('AE bridge not connected. Open the panel in AE.'); process.exit(1); }
console.log(`connected — AE ${ping.result.ae}`);

// 1. a square comp on black
const { compId } = await ae.must('createComp', { name: `Flaming: ${text}`, width: 1080, height: 1080, duration: 5, frameRate: 30 });
await ae.must('addSolid', { compId, name: 'bg', color: [0, 0, 0] });

// 2. realistic fire (one call)
await ae.must('fireEffect', { compId, center: [540, 660], size: 1.0 });

// 3. the title in front, revealed with the blur-fade preset
await ae.must('addTextLayer', { compId, text, fontSize: 150, fillColor: [1, 0.95, 0.8], justification: 2, position: [540, 300], name: 'title' });
await ae.must('applyTextPreset', { compId, layer: 'title', preset: 'blurFade' });

console.log(`Built a flaming "${text}" in comp ${compId}. Scrub the timeline in AE to see it.`);
ae.close();
process.exit(0);
