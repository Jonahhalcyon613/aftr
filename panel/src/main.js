// main.js — CEP panel entry point.
//
// On boot:
//   1. Load the JSX bundle into AE's scripting engine.
//   2. Connect as a WebSocket CLIENT to the controller.
//   3. Route incoming command envelopes to bridge.callHost().
//   4. Return result envelopes. Emit lifecycle events.
//
// Reconnect with exponential backoff if the controller goes away.

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Config — reads from the panel's config or defaults to localhost:8787.
  // In production this is the ONLY value that changes for cloud deployment.
  // ---------------------------------------------------------------------------
  var WS_URL = 'ws://127.0.0.1:8787/bridge';
  var RECONNECT_INITIAL = 500;
  var RECONNECT_MAX = 10000;
  var RECONNECT_FACTOR = 1.8;

  // Try to load config from a local config file if available.
  // Falls back to defaults above.
  (function loadPanelConfig() {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', 'config.json', false); // sync for boot
      xhr.send();
      if (xhr.status === 200) {
        var cfg = JSON.parse(xhr.responseText);
        if (cfg.wsUrl) WS_URL = cfg.wsUrl;
        else if (cfg.host && cfg.port) {
          WS_URL = 'ws://' + cfg.host + ':' + cfg.port + (cfg.wsPath || '/bridge');
        }
        if (cfg.reconnect) {
          RECONNECT_INITIAL = cfg.reconnect.initialDelayMs || RECONNECT_INITIAL;
          RECONNECT_MAX = cfg.reconnect.maxDelayMs || RECONNECT_MAX;
          RECONNECT_FACTOR = cfg.reconnect.factor || RECONNECT_FACTOR;
        }
      }
    } catch (e) {
      // Config file not found or not parseable — use defaults.
    }
  })();

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------
  var dotEl = document.getElementById('dot');
  var statusEl = document.getElementById('statusText');
  var logEl = document.getElementById('log');

  function setStatus(state, text) {
    dotEl.className = 'dot' + (state === 'on' ? ' on' : state === 'wait' ? ' wait' : '');
    statusEl.textContent = text;
  }

  function log(cls, msg) {
    var span = document.createElement('div');
    span.className = cls || '';
    span.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
    logEl.appendChild(span);
    logEl.scrollTop = logEl.scrollHeight;
    // Keep log size manageable.
    while (logEl.childNodes.length > 200) {
      logEl.removeChild(logEl.firstChild);
    }
  }

  // ---------------------------------------------------------------------------
  // WebSocket client — connects to the controller at /bridge
  // ---------------------------------------------------------------------------
  var ws = null;
  var reconnectDelay = RECONNECT_INITIAL;

  function connect() {
    setStatus('wait', 'connecting to ' + WS_URL + '…');
    log('dim', 'Connecting to controller…');

    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      log('err', 'WebSocket create failed: ' + e.message);
      scheduleReconnect();
      return;
    }

    ws.onopen = function () {
      reconnectDelay = RECONNECT_INITIAL; // reset backoff
      setStatus('on', 'connected');
      log('ok', 'Connected to controller');

      // Emit a "ready" event once we've probed the AE environment. evalScript is
      // async (callback-based), so the probe must complete before we can report
      // a real version/project name — see probeEnvironment().
      probeEnvironment(function (info) {
        setStatus('on', 'connected · AE v' + info.ae);
        sendEvent('ready', info);
      });
    };

    ws.onclose = function (ev) {
      setStatus('', 'disconnected (code ' + ev.code + ')');
      log('dim', 'Disconnected — will retry');
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = function () {
      // onclose will fire after this — handle retry there.
    };

    ws.onmessage = function (ev) {
      handleMessage(ev.data);
    };
  }

  function scheduleReconnect() {
    var delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * RECONNECT_FACTOR, RECONNECT_MAX);
    setTimeout(connect, delay);
  }

  // ---------------------------------------------------------------------------
  // Message handling
  // ---------------------------------------------------------------------------
  function handleMessage(raw) {
    var env;
    try {
      env = JSON.parse(raw);
    } catch (e) {
      log('err', 'Bad JSON from controller: ' + raw);
      return;
    }

    if (env.type !== 'command') {
      log('dim', 'Ignoring non-command envelope: ' + env.type);
      return;
    }

    log('dim', '← ' + env.command);

    // render is non-blocking and Node-driven (aerender), not a JSX dispatch.
    if (env.command === 'render' && window.renderHandler) {
      window.renderHandler.render(env, sendEnvelope, sendEvent, log);
      return;
    }
    // keystroke is OS-level (Node), not a JSX dispatch.
    if (env.command === 'keystroke' && window.keystrokeHandler) {
      window.keystrokeHandler.keystroke(env, sendEnvelope, sendEvent, log);
      return;
    }
    // listPlugins enumerates install dirs via Node fs, not a JSX dispatch.
    if (env.command === 'listPlugins' && window.pluginHandler) {
      window.pluginHandler.listPlugins(env, sendEnvelope, sendEvent, log);
      return;
    }

    // Route the command to the JSX layer via the bridge.
    bridge.callHost(env.command, env.params).then(function (result) {
      // Build a result envelope with the same correlation id.
      var response = {
        id: env.id,
        type: 'result',
        ok: result.ok,
      };
      if (result.ok) {
        response.result = result.result;
      } else {
        response.error = result.error;
      }

      sendEnvelope(response);

      if (result.ok) {
        log('ok', '→ ' + env.command + ' ok');
      } else {
        log('err', '→ ' + env.command + ' ERROR: ' + result.error);
      }
    });
  }

  function sendEnvelope(obj) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(obj));
    }
  }

  function sendEvent(event, data) {
    sendEnvelope({ type: 'event', event: event, data: data || {} });
  }

  // ---------------------------------------------------------------------------
  // AE environment probe — async, because evalScript is callback-based.
  // Uses the JSX dispatch layer (ping + getProjectInfo) so it works the same way
  // every other command does. Falls back to 'unknown'/'Untitled' off-host.
  // ---------------------------------------------------------------------------
  function probeEnvironment(done) {
    var info = { ae: 'unknown', project: 'Untitled' };
    bridge.callHost('ping', {}).then(function (pr) {
      if (pr && pr.ok && pr.result && pr.result.ae) info.ae = pr.result.ae;
      bridge.callHost('getProjectInfo', {}).then(function (gr) {
        if (gr && gr.ok && gr.result && gr.result.name) info.project = gr.result.name;
        done(info);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  setStatus('wait', 'loading JSX…');
  bridge.loadJSX(function (ok, detail, path) {
    window.__jsxLoad = { ok: ok, detail: detail, path: path };
    if (ok) {
      log('ok', 'JSX bundle loaded (' + (detail || '') + ')');
    } else {
      log('err', 'JSX load FAILED: ' + detail);
      log('dim', 'path: ' + path);
    }
    connect();
    // Surface the load result to the controller once the socket is up, so it
    // can be inspected without the AE UI.
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (ws && ws.readyState === 1) {
        clearInterval(t);
        sendEvent('log', {
          level: ok ? 'info' : 'error',
          message: 'jsxLoad ok=' + ok + ' detail=' + detail + ' path=' + path,
        });
      } else if (tries > 40) {
        clearInterval(t);
      }
    }, 250);
  });
})();
