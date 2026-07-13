// media.test.js — the video in/out routes: upload, list, download, auth, and the
// synchronous render flow (with a stubbed AE client that simulates aerender).
// No real AE needed, so this runs in CI.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mountMedia } from '../src/media.js';

// Stub AE client: saveProject succeeds; render writes the output file and emits
// renderComplete on the next tick, mimicking the panel's aerender behaviour.
class StubAe extends EventEmitter {
  async sendCommand(cmd, params) {
    if (cmd === 'saveProject') return { ok: true, result: {} };
    if (cmd === 'render') {
      writeFileSync(params.outputPath, 'FAKEMP4DATA');
      const jobId = 'job_1';
      setImmediate(() => this.emit('event', {
        event: 'renderComplete',
        data: { jobId, ok: true, code: 0, outputPath: params.outputPath },
      }));
      return { ok: true, result: { jobId, status: 'rendering', outputPath: params.outputPath } };
    }
    return { ok: false, error: `unexpected ${cmd}` };
  }
}

function makeServer({ token = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'aebridge-media-'));
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  mountMedia(app, { aeClient: new StubAe(), cfg: { root, token, allowDev: false } });
  const server = app.listen(0);
  const port = server.address().port;
  return { base: `http://127.0.0.1:${port}`, server, root };
}

describe('media routes (video in/out)', () => {
  let base; let server; let root;
  before(() => { ({ base, server, root } = makeServer()); });
  after(() => { server.close(); rmSync(root, { recursive: true, force: true }); });

  it('uploads raw bytes, lists, and downloads them back identically', async () => {
    const payload = Buffer.from('hello-video-bytes-' + 'x'.repeat(500));
    const up = await (await fetch(`${base}/media/upload?name=clip.mp4`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: payload,
    })).json();
    assert.equal(up.ok, true);
    assert.equal(up.bytes, payload.length);
    assert.match(up.file, /clip\.mp4$/);

    const list = await (await fetch(`${base}/media/list`)).json();
    assert.ok(list.incoming.some((f) => f.name === up.file), 'uploaded file appears in incoming');

    const back = Buffer.from(await (await fetch(base + up.url)).arrayBuffer());
    assert.equal(back.toString(), payload.toString(), 'downloaded bytes match uploaded');
  });

  it('404s an unknown file and blocks path traversal', async () => {
    const r = await fetch(`${base}/media/file/..%2F..%2Fpackage.json`);
    assert.equal(r.status, 404);
  });

  it('serves the studio page', async () => {
    const r = await fetch(`${base}/studio`);
    assert.equal(r.status, 200);
    assert.match(await r.text(), /aftr Studio/);
  });

  it('synchronous render saves, waits, and returns a download URL', async () => {
    const r = await (await fetch(`${base}/media/render`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ compId: 1, name: 'out.mp4' }),
    })).json();
    assert.equal(r.ok, true);
    assert.equal(r.output, 'out.mp4');
    assert.equal(r.downloadUrl, '/media/file/out.mp4');
    // and the file is actually downloadable
    const dl = await fetch(base + r.downloadUrl);
    assert.equal(dl.status, 200);
  });

  it('render requires compId', async () => {
    const r = await fetch(`${base}/media/render`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(r.status, 400);
  });

  it('fetches a video by base64 into incoming', async () => {
    const r = await (await fetch(`${base}/media/fetch`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dataBase64: Buffer.from('some-video').toString('base64'), name: 'b64.mp4' }),
    })).json();
    assert.equal(r.ok, true);
    assert.match(r.file, /b64\.mp4$/);
    const list = await (await fetch(`${base}/media/list`)).json();
    assert.ok(list.incoming.some((f) => f.name === r.file), 'fetched file appears in incoming');
  });

  it('fetch requires url or dataBase64', async () => {
    const r = await fetch(`${base}/media/fetch`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(r.status, 400);
  });

  it('render exposes a pollable job (GET /media/render/:jobId -> done)', async () => {
    const r = await (await fetch(`${base}/media/render`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ compId: 2, name: 'job.mp4' }),
    })).json();
    assert.equal(r.ok, true);
    assert.ok(r.jobId, 'render returns a jobId');
    const poll = await (await fetch(`${base}/media/render/${r.jobId}`)).json();
    assert.equal(poll.ok, true);
    assert.equal(poll.status, 'done');
    assert.match(poll.downloadUrl, /\/media\/file\//);
  });

  it('unknown jobId reports cleanly', async () => {
    const poll = await (await fetch(`${base}/media/render/nope`)).json();
    assert.equal(poll.ok, false);
    assert.match(poll.error, /unknown jobId/);
  });
});

describe('media auth (token gate)', () => {
  let base; let server; let root;
  before(() => { ({ base, server, root } = makeServer({ token: 'secret123' })); });
  after(() => { server.close(); rmSync(root, { recursive: true, force: true }); });

  it('rejects without a token', async () => {
    const r = await fetch(`${base}/media/list`);
    assert.equal(r.status, 401);
  });

  it('accepts a Bearer token', async () => {
    const r = await fetch(`${base}/media/list`, { headers: { authorization: 'Bearer secret123' } });
    assert.equal(r.status, 200);
  });

  it('accepts a ?token= query param', async () => {
    const r = await fetch(`${base}/media/list?token=secret123`);
    assert.equal(r.status, 200);
  });
});
