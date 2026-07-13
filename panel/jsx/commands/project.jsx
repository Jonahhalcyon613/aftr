// project.jsx — project-level queries (ES3).
// Each function receives a params object and returns a plain serializable result.

COMMANDS.ping = function () {
  return { pong: true, ae: app.version };
};

COMMANDS.getProjectInfo = function () {
  var p = app.project;
  var active = null;
  if (p.activeItem && p.activeItem instanceof CompItem) {
    active = p.activeItem.name;
  }
  return {
    name: (p.file ? p.file.name : "Untitled"),
    path: (p.file ? p.file.fsName : null),
    numItems: p.numItems,
    activeComp: active
  };
};

function _findItem(p) {
  var proj = app.project;
  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if ((p.itemId !== undefined && it.id === p.itemId) || (p.itemName && it.name === p.itemName)) return it;
  }
  return null;
}

COMMANDS.createFolder = function (p) {
  return AEB.undo("aftr: createFolder", function () {
    var folder = app.project.items.addFolder(p.name || "Folder");
    return { id: folder.id, name: folder.name };
  });
};

COMMANDS.moveToFolder = function (p) {
  var item = _findItem(p);
  AEB.assert(item, "item not found (itemId/itemName)");
  var proj = app.project, folder = null;
  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if (it instanceof FolderItem && ((p.folderId !== undefined && it.id === p.folderId) || (p.folderName && it.name === p.folderName))) { folder = it; break; }
  }
  AEB.assert(folder, "folder not found (folderId/folderName)");
  return AEB.undo("aftr: moveToFolder", function () {
    item.parentFolder = folder;
    return { ok: true };
  });
};

COMMANDS.setProxy = function (p) {
  var item = _findItem(p);
  AEB.assert(item, "item not found (itemId/itemName)");
  AEB.assert(p.path, "path is required");
  return AEB.undo("aftr: setProxy", function () {
    item.setProxy(new File(p.path));
    return { ok: true };
  });
};

COMMANDS.renameItem = function (p) {
  var item = _findItem(p);
  AEB.assert(item, "item not found (itemId/itemName)");
  AEB.assert(p.name, "name is required");
  return AEB.undo("aftr: renameItem", function () {
    item.name = p.name;
    return { ok: true, id: item.id, name: item.name };
  });
};

COMMANDS.deleteItem = function (p) {
  var item = _findItem(p);
  AEB.assert(item, "item not found (itemId/itemName)");
  return AEB.undo("aftr: deleteItem", function () {
    var n = item.name; item.remove();
    return { ok: true, removed: n };
  });
};
