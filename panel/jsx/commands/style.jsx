// style.jsx — layer styles (ES3).
// Layer styles are NOT added — every layer already has all 9 style groups as
// DISABLED children of "ADBE Layer Styles" (matchNames "dropShadow/enabled",
// "outerGlow/enabled", ...). "Adding" a style means setting that group .enabled.

var _LAYER_STYLE = {
  dropshadow: "dropShadow/enabled", innershadow: "innerShadow/enabled",
  outerglow: "outerGlow/enabled", innerglow: "innerGlow/enabled",
  bevelemboss: "bevelEmboss/enabled", satin: "chromeFX/enabled",
  coloroverlay: "solidFill/enabled", gradientoverlay: "gradientFill/enabled",
  patternoverlay: "patternFill/enabled", stroke: "frameFX/enabled"
};

COMMANDS.addLayerStyle = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var key = String(p.style || "").toLowerCase();
  var mn = _LAYER_STYLE[key];
  AEB.assert(mn, "unknown style: " + p.style + " (dropShadow|innerShadow|outerGlow|innerGlow|bevelEmboss|satin|colorOverlay|gradientOverlay|patternOverlay|stroke)");
  return AEB.undo("aftr: addLayerStyle", function () {
    var styles = layer.property("ADBE Layer Styles");
    AEB.assert(styles, "layer does not support styles");
    var styleGroup = styles.property(mn);
    AEB.assert(styleGroup, "style group not found: " + mn);
    styleGroup.enabled = true;
    if (p.params) {
      for (var k in p.params) {
        if (p.params.hasOwnProperty(k)) { try { styleGroup.property(k).setValue(p.params[k]); } catch (e) {} }
      }
    }
    return { name: styleGroup.name, matchName: styleGroup.matchName, enabled: styleGroup.enabled };
  });
};

COMMANDS.setLayerStyleEnabled = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var mn = _LAYER_STYLE[String(p.style || "").toLowerCase()];
  AEB.assert(mn, "unknown style: " + p.style);
  return AEB.undo("aftr: setLayerStyleEnabled", function () {
    layer.property("ADBE Layer Styles").property(mn).enabled = (p.enabled !== false);
    return { ok: true };
  });
};
