// render.jsx — render SUPPORT helpers (ES3).
//
// IMPORTANT: rendering itself is NOT done here. app.project.renderQueue.render()
// and rqItem.render() are SYNCHRONOUS/MODAL in After Effects — they freeze AE
// and block the evalScript callback for the entire render, which would hang the
// bridge. Instead the panel's Node layer (panel/src/render.js) spawns aerender.exe
// as a child process, streams progress events, and never blocks AE.
//
// This file only provides the dumb data-gathering step that the smart Node
// layer needs. The "__" prefix marks it internal: it is intentionally absent
// from the controller's command registry, so it cannot be invoked over the
// socket by external clients — only the panel/simulator call it locally.

COMMANDS.__prepareRender = function (p) {
  if (p.compId === undefined) throw new Error("compId is required");
  if (!p.outputPath) throw new Error("outputPath is required");

  var comp = _findComp(p.compId);
  var proj = app.project;
  var projectPath = (proj.file ? proj.file.fsName : null);

  return {
    compId: comp.id,
    compName: comp.name,
    outputPath: p.outputPath,
    projectPath: projectPath,
    projectSaved: projectPath ? true : false,
    duration: comp.duration,
    frameRate: comp.frameRate,
    totalFrames: Math.round(comp.duration * comp.frameRate),
    startFrame: (p.startFrame !== undefined && p.startFrame !== null) ? p.startFrame : null,
    endFrame: (p.endFrame !== undefined && p.endFrame !== null) ? p.endFrame : null,
    settingsTemplate: p.settingsTemplate ? p.settingsTemplate : null,
    outputModuleTemplate: p.outputModuleTemplate ? p.outputModuleTemplate : null
  };
};

// __saveProject — save the project so aerender has a file on disk to render.
// Never opens a dialog (dialogs freeze the bridge). If the project has never
// been saved and no path is supplied, it throws — the caller surfaces that.
COMMANDS.__saveProject = function (p) {
  var proj = app.project;
  if (p && p.path) {
    proj.save(new File(p.path));
  } else if (proj.file) {
    proj.save();
  } else {
    throw new Error("Project has never been saved; supply a path to save to");
  }
  return { path: proj.file ? proj.file.fsName : null };
};

// runJSX — dev-only escape hatch for raw ExtendScript evaluation.
// Gated behind the controller's dev flag (never forwarded here when off).
COMMANDS.runJSX = function (p) {
  if (!p.script) throw new Error("script is required");
  var result = eval(p.script);
  if (result === undefined) return { value: null };
  if (typeof result === "object") return result;
  return { value: result };
};
