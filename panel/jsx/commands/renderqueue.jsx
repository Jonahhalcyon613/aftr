// renderqueue.jsx — Render Queue management (ES3). For queue inspection/setup.
// NOTE: actual rendering is non-blocking via aerender (panel/src/render.js).
// These commands manage the RQ for users who prefer the in-app queue.

var _RQ_STATUS = {};
(function () {
  try {
    _RQ_STATUS[RQItemStatus.QUEUED] = "queued";
    _RQ_STATUS[RQItemStatus.NEEDS_OUTPUT] = "needsOutput";
    _RQ_STATUS[RQItemStatus.UNQUEUED] = "unqueued";
    _RQ_STATUS[RQItemStatus.RENDERING] = "rendering";
    _RQ_STATUS[RQItemStatus.USER_STOPPED] = "stopped";
    _RQ_STATUS[RQItemStatus.ERR_STOPPED] = "error";
    _RQ_STATUS[RQItemStatus.DONE] = "done";
  } catch (e) {}
})();

COMMANDS.addToRenderQueue = function (p) {
  var comp = AEB.requireComp(p);
  return AEB.undo("aftr: addToRenderQueue", function () {
    var rqi = app.project.renderQueue.items.add(comp);
    if (p.settingsTemplate) { try { rqi.applyTemplate(p.settingsTemplate); } catch (e) {} }
    var om = rqi.outputModule(1);
    if (p.outputModuleTemplate) { try { om.applyTemplate(p.outputModuleTemplate); } catch (e) {} }
    if (p.outputPath) om.file = new File(p.outputPath);
    return { rqIndex: rqi.index, comp: comp.name };
  });
};

COMMANDS.listRenderQueue = function () {
  var rq = app.project.renderQueue, out = [];
  for (var i = 1; i <= rq.numItems; i++) {
    var it = rq.item(i);
    var node = { index: i, status: _RQ_STATUS[it.status] || String(it.status) };
    try { node.comp = it.comp.name; } catch (e) {}
    try { node.output = it.outputModule(1).file ? it.outputModule(1).file.fsName : null; } catch (e) {}
    out.push(node);
  }
  return out;
};

COMMANDS.setOutputModule = function (p) {
  AEB.assert(p.rqIndex >= 1, "rqIndex is required");
  return AEB.undo("aftr: setOutputModule", function () {
    var rqi = app.project.renderQueue.item(p.rqIndex);
    var om = rqi.outputModule(p.omIndex || 1);
    if (p.template) { try { om.applyTemplate(p.template); } catch (e) {} }
    if (p.outputPath) om.file = new File(p.outputPath);
    return { ok: true };
  });
};

COMMANDS.clearRenderQueue = function () {
  return AEB.undo("aftr: clearRenderQueue", function () {
    var rq = app.project.renderQueue;
    for (var i = rq.numItems; i >= 1; i--) rq.item(i).remove();
    return { ok: true };
  });
};
