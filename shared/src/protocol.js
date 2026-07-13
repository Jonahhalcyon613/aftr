// protocol.js — envelope construction/parsing for the aftr wire format.
//
// All socket traffic is JSON envelopes. Three envelope kinds:
//   request  (controller -> panel): { id, type:'command', command, params }
//   result   (panel -> controller): { id, type:'result', ok, result|error }
//   event    (panel -> controller): { type:'event', event, data }
//
// Everything here is pure and dependency-free so it can run in Node and, if
// ever needed, in a browser/CEP context.

export const ENVELOPE_TYPES = Object.freeze({
  COMMAND: 'command',
  RESULT: 'result',
  EVENT: 'event',
});

let _counter = 0;

/**
 * Generate a correlation id. Uses crypto.randomUUID when available, otherwise
 * a monotonic counter + time-free fallback (kept deterministic-friendly for
 * tests by allowing an injected prefix).
 */
export function newId(prefix = 'cmd') {
  _counter = (_counter + 1) % Number.MAX_SAFE_INTEGER;
  try {
    // Node 18+ and modern browsers.
    if (typeof globalThis.crypto?.randomUUID === 'function') {
      return `${prefix}_${globalThis.crypto.randomUUID()}`;
    }
  } catch {
    /* fall through */
  }
  return `${prefix}_${_counter}_${Math.abs(hashSeed(_counter)).toString(36)}`;
}

function hashSeed(n) {
  // Tiny non-crypto spreader so counter-only ids don't collide visually.
  let x = n | 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = x + (x << 3);
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return x;
}

export function buildRequest(command, params, id = newId()) {
  return {
    id,
    type: ENVELOPE_TYPES.COMMAND,
    command,
    params: params ?? {},
  };
}

export function buildResultOk(id, result) {
  return { id, type: ENVELOPE_TYPES.RESULT, ok: true, result };
}

export function buildResultError(id, error) {
  return {
    id,
    type: ENVELOPE_TYPES.RESULT,
    ok: false,
    error: typeof error === 'string' ? error : String(error?.message ?? error),
  };
}

export function buildEvent(event, data) {
  return { type: ENVELOPE_TYPES.EVENT, event, data: data ?? {} };
}

/**
 * Parse a raw socket string into an envelope, with structural validation.
 * Returns { ok:true, envelope } or { ok:false, error }.
 */
export function parseEnvelope(raw) {
  let obj;
  try {
    obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e.message}` };
  }
  if (obj === null || typeof obj !== 'object') {
    return { ok: false, error: 'Envelope must be a JSON object' };
  }
  if (!obj.type) {
    return { ok: false, error: 'Envelope missing "type"' };
  }
  if (obj.type === ENVELOPE_TYPES.COMMAND) {
    if (typeof obj.id !== 'string' && typeof obj.id !== 'number') {
      return { ok: false, error: 'command envelope missing string/number "id"' };
    }
    if (typeof obj.command !== 'string') {
      return { ok: false, error: 'command envelope missing "command"' };
    }
  } else if (obj.type === ENVELOPE_TYPES.RESULT) {
    if (typeof obj.id !== 'string' && typeof obj.id !== 'number') {
      return { ok: false, error: 'result envelope missing "id"' };
    }
    if (typeof obj.ok !== 'boolean') {
      return { ok: false, error: 'result envelope missing boolean "ok"' };
    }
  } else if (obj.type === ENVELOPE_TYPES.EVENT) {
    if (typeof obj.event !== 'string') {
      return { ok: false, error: 'event envelope missing "event"' };
    }
  } else {
    return { ok: false, error: `Unknown envelope type: ${obj.type}` };
  }
  return { ok: true, envelope: obj };
}

export function serialize(envelope) {
  return JSON.stringify(envelope);
}
