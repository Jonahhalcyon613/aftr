/* aftr controller UI.
 * Connects to the /agent WebSocket: sends command envelopes, renders a live
 * log of results + panel events, and shows the last JSON response. The UI is
 * just another agent client of the same protocol. */
(function () {
  'use strict';

  // Per-command form fields. type controls how the string input is coerced.
  var FIELDS = {
    ping: [],
    getProjectInfo: [],
    listComps: [],
    createComp: [
      { name: 'name', type: 'string', required: true, placeholder: 'Main' },
      { name: 'width', type: 'int', placeholder: '1920' },
      { name: 'height', type: 'int', placeholder: '1080' },
      { name: 'duration', type: 'number', placeholder: '10' },
      { name: 'frameRate', type: 'number', placeholder: '30' },
    ],
    addSolid: [
      { name: 'compId', type: 'int', required: true, placeholder: '1' },
      { name: 'name', type: 'string', placeholder: 'BG' },
      { name: 'color', type: 'json', placeholder: '[1,0,0]' },
      { name: 'width', type: 'int', placeholder: '1920' },
      { name: 'height', type: 'int', placeholder: '1080' },
    ],
    addTextLayer: [
      { name: 'compId', type: 'int', required: true, placeholder: '1' },
      { name: 'text', type: 'string', required: true, placeholder: 'Hello' },
      { name: 'fontSize', type: 'number', placeholder: '72' },
      { name: 'position', type: 'json', placeholder: '[960,540]' },
    ],
    setLayerProperty: [
      { name: 'compId', type: 'int', required: true, placeholder: '1' },
      { name: 'layerIndex', type: 'int', required: true, placeholder: '1' },
      { name: 'property', type: 'string', required: true, placeholder: 'opacity' },
      { name: 'value', type: 'json', required: true, placeholder: '50' },
    ],
    render: [
      { name: 'compId', type: 'int', required: true, placeholder: '1' },
      { name: 'outputPath', type: 'string', required: true, placeholder: 'C:/out/render.mov' },
      { name: 'settingsTemplate', type: 'string', placeholder: 'Best Settings' },
      { name: 'outputModuleTemplate', type: 'string', placeholder: 'Lossless' },
      { name: 'format', type: 'string', placeholder: '' },
    ],
    runJSX: [{ name: 'script', type: 'string', required: true, placeholder: 'app.version' }],
  };

  var els = {
    list: document.getElementById('commandList'),
    log: document.getElementById('log'),
    response: document.getElementById('response'),
    statusPill: document.getElementById('statusPill'),
    statusText: document.getElementById('statusText'),
    clearLog: document.getElementById('clearLog'),
  };

  var ws = null;
  var panelConnected = false;
  var pending = {}; // id -> command name

  // -- logging ---------------------------------------------------------------
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ts() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function logRow(tagClass, tag, msg) {
    var row = document.createElement('div');
    row.className = 'row';
    row.innerHTML =
      '<span class="t">' + ts() + '</span>' +
      '<span class="tag ' + tagClass + '">' + tag + '</span>' +
      '<span class="msg"></span>';
    row.querySelector('.msg').textContent = msg;
    els.log.appendChild(row);
    els.log.scrollTop = els.log.scrollHeight;
  }

  // -- status ----------------------------------------------------------------
  function setStatus(connected, info) {
    panelConnected = connected;
    els.statusPill.className = 'pill ' + (connected ? 'pill--on' : 'pill--off');
    if (connected) {
      var bits = ['AE connected'];
      if (info && info.ae) bits.push('v' + info.ae);
      if (info && info.project) bits.push(info.project);
      els.statusText.textContent = bits.join(' · ');
    } else {
      els.statusText.textContent = 'no AE panel';
    }
    // Enable/disable command buttons (ping always allowed once socket is open).
    var btns = els.list.querySelectorAll('button[data-cmd]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].disabled = !connected && ws && ws.readyState === 1 ? !connected : !connected;
    }
  }

  // -- websocket -------------------------------------------------------------
  function wsUrl() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + location.host + '/agent';
  }
  function connect() {
    els.statusPill.className = 'pill pill--wait';
    els.statusText.textContent = 'connecting…';
    ws = new WebSocket(wsUrl());
    ws.onopen = function () { logRow('tag-status', 'ui', 'connected to controller'); };
    ws.onclose = function () {
      setStatus(false);
      els.statusPill.className = 'pill pill--off';
      els.statusText.textContent = 'controller offline — retrying';
      setTimeout(connect, 1500);
    };
    ws.onerror = function () { /* onclose will handle retry */ };
    ws.onmessage = function (ev) {
      var env;
      try { env = JSON.parse(ev.data); } catch (e) { return; }
      handle(env);
    };
  }

  function handle(env) {
    if (env.type === 'status') {
      setStatus(!!env.data.connected, env.data);
      logRow('tag-status', 'status', env.data.connected
        ? 'AE panel connected' + (env.data.ae ? ' (v' + env.data.ae + ')' : '')
        : 'AE panel disconnected');
    } else if (env.type === 'result') {
      var name = pending[env.id] || env.command || 'result';
      delete pending[env.id];
      if (env.ok) {
        logRow('tag-result-ok', name, 'ok ' + short(env.result));
      } else {
        logRow('tag-result-err', name, 'ERROR ' + (env.error || '') + (env.code ? ' [' + env.code + ']' : ''));
      }
      els.response.textContent = JSON.stringify(env, null, 2);
    } else if (env.type === 'event') {
      if (env.event === 'progress') {
        logRow('tag-progress', 'progress', describeProgress(env.data));
      } else if (env.event === 'log') {
        logRow('tag-event', 'log:' + (env.data.level || 'info'), env.data.message || '');
      } else {
        logRow('tag-event', env.event, short(env.data));
      }
    }
  }

  function describeProgress(d) {
    var parts = [];
    if (d.jobId) parts.push(d.jobId);
    if (typeof d.percent === 'number') parts.push(d.percent + '%');
    if (d.message) parts.push(d.message);
    return parts.join(' · ');
  }
  function short(v) {
    var s = typeof v === 'string' ? v : JSON.stringify(v);
    if (s == null) return '';
    return s.length > 160 ? s.slice(0, 157) + '…' : s;
  }

  // -- command forms ---------------------------------------------------------
  function coerce(field, raw) {
    if (raw === '' || raw == null) {
      if (field.required) throw new Error(field.name + ' is required');
      return undefined;
    }
    if (field.type === 'int') {
      var i = parseInt(raw, 10);
      if (isNaN(i)) throw new Error(field.name + ' must be an integer');
      return i;
    }
    if (field.type === 'number') {
      var n = parseFloat(raw);
      if (isNaN(n)) throw new Error(field.name + ' must be a number');
      return n;
    }
    if (field.type === 'json') {
      try { return JSON.parse(raw); }
      catch (e) { return raw; } // fall back to literal string for 'value'
    }
    return raw; // string
  }

  function buildCommandCard(cmd) {
    var hasSpec = FIELDS.hasOwnProperty(cmd.name);
    var fields = hasSpec ? FIELDS[cmd.name] : null;
    var card = document.createElement('div');
    card.className = 'cmd' + (cmd.dev ? ' dev' : '');

    var head = '<div class="cmd-head"><span class="cmd-name">' + cmd.name + '</span>' +
      (cmd.dev ? '<span class="cmd-badge">DEV</span>' : '') + '</div>' +
      '<div class="cmd-desc">' + (cmd.description || '') + '</div>';

    var fieldsHtml = '';
    if (fields && fields.length) {
      fieldsHtml = '<div class="cmd-fields">';
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        fieldsHtml += '<div class="field"><label>' + f.name +
          (f.required ? ' *' : '') + '</label>' +
          '<input data-field="' + f.name + '" placeholder="' + (f.placeholder || '') + '" /></div>';
      }
      fieldsHtml += '</div>';
    } else if (!hasSpec) {
      // Rich/v2 commands: free-form JSON params editor.
      fieldsHtml = '<div class="field"><label>params (JSON)</label>' +
        '<textarea data-json rows="3" placeholder="{ }"></textarea></div>';
    }

    card.innerHTML = head + fieldsHtml +
      '<button class="btn" data-cmd="' + cmd.name + '">Run</button>';

    card.querySelector('button').addEventListener('click', function () {
      runCommand(cmd, card);
    });
    return card;
  }

  function runCommand(cmd, card) {
    var hasSpec = FIELDS.hasOwnProperty(cmd.name);
    var params = {};
    if (!hasSpec) {
      var ta = card.querySelector('[data-json]');
      var txt = ta ? ta.value.trim() : '';
      try { params = txt ? JSON.parse(txt) : {}; }
      catch (e) { logRow('tag-result-err', cmd.name, 'invalid JSON: ' + e.message); return; }
    } else {
      var fields = FIELDS[cmd.name] || [];
      try {
        for (var i = 0; i < fields.length; i++) {
          var f = fields[i];
          var input = card.querySelector('[data-field="' + f.name + '"]');
          var val = coerce(f, input ? input.value.trim() : '');
          if (val !== undefined) params[f.name] = val;
        }
      } catch (e) {
        logRow('tag-result-err', cmd.name, 'input error: ' + e.message);
        return;
      }
    }
    if (!ws || ws.readyState !== 1) {
      logRow('tag-result-err', cmd.name, 'controller socket not open');
      return;
    }
    var id = 'ui_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    pending[id] = cmd.name;
    ws.send(JSON.stringify({ id: id, type: 'command', command: cmd.name, params: params }));
    logRow('tag-sent', 'sent', cmd.name + ' ' + short(params));
  }

  // -- boot ------------------------------------------------------------------
  function loadCommands() {
    fetch('/api/commands')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        els.list.innerHTML = '';
        (data.commands || []).forEach(function (cmd) {
          els.list.appendChild(buildCommandCard(cmd));
        });
        setStatus(panelConnected);
      })
      .catch(function (e) {
        logRow('tag-result-err', 'ui', 'failed to load commands: ' + e.message);
      });
  }

  els.clearLog.addEventListener('click', function () { els.log.innerHTML = ''; });

  loadCommands();
  connect();
})();
