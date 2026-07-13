// app.jsx — application + project control (ES3). The "control everything" surface.
// app.executeCommand(id) runs ANY After Effects menu command (hundreds of them),
// which is the scripting equivalent of pressing menu items / keyboard shortcuts.

COMMANDS.executeMenuCommand = function (p) {
  var id = p.commandId;
  if ((id === undefined || id === null) && p.commandName) {
    id = app.findMenuCommandId(p.commandName);
    AEB.assert(id, 'menu command not found: "' + p.commandName + '"');
  }
  AEB.assert(id, "commandId or commandName is required");
  app.executeCommand(id);
  return { ok: true, commandId: id };
};

COMMANDS.findMenuCommand = function (p) {
  AEB.assert(p.commandName, "commandName is required");
  return { commandId: app.findMenuCommandId(p.commandName), commandName: p.commandName };
};

COMMANDS.saveProject = function (p) {
  if (p && p.path) app.project.save(new File(p.path));
  else if (app.project.file) app.project.save();
  else throw new Error("Project has never been saved; supply a path");
  return { path: app.project.file ? app.project.file.fsName : null };
};

COMMANDS.undo = function () { app.executeCommand(16); return { ok: true }; };   // Edit > Undo
COMMANDS.redo = function () { app.executeCommand(17); return { ok: true }; };   // Edit > Redo

COMMANDS.purge = function (p) {
  var T = String((p && p.target) || "all").toLowerCase();
  var map = {
    all: PurgeTarget.ALL_CACHES, undo: PurgeTarget.UNDO_CACHES,
    snapshot: PurgeTarget.SNAPSHOT_CACHES, image: PurgeTarget.IMAGE_CACHES
  };
  app.purge(map[T] || PurgeTarget.ALL_CACHES);
  return { ok: true };
};

// Open a comp in the viewer (makes it the active item).
COMMANDS.setActiveComp = function (p) {
  var comp = AEB.requireComp(p);
  comp.openInViewer();
  return { ok: true, compId: comp.id, name: comp.name };
};

COMMANDS.getSelection = function () {
  var item = app.project.activeItem;
  if (!(item instanceof CompItem)) return { comp: null, layers: [] };
  var sel = [];
  var ls = item.selectedLayers;
  for (var i = 0; i < ls.length; i++) sel.push(AEB.layerInfo(ls[i]));
  return { comp: { id: item.id, name: item.name }, layers: sel };
};

COMMANDS.setCompTime = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(p.time !== undefined, "time is required");
  comp.time = p.time;
  return { ok: true, time: comp.time };
};

// App/system facts.
COMMANDS.getAppInfo = function () {
  return {
    version: app.version,
    buildName: app.buildName,
    language: app.language ? String(app.language) : null,
    projectPath: app.project.file ? app.project.file.fsName : null,
    numItems: app.project.numItems
  };
};
