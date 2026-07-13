// bridge.js — evalScript wrapper that returns Promises with a uniform shape.
//
// The panel's main.js calls bridge.callHost(command, params) which:
//   1. JSON.stringify the params
//   2. Escape the string for evalScript's string-in/string-out contract
//   3. Build the evalScript call: dispatch("command","escapedParamsJson")
//   4. Parse the JSON result from the host
//
// Returns: { ok:true, result } | { ok:false, error }

(function () {
  'use strict';

  var cs = new CSInterface();

  /**
   * Call a JSX command via evalScript.
   * @param {string} command - Command name (e.g. "ping", "createComp").
   * @param {object} params  - Parameters object (will be JSON-stringified).
   * @returns {Promise<{ok:boolean, result?:any, error?:string}>}
   */
  function callHost(command, params) {
    return new Promise(function (resolve) {
      // Serialize params and escape for embedding in a JSX string literal.
      var payload = JSON.stringify(params || {});
      // Escape backslashes first, then double-quotes, for the evalScript string.
      payload = payload.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

      var script = 'dispatch("' + command + '","' + payload + '")';

      cs.evalScript(script, function (raw) {
        // "EvalScript error." is the literal string AE returns when JSX fails
        // to compile or run (e.g. syntax error in the script).
        if (raw === 'EvalScript error.') {
          return resolve({
            ok: false,
            error: 'EvalScript error (JSX failed to compile/run)',
          });
        }

        // The host's dispatch() always returns JSON.stringify'd result.
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          resolve({
            ok: false,
            error: 'Bad JSON from host: ' + raw,
          });
        }
      });
    });
  }

  // Resolve Node's require inside CEP (mixed-context exposes a global require;
  // otherwise it lives on window.cep_node).
  function nodeRequire(mod) {
    try {
      if (typeof require === 'function') return require(mod);
    } catch (e) { /* fall through */ }
    if (typeof window !== 'undefined' && window.cep_node && window.cep_node.require) {
      return window.cep_node.require(mod);
    }
    return null;
  }

  // Resolve the extension's install directory. cs.getSystemPath('extension')
  // returns empty on some AE builds, so fall back to deriving it from this
  // panel's own URL — always an absolute file URL in CEP.
  function getExtensionDir() {
    var dir = '';
    try { dir = cs.getSystemPath('extension') || ''; } catch (e) { dir = ''; }
    if (dir) return dir.replace(/\\/g, '/');
    try {
      var href = window.location.href; // file:///C:/.../com.ae-bridge.panel/index.html
      var d = href.substring(0, href.lastIndexOf('/'));
      d = d.replace(/^file:\/+/i, '');   // strip file:// + leading slashes -> C:/...
      d = decodeURIComponent(d);
      return d;
    } catch (e) { return ''; }
  }

  // Load the JSX bundle into the host scripting engine.
  // callback(ok:boolean, detail:string, path:string)
  function loadJSX(callback) {
    function done(ok, detail, path) {
      if (typeof callback === 'function') callback(ok, detail, path);
    }

    var dir = getExtensionDir();
    var jsxPath = (dir + '/jsx/bundle.jsx').replace(/\\/g, '/');

    // Load by reading the bundle as explicit UTF-8 and eval()'ing it at global
    // scope. We deliberately avoid $.evalFile: it ignores a BOM-less file's
    // UTF-8 encoding, mis-decodes non-ASCII bytes (e.g. em-dashes in comments),
    // and throws an UNCATCHABLE "EvalScript error.". eval() of explicitly
    // UTF-8-decoded content is robust and its errors are catchable. eval runs at
    // global scope here, so dispatch()/COMMANDS persist for later evalScript calls.
    var probe =
      'var __r;' +
      'try {' +
      ' var __f = new File("' + jsxPath + '");' +
      ' __f.encoding = "UTF-8";' +
      ' if (!__f.open("r")) { __r = "OPEN_FAIL"; } else {' +
      '  var __c = __f.read(); __f.close();' +
      '  eval(__c);' +
      '  __r = (typeof dispatch === "function") ? ("OK " + dispatch("ping","{}")) : "NO_DISPATCH";' +
      ' }' +
      '} catch (e) { __r = "ERR: " + e.toString() + (e.line ? (" @line " + e.line) : ""); }' +
      '__r;';
    cs.evalScript(probe, function (result) {
      var ok = (result || '').indexOf('OK ') === 0;
      done(ok, 'result=' + result, jsxPath);
    });
  }

  // Expose globally for main.js to use.
  window.bridge = {
    callHost: callHost,
    loadJSX: loadJSX,
  };
})();
