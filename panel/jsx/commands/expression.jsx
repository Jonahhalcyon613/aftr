// expression.jsx — expression primitives (ES3). HLD §8.9 / §9.
// Expressions define per-frame behavior; the bridge writes the string onto a
// property. A broken expression disables itself on that property (non-fatal).

COMMANDS.setExpression = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.expression !== undefined, "expression is required");
  return AEB.undo("aftr: setExpression", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    prop.expression = p.expression;
    if (p.enabled === false) prop.expressionEnabled = false;
    return { ok: true, expressionEnabled: prop.expressionEnabled };
  });
};

COMMANDS.removeExpression = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: removeExpression", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    prop.expression = "";
    return { ok: true };
  });
};

COMMANDS.enableExpression = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: enableExpression", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    prop.expressionEnabled = (p.enabled !== false);
    return { ok: true, expressionEnabled: prop.expressionEnabled };
  });
};
