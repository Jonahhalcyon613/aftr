// footage.jsx — import + comp-from-footage (ES3). HLD §8.3.

function _itemInfo(item) {
  var info = { id: item.id, name: item.name, typeName: item.typeName };
  try { info.width = item.width; info.height = item.height; } catch (e) {}
  try { info.duration = item.duration; } catch (e) {}
  try { info.frameRate = item.frameRate; } catch (e) {}
  return info;
}

COMMANDS.importFootage = function (p) {
  AEB.assert(p.path, "path is required");
  var f = new File(p.path);
  AEB.assert(f.exists, "file does not exist: " + p.path);
  return AEB.undo("aftr: importFootage", function () {
    var io = new ImportOptions(f);
    if (p.sequence) { try { io.sequence = true; } catch (e) {} }
    var item = app.project.importFile(io);
    if (p.name) item.name = p.name;
    return _itemInfo(item);
  });
};

// Import footage and build a comp that matches it 1:1, base layer pinned to t=0.
COMMANDS.compFromFootage = function (p) {
  AEB.assert(p.path, "path is required");
  var f = new File(p.path);
  AEB.assert(f.exists, "file does not exist: " + p.path);
  return AEB.undo("aftr: compFromFootage", function () {
    var io = new ImportOptions(f);
    var footage = app.project.importFile(io);
    var w = footage.width || p.width || 1920;
    var h = footage.height || p.height || 1080;
    var dur = footage.duration || p.duration || 10;
    var fps = footage.frameRate || p.frameRate || 30;
    var par = 1; try { par = footage.pixelAspect; } catch (e) {}
    var comp = app.project.items.addComp(p.name || footage.name, w, h, par, dur, fps);
    var base = comp.layers.add(footage);
    base.startTime = 0;
    try { comp.displayStartTime = 0; } catch (e) {}
    if (p.baseLayerName) base.name = p.baseLayerName;
    return {
      compId: comp.id, name: comp.name, footageId: footage.id,
      width: w, height: h, duration: dur, frameRate: fps,
      totalFrames: Math.round(dur * fps)
    };
  });
};
