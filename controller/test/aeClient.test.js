// aeClient.test.js — tests for the AeClient class.
// Tests sendCommand, timeout, disconnect, and replace semantics using
// a mock WebSocket object.

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { AeClient } from '../src/aeClient.js';

// Minimal mock WebSocket that behaves like a ws.WebSocket.
class MockWS extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1; // OPEN
    this.sent = [];
    this._closed = false;
  }
  send(data) { this.sent.push(JSON.parse(data)); }
  close(code, reason) {
    this._closed = true;
    this.readyState = 3; // CLOSED
  }
}

describe('AeClient', () => {
  let client;
  let ws;

  beforeEach(() => {
    client = new AeClient({ commandTimeoutMs: 200, allowDev: true });
    ws = new MockWS();
  });

  describe('attach', () => {
    it('sets connected status', () => {
      client.attach(ws);
      assert.equal(client.isConnected(), true);
      assert.equal(client.status.connected, true);
    });

    it('replaces old panel and fails its pending commands', async () => {
      const ws1 = new MockWS();
      client.attach(ws1);
      const p1 = client.sendCommand('ping', {});
      const ws2 = new MockWS();
      client.attach(ws2);

      const r1 = await p1;
      assert.equal(r1.ok, false);
      assert.equal(r1.code, 'REPLACED');
      assert.ok(ws1._closed);
    });
  });

  describe('sendCommand', () => {
    it('rejects unknown commands before sending', async () => {
      client.attach(ws);
      const r = await client.sendCommand('nonexistent', {});
      assert.equal(r.ok, false);
      assert.equal(r.code, 'INVALID');
      assert.equal(ws.sent.length, 0);
    });

    it('returns NO_PANEL when no panel connected', async () => {
      const r = await client.sendCommand('ping', {});
      assert.equal(r.ok, false);
      assert.equal(r.code, 'NO_PANEL');
    });

    it('sends command and resolves on result', async () => {
      client.attach(ws);
      const p = client.sendCommand('ping', {});

      // Simulate result from panel.
      assert.equal(ws.sent.length, 1);
      const req = ws.sent[0];
      const resultEnvelope = JSON.stringify({
        id: req.id,
        type: 'result',
        ok: true,
        result: { pong: true, ae: '25.0' },
      });
      ws.emit('message', Buffer.from(resultEnvelope));

      const r = await p;
      assert.equal(r.ok, true);
      assert.equal(r.result.pong, true);
    });

    it('resolves with error on AE-side failure', async () => {
      client.attach(ws);
      const p = client.sendCommand('ping', {});

      const req = ws.sent[0];
      ws.emit('message', Buffer.from(JSON.stringify({
        id: req.id, type: 'result', ok: false, error: 'Something went wrong',
      })));

      const r = await p;
      assert.equal(r.ok, false);
      assert.equal(r.error, 'Something went wrong');
    });

    it('times out pending commands', async () => {
      client.attach(ws);
      // Need to keep the timer ref'd so the test doesn't exit early.
      // We'll await the promise directly — the timeout is 200ms.
      const keepAlive = setTimeout(() => {}, 500);
      try {
        const r = await client.sendCommand('ping', {});
        assert.equal(r.ok, false);
        assert.equal(r.code, 'TIMEOUT');
      } finally {
        clearTimeout(keepAlive);
      }
    });
  });

  describe('disconnect', () => {
    it('fails all pending commands on disconnect', async () => {
      client.attach(ws);
      const p1 = client.sendCommand('ping', {});
      const p2 = client.sendCommand('getProjectInfo', {});

      // Simulate disconnect.
      ws.emit('close', 1000, '');

      const r1 = await p1;
      const r2 = await p2;
      assert.equal(r1.ok, false);
      assert.equal(r1.code, 'DISCONNECTED');
      assert.equal(r2.ok, false);
      assert.equal(r2.code, 'DISCONNECTED');
      assert.equal(client.isConnected(), false);
    });
  });

  describe('events', () => {
    it('emits status on attach', async () => {
      const statusPromise = new Promise((resolve) => {
        client.on('status', resolve);
      });
      client.attach(ws);
      const status = await statusPromise;
      assert.equal(status.connected, true);
    });

    it('captures ready event data', () => {
      client.attach(ws);
      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'event', event: 'ready', data: { ae: '25.0', project: 'Test.aep' },
      })));
      assert.equal(client.status.ae, '25.0');
      assert.equal(client.status.project, 'Test.aep');
    });

    it('emits events for forwarding', async () => {
      client.attach(ws);
      const eventPromise = new Promise((resolve) => {
        client.on('event', resolve);
      });
      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'event', event: 'log', data: { level: 'info', message: 'test' },
      })));
      const env = await eventPromise;
      assert.equal(env.event, 'log');
    });
  });
});
