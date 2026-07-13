// discovery.js — panel-side listPlugins (Node fs).
//
// There's no scripting API for installed plugins, so this enumerates the plugin
// install directories for .aex (Windows) / .plugin / .bundle (macOS) files,
// derived from the AE install path (which the panel can read but JSX cannot
// cleanly). Best-effort + cross-platform.

(function () {
  'use strict';
  var cs = new CSInterface();

  function nodeRequire(mod) {
    try { if (typeof require === 'function') return require(mod); } catch (e) {}
    if (typeof window !== 'undefined' && window.cep_node && window.cep_node.require) return window.cep_node.require(mod);
    return null;
  }

  function listPlugins(env, sendEnvelope, sendEvent, log) {
    var fs = nodeRequire('fs'), path = nodeRequire('path');
    if (!fs || !path) {
      sendEnvelope({ id: env.id, type: 'result', ok: false, error: 'Node fs unavailable (--enable-nodejs?)' });
      return;
    }
    var p = env.params || {};
    var isMac = (typeof process !== 'undefined' && process.platform === 'darwin');
    var hostExe = cs.getSystemPath('hostApplication');
    var dirs = [];
    if (p.dirs && p.dirs.length) {
      dirs = p.dirs.slice();
    } else if (isMac) {
      var m = /(.*Adobe After Effects[^\/]*)\//.exec(hostExe);
      var appRoot = m ? m[1] : path.dirname(hostExe);
      dirs.push(appRoot + '/Plug-ins');
      dirs.push('/Library/Application Support/Adobe/Common/Plug-ins');
    } else {
      var supportFiles = path.dirname(hostExe); // .../Support Files
      dirs.push(path.join(supportFiles, 'Plug-ins'));
      dirs.push('C:/Program Files/Adobe/Common/Plug-ins');
    }
    var exts = isMac ? ['.plugin', '.bundle'] : ['.aex'];

    var plugins = [];
    function walk(dir, depth) {
      if (depth > 5) return;
      var entries;
      try { entries = fs.readdirSync(dir); } catch (e) { return; }
      for (var i = 0; i < entries.length; i++) {
        var full = path.join(dir, entries[i]);
        var ext = path.extname(entries[i]).toLowerCase();
        if (exts.indexOf(ext) >= 0) {
          plugins.push({ name: path.basename(entries[i], path.extname(entries[i])), path: full });
          continue; // a .plugin bundle is a dir on mac — don't descend into it
        }
        var st; try { st = fs.statSync(full); } catch (e) { continue; }
        if (st.isDirectory()) walk(full, depth + 1);
      }
    }
    for (var d = 0; d < dirs.length; d++) walk(dirs[d], 0);

    // de-dup by path
    var seen = {}, uniq = [];
    for (var j = 0; j < plugins.length; j++) { if (!seen[plugins[j].path]) { seen[plugins[j].path] = 1; uniq.push(plugins[j]); } }

    sendEnvelope({
      id: env.id, type: 'result', ok: true,
      result: {
        count: uniq.length, plugins: uniq, scannedDirs: dirs, bestEffort: true,
        note: 'No scripting API for plugins; enumerated install dirs for ' + exts.join('/') + ' files. Pair with listInstalledEffects to find usable matchNames.'
      }
    });
  }

  window.pluginHandler = { listPlugins: listPlugins };
})();
