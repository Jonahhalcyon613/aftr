// keystroke.js — OS-level keyboard injection (panel-side, runs where AE lives).
//
// executeMenuCommand covers anything with a menu entry; this covers raw key
// combos / typing for cases without one. Windows uses .NET SendKeys (after
// activating the AE window); macOS uses osascript System Events.
//
// SendKeys syntax: ^=Ctrl %=Alt +=Shift, named keys in braces e.g. {F9} {ENTER}.

(function () {
  'use strict';

  function nodeRequire(mod) {
    try { if (typeof require === 'function') return require(mod); } catch (e) {}
    if (typeof window !== 'undefined' && window.cep_node && window.cep_node.require) return window.cep_node.require(mod);
    return null;
  }

  // Extension install dir (for locating tools/sendkeys.ps1). Derive from the
  // panel URL, same trick the JSX loader uses (getSystemPath can be empty).
  function extensionDir() {
    try {
      var href = window.location.href;
      var d = href.substring(0, href.lastIndexOf('/')).replace(/^file:\/+/i, '');
      return decodeURIComponent(d);
    } catch (e) { return ''; }
  }

  function escapeLiteral(t) {
    return String(t).replace(/[+^%~(){}\[\]]/g, function (c) { return '{' + c + '}'; });
  }

  // Build a SendKeys string from { keys } | { text } | { key, ctrl, alt, shift }.
  function buildKeys(p) {
    if (p.keys) return p.keys;
    if (p.text !== undefined) return escapeLiteral(p.text);
    var k = p.key || '';
    if (!k) return '';
    var pre = '';
    if (p.ctrl) pre += '^';
    if (p.alt) pre += '%';
    if (p.shift) pre += '+';
    if (/^[A-Za-z0-9]$/.test(k)) return pre + k;
    return pre + '{' + String(k).toUpperCase() + '}';
  }

  function done(sendEnvelope, env, ok, info) {
    var out = { id: env.id, type: 'result', ok: ok };
    if (ok) out.result = { sent: info };
    else out.error = 'keystroke failed: ' + info;
    sendEnvelope(out);
  }

  function keystroke(env, sendEnvelope, sendEvent, log) {
    var p = env.params || {};
    var keys = buildKeys(p);
    if (!keys) { done(sendEnvelope, env, false, 'provide keys, text, or key'); return; }
    log('dim', 'keystroke: ' + keys);

    var cp = nodeRequire('child_process');
    if (!cp) { done(sendEnvelope, env, false, 'Node child_process unavailable (--enable-nodejs?)'); return; }

    var isMac = (typeof process !== 'undefined' && process.platform === 'darwin');
    if (!isMac) {
      // Use the helper script that force-foregrounds AE (AttachThreadInput)
      // before sending keys — bypasses the Windows foreground-lock that blocks
      // background-spawned SendKeys.
      var psPath = extensionDir() + '/tools/sendkeys.ps1';
      var child = cp.spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', psPath, '-Keys', keys,
      ]);
      child.on('close', function (code) { done(sendEnvelope, env, code === 0, code === 0 ? keys : ('exit ' + code)); });
      child.on('error', function (e) { done(sendEnvelope, env, false, e.message); });
    } else {
      var literal = (p.text !== undefined) ? p.text : (p.key || '');
      var script = 'tell application "Adobe After Effects 2026" to activate\ndelay 0.12\ntell application "System Events" to keystroke "' + String(literal).replace(/"/g, '\\"') + '"';
      var mc = cp.spawn('osascript', ['-e', script]);
      mc.on('close', function (code) { done(sendEnvelope, env, code === 0, code === 0 ? keys : ('exit ' + code)); });
      mc.on('error', function (e) { done(sendEnvelope, env, false, e.message); });
    }
  }

  window.keystrokeHandler = { keystroke: keystroke };
})();
