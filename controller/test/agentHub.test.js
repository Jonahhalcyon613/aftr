// agentHub.test.js — regression coverage for the agent/UI relay.
// Notably: a command reply must carry the AGENT'S correlation id, not the
// aeClient's internal request id (regression: the result spread used to
// override the id, breaking every agent client's correlation).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AeClient } from '../src/aeClient.js';
import { AgentHub } from '../src/agentHub.js';

class MockWS extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.sent = []; }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
}

function tick() { return new Promise((r) => setImmediate(r)); }

describe('AgentHub', () => {
  it('reply preserves the agent\'s correlation id (not aeClient\'s)', async () => {
    const aeClient = new AeClient({ commandTimeoutMs: 1000 });
    const hub = new AgentHub(aeClient, {});
    const panel = new MockWS();
    aeClient.attach(panel);
    const agent = new MockWS();
    hub.add(agent);

    // agent issues a command with its own id
    agent.emit('message', Buffer.from(JSON.stringify({
      id: 'agent-xyz', type: 'command', command: 'ping', params: {},
    })));
    await tick();

    // the panel got the request (with aeClient's internal id)
    const req = panel.sent.find((m) => m.type === 'command');
    assert.ok(req, 'panel should receive the forwarded command');
    assert.notEqual(req.id, 'agent-xyz', 'aeClient uses its own internal id on the wire');

    // panel responds using aeClient's id
    panel.emit('message', Buffer.from(JSON.stringify({
      id: req.id, type: 'result', ok: true, result: { pong: true, ae: '26.3' },
    })));
    await tick();

    // the agent's reply must carry the AGENT'S id
    const reply = agent.sent.find((m) => m.type === 'result');
    assert.ok(reply, 'agent should receive a result');
    assert.equal(reply.id, 'agent-xyz', 'reply id must match what the agent sent');
    assert.equal(reply.ok, true);
    assert.equal(reply.result.pong, true);
  });

  it('relays panel events to connected agents', async () => {
    const aeClient = new AeClient({});
    const hub = new AgentHub(aeClient, {});
    const panel = new MockWS();
    aeClient.attach(panel);
    const agent = new MockWS();
    hub.add(agent);

    panel.emit('message', Buffer.from(JSON.stringify({
      type: 'event', event: 'progress', data: { jobId: 'r1', percent: 42 },
    })));
    await tick();

    const ev = agent.sent.find((m) => m.type === 'event' && m.event === 'progress');
    assert.ok(ev, 'agent should receive broadcast events');
    assert.equal(ev.data.percent, 42);
  });
});
