// media.js — video in / video out for remote hosting.
//
// REST + a reusable service (returned by mountMedia) so the in-process MCP
// endpoint shares the exact same logic:
//   POST /media/upload?name=clip.mp4   (raw body)   -> { id, file, url, bytes }
//   POST /media/fetch  { url | dataBase64, name? }  -> pull a video by URL/base64
//   GET  /media/list                                 -> { incoming[], outputs[] }
//   GET  /media/file/:name                           -> download
//   POST /media/render { compId, name? }             -> render; WAITS up to a cap,
//                                                       then hands back a jobId
//   GET  /media/render/:jobId                        -> poll a render job
//   GET  /studio                                     -> browser upload/download page
//
// Renders run as tracked JOBS: a long render no longer blocks the caller past
// the MCP client's ~180s timeout — the call returns { pending, jobId } and the
// client polls. Every finished render is transcoded to a web-friendly H.264 .mp4
// (best-effort, via ffmpeg) so it plays everywhere instead of aerender's .m4v.

import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { makeLogger } from './log.js';

const log = makeLogger('media');

function safeName(name, fallback) {
  const b = basename(String(name || fallback)).replace(/[^\w.\- ]+/g, '_').trim();
  return b || fallback;
}

function resolveOutput(dir, requested) {
  if (existsSync(join(dir, requested))) return requested;
  const base = requested.replace(/\.[^.]+$/, '');
  const hits = readdirSync(dir)
    .filter((f) => f === requested || f.startsWith(base))
    .map((f) => ({ f, m: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return hits.length ? hits[0].f : null;
}

let _ffmpeg;
function findFfmpeg(configured) {
  if (_ffmpeg !== undefined) return _ffmpeg;
  const cands = [configured, process.env.AE_BRIDGE_FFMPEG, 'ffmpeg'].filter(Boolean);
  for (const c of cands) {
    try { execFileSync(c, ['-version'], { stdio: 'ignore' }); _ffmpeg = c; return c; } catch { /* next */ }
  }
  _ffmpeg = null;
  return null;
}

// Transcode to a universally-playable H.264 .mp4 (yuv420p, faststart). Returns
// the new filename, or null if ffmpeg is unavailable / the encode fails (caller
// then serves the original).
function transcodeToMp4(ff, dir, srcName) {
  return new Promise((resolve) => {
    if (!ff) return resolve(null);
    const src = join(dir, srcName);
    const base = srcName.replace(/\.[^.]+$/, '');
    const outName = (extname(srcName).toLowerCase() === '.mp4') ? `${base}.play.mp4` : `${base}.mp4`;
    const out = join(dir, outName);
    const args = ['-y', '-i', src, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-c:a', 'aac', out];
    // stdio:'ignore' — ffmpeg is chatty on stderr; leaving it piped+undrained
    // fills the OS buffer and deadlocks the process (close never fires).
    const p = spawn(ff, args, { stdio: 'ignore' });
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 && existsSync(out) ? outName : null));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function mountMedia(app, { aeClient, cfg }) {
  const root = cfg.root;
  const incomingDir = join(root, 'assets', 'incoming');
  const outputsDir = join(root, 'assets', 'outputs');
  mkdirSync(incomingDir, { recursive: true });
  mkdirSync(outputsDir, { recursive: true });
  const PUBLIC = (cfg.publicUrl || '').replace(/\/+$/, '');
  const WAIT_CAP = cfg.renderWaitMs ?? 150000;
  const ff = findFfmpeg(cfg.ffmpeg);
  const fileUrl = (name, base = '') => `${base}/media/file/${encodeURIComponent(name)}`;

  // --- render job registry ---------------------------------------------------
  // jobId -> { status:'rendering'|'transcoding'|'done'|'failed', output, bytes, error, compId }
  const jobs = new Map();
  aeClient.on('event', async (env) => {
    if (!env || env.event !== 'renderComplete' || !env.data) return;
    const job = jobs.get(env.data.jobId);
    if (!job) return;
    if (!env.data.ok) {
      job.status = 'failed';
      job.error = env.data.error || `aerender exited ${env.data.code}`;
      return;
    }
    const actual = resolveOutput(outputsDir, job.outName);
    if (!actual) { job.status = 'failed'; job.error = 'render succeeded but no output file found'; return; }
    job.status = 'transcoding';
    const mp4 = await transcodeToMp4(ff, outputsDir, actual);
    const finalName = mp4 || actual;
    job.output = finalName;
    try { job.bytes = statSync(join(outputsDir, finalName)).size; } catch { job.bytes = 0; }
    job.transcoded = !!mp4;
    job.status = 'done';
  });

  function jobView(jobId, base = '') {
    const j = jobs.get(jobId);
    if (!j) return { ok: false, error: 'unknown jobId', jobId };
    const out = { ok: true, jobId, status: j.status, compId: j.compId };
    if (j.status === 'done') { out.output = j.output; out.bytes = j.bytes; out.transcoded = j.transcoded; out.downloadUrl = fileUrl(j.output, base); }
    if (j.status === 'failed') { out.ok = false; out.error = j.error; }
    if (j.status === 'rendering' || j.status === 'transcoding') { out.pending = true; }
    return out;
  }

  function auth(req, res, next) {
    if (!cfg.token) return next();
    const h = req.get('authorization') || '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
    if (tok === cfg.token) return next();
    return res.status(401).json({ ok: false, error: 'unauthorized — supply Authorization: Bearer <token> or ?token=' });
  }

  // --- service functions (REST + MCP share these) ----------------------------
  function list(base = '') {
    const ls = (dir, kind) => (existsSync(dir) ? readdirSync(dir) : [])
      .filter((f) => !f.startsWith('.'))
      .map((f) => ({ kind, name: f, bytes: statSync(join(dir, f)).size, url: fileUrl(f, base) }));
    return { ok: true, incoming: ls(incomingDir, 'incoming'), outputs: ls(outputsDir, 'output') };
  }

  function saveToIncoming(buf, name) {
    const file = `${randomUUID().slice(0, 8)}_${safeName(name, 'video.mp4')}`;
    writeFileSync(join(incomingDir, file), buf);
    log.info(`fetched: ${file} (${buf.length} bytes)`);
    return { ok: true, id: file, file, name: safeName(name, 'video.mp4'), path: join(incomingDir, file), bytes: buf.length, url: fileUrl(file) };
  }

  // Import the saved footage, make a comp matching its size/duration, and drop
  // the footage in — so callers go from a URL straight to a renderable compId.
  async function placeInComp(path, compName) {
    const imp = await aeClient.sendCommand('importFootage', { path, name: compName || 'clip' }, { allowDev: cfg.allowDev });
    if (!imp.ok) return { ok: false, step: 'importFootage', error: imp.error };
    const f = imp.result || {};
    const itemId = (f.itemId !== undefined) ? f.itemId : f.id;
    const comp = await aeClient.sendCommand('createComp', {
      name: compName || 'Clip',
      width: f.width || 1920, height: f.height || 1080,
      duration: f.duration || 5, frameRate: f.frameRate || 30,
    }, { allowDev: cfg.allowDev });
    if (!comp.ok) return { ok: false, step: 'createComp', error: comp.error };
    const compId = comp.result.compId;
    const fl = await aeClient.sendCommand('addFootageLayer', { compId, itemId }, { allowDev: cfg.allowDev });
    return {
      ok: fl.ok, compId, itemId,
      footage: { width: f.width, height: f.height, duration: f.duration, frameRate: f.frameRate },
      error: fl.ok ? undefined : fl.error,
    };
  }

  async function fetchVideo({ url, dataBase64, name, makeComp, compName } = {}) {
    let saved;
    if (url) {
      let r;
      try { r = await fetch(url); } catch (e) { return { ok: false, error: `fetch failed: ${e.message}` }; }
      if (!r.ok) return { ok: false, error: `fetch failed: HTTP ${r.status}` };
      const buf = Buffer.from(await r.arrayBuffer());
      saved = saveToIncoming(buf, name || basename(new URL(url).pathname) || 'video.mp4');
    } else if (dataBase64) {
      saved = saveToIncoming(Buffer.from(dataBase64, 'base64'), name || 'video.mp4');
    } else {
      return { ok: false, error: 'provide { url } or { dataBase64 }' };
    }
    if (saved.ok && makeComp) saved.comp = await placeInComp(saved.path, compName);
    return saved;
  }

  // Kick a render and register the job (returns the jobId immediately).
  async function startRender(b) {
    if (b.compId === undefined || b.compId === null) return { ok: false, error: 'compId is required', httpStatus: 400 };
    let outName = safeName(b.name, `render_${b.compId}`);
    if (!extname(outName)) outName += '.mp4';
    const outputPath = join(outputsDir, outName);

    let sv = await aeClient.sendCommand('saveProject', {}, { allowDev: cfg.allowDev });
    if (!sv.ok) sv = await aeClient.sendCommand('saveProject', { path: join(root, 'assets', '_session.aep') }, { allowDev: cfg.allowDev });
    if (!sv.ok) return { ok: false, error: `could not save project before render: ${sv.error}` };

    const start = await aeClient.sendCommand('render', {
      compId: b.compId, outputPath,
      settingsTemplate: b.settingsTemplate, outputModuleTemplate: b.outputModuleTemplate,
      format: b.format, startFrame: b.startFrame, endFrame: b.endFrame,
    }, { allowDev: cfg.allowDev });
    if (!start.ok) return { ...start, httpStatus: start.code === 'NO_PANEL' ? 409 : 200 };

    const jobId = start.result && start.result.jobId;
    jobs.set(jobId, { status: 'rendering', compId: b.compId, outName, startedAt: Date.now() });
    return { ok: true, jobId, status: 'rendering' };
  }

  // Render and wait up to WAIT_CAP; past that, return { pending, jobId } to poll.
  async function render(b, base = '') {
    const started = await startRender(b);
    if (!started.ok) return started;
    const cap = (b.timeoutMs !== undefined) ? Number(b.timeoutMs) : WAIT_CAP;
    const deadline = cap > 0 ? Date.now() + cap : Infinity;
    while (Date.now() < deadline) {
      const j = jobs.get(started.jobId);
      if (j.status === 'done' || j.status === 'failed') return jobView(started.jobId, base);
      await sleep(600);
    }
    return { ok: true, pending: true, jobId: started.jobId, status: jobs.get(started.jobId).status,
      message: `still rendering after ${Math.round(cap / 1000)}s — poll ae_render_result / GET /media/render/${started.jobId} for the download URL` };
  }

  function info(base = '') {
    const tq = cfg.token ? '?token=YOUR_TOKEN' : '';
    const amp = cfg.token ? '&token=YOUR_TOKEN' : '';
    return {
      ok: true,
      studio: `${base}/studio${tq}`,
      sendByUrl: 'ae_upload_video { url } — host downloads it (easiest for remote callers)',
      sendByUpload: {
        url: `${base}/media/upload?name=clip.mp4${amp}`,
        curl: `curl -X POST --data-binary @clip.mp4 -H "Content-Type: application/octet-stream" "${base}/media/upload?name=clip.mp4${amp}"`,
      },
      list: `${base}/media/list${tq}`,
      download: `${base}/media/file/<name>${tq}`,
      note: 'Send a video (url/upload), import with importFootage (path is in the response), build, then ae_render_and_download (long renders return a jobId to poll with ae_render_result).',
    };
  }

  // --- REST routes -----------------------------------------------------------
  app.post('/media/upload', auth, (req, res) => {
    const name = safeName(req.query.name, 'upload.bin');
    const file = `${randomUUID().slice(0, 8)}_${name}`;
    const dest = join(incomingDir, file);
    const out = createWriteStream(dest);
    let bytes = 0;
    req.on('data', (c) => { bytes += c.length; });
    req.on('error', (e) => { out.destroy(); res.status(400).json({ ok: false, error: e.message }); });
    out.on('error', (e) => res.status(500).json({ ok: false, error: e.message }));
    out.on('finish', () => { log.info(`upload: ${file} (${bytes} bytes)`); res.json({ ok: true, id: file, file, name, path: dest, bytes, url: fileUrl(file) }); });
    req.pipe(out);
  });

  app.post('/media/fetch', auth, async (req, res) => {
    const r = await fetchVideo(req.body || {});
    res.status(r.ok ? 200 : 400).json(r);
  });

  app.get('/media/list', auth, (_req, res) => res.json(list()));

  app.get('/media/file/:name', auth, (req, res) => {
    const name = basename(req.params.name);
    for (const dir of [outputsDir, incomingDir]) {
      const p = join(dir, name);
      if (existsSync(p)) return res.download(p);
    }
    res.status(404).json({ ok: false, error: 'not found' });
  });

  app.post('/media/render', auth, async (req, res) => {
    const r = await render(req.body || {});
    const httpStatus = r.httpStatus || 200;
    delete r.httpStatus;
    res.status(httpStatus).json(r);
  });

  app.get('/media/render/:jobId', auth, (req, res) => res.json(jobView(req.params.jobId)));

  app.get('/studio', (_req, res) => res.type('html').send(STUDIO_HTML));

  log.info(`media routes mounted (auth=${cfg.token ? 'on' : 'off'}, ffmpeg=${ff ? 'yes' : 'NO — output not transcoded'}, renderWaitCap=${Math.round(WAIT_CAP / 1000)}s)`);
  return {
    incomingDir, outputsDir,
    list: (base = PUBLIC) => list(base),
    render: (args, base = PUBLIC) => render(args, base),
    renderResult: (jobId, base = PUBLIC) => jobView(jobId, base),
    fetchVideo: (args) => fetchVideo(args),
    info: (base = PUBLIC) => info(base),
  };
}

const STUDIO_HTML = `<!doctype html><html><head><meta charset=utf8><title>aftr Studio</title>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:680px;margin:40px auto;padding:0 16px;color:#111}
h1{font-size:20px}input,button{font:inherit;padding:8px}button{cursor:pointer;border:1px solid #888;border-radius:6px;background:#f6f6f6}
.row{margin:14px 0}.muted{color:#666;font-size:13px}a{color:#06c}#log{white-space:pre-wrap;background:#f6f6f6;padding:10px;border-radius:6px;min-height:40px}</style>
</head><body>
<h1>aftr Studio</h1>
<p class=muted>Send a video to the After Effects host, then grab rendered results.</p>
<div class=row><b>1. Send a video</b><br><input type=file id=f accept="video/*"> <input id=tok placeholder="token (if required)" size=14> <button onclick=up()>Upload</button></div>
<div class=row><b>2. Files</b> <button onclick=list()>Refresh</button><div id=files class=muted></div></div>
<div class=row><div id=log></div></div>
<script>
const log=m=>document.getElementById('log').textContent=m;
const t=()=>document.getElementById('tok').value.trim();
const q=()=>t()?('?token='+encodeURIComponent(t())):'';
async function up(){const fl=document.getElementById('f').files[0];if(!fl){log('pick a file');return}
 log('uploading '+fl.name+'…');
 const u='/media/upload'+(q()?q()+'&':'?')+'name='+encodeURIComponent(fl.name);
 const r=await fetch(u,{method:'POST',headers:{'content-type':'application/octet-stream'},body:fl});
 const j=await r.json();log(JSON.stringify(j,null,2));list();}
async function list(){const r=await fetch('/media/list'+q());const j=await r.json();
 const out=document.getElementById('files');
 const link=x=>'<a href="'+x.url+(t()?(x.url.includes('?')?'&':'?')+'token='+encodeURIComponent(t()):'')+'">'+x.name+'</a> ('+Math.round(x.bytes/1024)+' KB)';
 out.innerHTML='<u>incoming</u><br>'+(j.incoming||[]).map(link).join('<br>')+'<br><br><u>outputs</u><br>'+(j.outputs||[]).map(link).join('<br>');}
list();
</script></body></html>`;
