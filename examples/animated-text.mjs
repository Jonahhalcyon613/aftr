// examples/animated-text.mjs
// Demonstrate the four pro text-animation presets on stacked text layers.
// Requires the controller running + the AE panel connected.
//
//   node examples/animated-text.mjs

import { AgentClient } from '../controller/src/orchestrator/agentClient.js';

const lines = [
  { text: 'word reveal', preset: 'wordReveal', color: [1, 1, 1], y: 210 },
  { text: 'character scale', preset: 'charScale', color: [1, 0.45, 0.66], y: 430 },
  { text: 'bunch and rotate', preset: 'bunchRotate', color: [0.4, 0.9, 1], y: 650 },
  { text: 'blur fade in', preset: 'blurFade', color: [1, 0.85, 0.3], y: 870 },
];

const ae = new AgentClient();
await ae.connect();
const ping = await ae.sendCommand('ping');
if (!ping.ok) { console.error('AE bridge not connected. Open the panel in AE.'); process.exit(1); }

const { compId } = await ae.must('createComp', { name: 'Text Presets', width: 1920, height: 1080, duration: 4, frameRate: 30 });
await ae.must('addSolid', { compId, name: 'bg', color: [0.06, 0.06, 0.1] });

// One batch: create every layer + apply each preset in a single round-trip / undo.
const commands = [];
for (const l of lines) {
  commands.push({ command: 'addTextLayer', params: { compId, text: l.text, fontSize: 80, fillColor: l.color, justification: 2, position: [960, l.y], name: l.text } });
  commands.push({ command: 'applyTextPreset', params: { compId, layer: l.text, preset: l.preset } });
}
const r = await ae.must('batch', { undoName: 'Text presets', commands });
console.log(`Built ${lines.length} animated text styles (${r.ok}/${r.count} ops ok) in comp ${compId}.`);
ae.close();
process.exit(0);
