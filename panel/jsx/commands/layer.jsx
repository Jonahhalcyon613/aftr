// layer.jsx — layer creation + manipulation (ES3). Uses AEB.* helpers.

// --- creation --------------------------------------------------------------
COMMANDS.addSolid = function (p) {
  var comp = AEB.requireComp(p);
  var name = p.name || "Solid";
  var color = AEB.normColor(p.color);
  var w = p.width || comp.width, h = p.height || comp.height;
  return AEB.undo("aftr: addSolid", function () {
    var layer = comp.layers.addSolid(color, name, w, h, 1);
    return AEB.layerInfo(layer);
  });
};

COMMANDS.addTextLayer = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(p.text, "text is required");
  return AEB.undo("aftr: addTextLayer", function () {
    var layer = comp.layers.addText(p.text);
    if (p.fontSize || p.fillColor || p.font || p.justification !== undefined) {
      var tp = layer.property("Source Text");
      var td = tp.value;
      if (p.fontSize) td.fontSize = p.fontSize;
      if (p.font) td.font = p.font;
      if (p.fillColor) { td.applyFill = true; td.fillColor = AEB.normColor(p.fillColor); }
      if (p.justification !== undefined) {
        // 0 left, 1 right, 2 center
        var J = [ParagraphJustification.LEFT_JUSTIFY, ParagraphJustification.RIGHT_JUSTIFY, ParagraphJustification.CENTER_JUSTIFY];
        td.justification = J[p.justification] || J[0];
      }
      tp.setValue(td);
    }
    if (p.position) layer.property("Transform").property("Position").setValue(p.position);
    // Set the name LAST: changing a text layer's source text re-links its name
    // to the text, so a manual rename must come after.
    if (p.name) layer.name = p.name;
    return AEB.layerInfo(layer);
  });
};

COMMANDS.addNull = function (p) {
  var comp = AEB.requireComp(p);
  return AEB.undo("aftr: addNull", function () {
    var layer = comp.layers.addNull(p.duration || comp.duration);
    if (p.name) layer.name = p.name;
    return AEB.layerInfo(layer);
  });
};

COMMANDS.addAdjustmentLayer = function (p) {
  var comp = AEB.requireComp(p);
  return AEB.undo("aftr: addAdjustmentLayer", function () {
    var solid = comp.layers.addSolid([1, 1, 1], p.name || "Adjustment", comp.width, comp.height, 1);
    solid.adjustmentLayer = true;
    return AEB.layerInfo(solid);
  });
};

COMMANDS.addCamera = function (p) {
  var comp = AEB.requireComp(p);
  var center = p.center || [comp.width / 2, comp.height / 2];
  return AEB.undo("aftr: addCamera", function () {
    var layer = comp.layers.addCamera(p.name || "Camera", center);
    return AEB.layerInfo(layer);
  });
};

COMMANDS.addLight = function (p) {
  var comp = AEB.requireComp(p);
  var center = p.center || [comp.width / 2, comp.height / 2];
  return AEB.undo("aftr: addLight", function () {
    var layer = comp.layers.addLight(p.name || "Light", center);
    if (p.lightType !== undefined) {
      var T = [LightType.PARALLEL, LightType.SPOT, LightType.POINT, LightType.AMBIENT];
      layer.lightType = T[p.lightType] || LightType.POINT;
    }
    return AEB.layerInfo(layer);
  });
};

COMMANDS.addShape = function (p) {
  var comp = AEB.requireComp(p);
  return AEB.undo("aftr: addShape", function () {
    var layer = comp.layers.addShape();
    if (p.name) layer.name = p.name;
    var contents = layer.property("ADBE Root Vectors Group");
    var grp = contents.addProperty("ADBE Vector Group");
    var shapeGroup = grp.property("ADBE Vectors Group");
    var kind = (p.shape || "rectangle").toLowerCase();
    if (kind === "ellipse") shapeGroup.addProperty("ADBE Vector Shape - Ellipse");
    else shapeGroup.addProperty("ADBE Vector Shape - Rect");
    var size = p.size || [200, 200];
    try {
      var shp = (kind === "ellipse")
        ? shapeGroup.property("ADBE Vector Shape - Ellipse").property("ADBE Vector Ellipse Size")
        : shapeGroup.property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size");
      shp.setValue(size);
    } catch (e) {}
    if (p.fillColor) {
      var fill = shapeGroup.addProperty("ADBE Vector Graphic - Fill");
      fill.property("ADBE Vector Fill Color").setValue(AEB.normColor(p.fillColor));
    }
    if (p.strokeColor) {
      var stroke = shapeGroup.addProperty("ADBE Vector Graphic - Stroke");
      stroke.property("ADBE Vector Stroke Color").setValue(AEB.normColor(p.strokeColor));
      if (p.strokeWidth) stroke.property("ADBE Vector Stroke Width").setValue(p.strokeWidth);
    }
    return AEB.layerInfo(layer);
  });
};

// Shape layer with a custom bezier path (vertices + tangents). For flames,
// teardrops, blobs, custom logos, etc.
COMMANDS.addPathShape = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(p.vertices && p.vertices.length, "vertices[] is required");
  return AEB.undo("aftr: addPathShape", function () {
    var layer = comp.layers.addShape();
    if (p.name) layer.name = p.name;
    var contents = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group").property("ADBE Vectors Group");
    var pathGroup = contents.addProperty("ADBE Vector Shape - Group");
    var s = new Shape();
    s.vertices = p.vertices;
    if (p.inTangents) s.inTangents = p.inTangents;
    if (p.outTangents) s.outTangents = p.outTangents;
    s.closed = (p.closed !== false);
    pathGroup.property("ADBE Vector Shape").setValue(s);
    if (p.fillColor) {
      contents.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(AEB.normColor(p.fillColor));
    }
    if (p.strokeColor) {
      var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
      stroke.property("ADBE Vector Stroke Color").setValue(AEB.normColor(p.strokeColor));
      if (p.strokeWidth) stroke.property("ADBE Vector Stroke Width").setValue(p.strokeWidth);
    }
    if (p.position) layer.property("Transform").property("Position").setValue(p.position);
    return AEB.layerInfo(layer);
  });
};

// Add an existing project footage/comp item into a comp as a layer.
COMMANDS.addFootageLayer = function (p) {
  var comp = AEB.requireComp(p);
  var src = null, proj = app.project;
  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if ((p.itemId !== undefined && it.id === p.itemId) || (p.itemName && it.name === p.itemName)) { src = it; break; }
  }
  AEB.assert(src, "Source item not found (itemId/itemName)");
  return AEB.undo("aftr: addFootageLayer", function () {
    var layer = comp.layers.add(src);
    if (p.name) layer.name = p.name;
    if (p.startTime !== undefined) layer.startTime = p.startTime;
    return AEB.layerInfo(layer);
  });
};

// --- manipulation ----------------------------------------------------------
COMMANDS.setLayerProperty = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.property, "property is required");
  AEB.assert(p.value !== undefined, "value is required");
  return AEB.undo("aftr: setLayerProperty", function () {
    var key = String(p.property).toLowerCase();
    if (key === "name") layer.name = p.value;
    else if (key === "enabled") layer.enabled = !!p.value;
    else if (key === "starttime") layer.startTime = p.value;
    else if (key === "inpoint") layer.inPoint = p.value;
    else if (key === "outpoint") layer.outPoint = p.value;
    else if (key === "shy") layer.shy = !!p.value;
    else if (key === "solo") layer.solo = !!p.value;
    else if (key === "label") layer.label = p.value;
    else if (key === "threed" || key === "threedlayer") layer.threeDLayer = !!p.value;
    else {
      var prop = AEB.resolveProperty(layer, p.property);
      prop.setValue(p.value);
    }
    return { ok: true };
  });
};

COMMANDS.setParent = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: setParent", function () {
    if (p.parent === null || p.parentName === null) { layer.parent = null; return { ok: true }; }
    var parentRef = (p.parent !== undefined) ? p.parent : p.parentName;
    layer.parent = AEB.resolveLayer(comp, parentRef);
    return { ok: true };
  });
};

COMMANDS.trimLayer = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: trimLayer", function () {
    if (p.inPoint !== undefined) layer.inPoint = p.inPoint;
    if (p.outPoint !== undefined) layer.outPoint = p.outPoint;
    if (p.startTime !== undefined) layer.startTime = p.startTime;
    return AEB.layerInfo(layer);
  });
};

COMMANDS.moveLayer = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: moveLayer", function () {
    var to = p.toIndex;
    AEB.assert(to >= 1 && to <= comp.numLayers, "toIndex out of range");
    if (to === 1) layer.moveToBeginning();
    else if (to >= comp.numLayers) layer.moveToEnd();
    else layer.moveBefore(comp.layer(to));
    return AEB.layerInfo(layer);
  });
};

COMMANDS.duplicateLayer = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: duplicateLayer", function () {
    var dup = layer.duplicate();
    if (p.name) dup.name = p.name;
    return AEB.layerInfo(dup);
  });
};

COMMANDS.deleteLayer = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: deleteLayer", function () {
    var name = layer.name;
    layer.remove();
    return { ok: true, removed: name };
  });
};

COMMANDS.getLayers = function (p) {
  var comp = AEB.requireComp(p);
  var out = [];
  for (var i = 1; i <= comp.numLayers; i++) out.push(AEB.layerInfo(comp.layer(i)));
  return out;
};

var _BLEND = {
  normal: "NORMAL", multiply: "MULTIPLY", screen: "SCREEN", overlay: "OVERLAY",
  add: "ADD", lighten: "LIGHTEN", darken: "DARKEN", difference: "DIFFERENCE",
  softlight: "SOFT_LIGHT", hardlight: "HARD_LIGHT", colordodge: "CLASSIC_COLOR_DODGE",
  colorburn: "CLASSIC_COLOR_BURN", hue: "HUE", saturation: "SATURATION",
  color: "COLOR", luminosity: "LUMINOSITY", alpha: "ALPHA_ADD"
};
COMMANDS.setBlendMode = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.mode, "mode is required");
  var key = _BLEND[String(p.mode).toLowerCase()];
  AEB.assert(key && BlendingMode[key] !== undefined, "unknown blend mode: " + p.mode);
  return AEB.undo("aftr: setBlendMode", function () {
    layer.blendingMode = BlendingMode[key];
    return { ok: true };
  });
};

var _MATTE = {
  none: "NO_TRACK_MATTE", alpha: "ALPHA", alphainverted: "ALPHA_INVERTED",
  luma: "LUMA", lumainverted: "LUMA_INVERTED"
};
COMMANDS.setTrackMatte = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var key = _MATTE[String(p.type || "alpha").toLowerCase()];
  AEB.assert(key && TrackMatteType[key] !== undefined, "unknown track matte type: " + p.type);
  return AEB.undo("aftr: setTrackMatte", function () {
    // Modern AE: setTrackMatte(layer, type). Fallback to trackMatteType.
    try {
      if (p.matteLayer !== undefined) layer.setTrackMatte(AEB.resolveLayer(comp, p.matteLayer), TrackMatteType[key]);
      else layer.trackMatteType = TrackMatteType[key];
    } catch (e) { layer.trackMatteType = TrackMatteType[key]; }
    return { ok: true };
  });
};

COMMANDS.setLayerFlag = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.flag, "flag is required");
  var key = String(p.flag).toLowerCase();
  var val = (p.value !== false);
  return AEB.undo("aftr: setLayerFlag", function () {
    if (key === "motionblur") layer.motionBlur = val;
    else if (key === "adjustment") layer.adjustmentLayer = val;
    else if (key === "guide") layer.guideLayer = val;
    else if (key === "threed" || key === "3d") layer.threeDLayer = val;
    else if (key === "collapse" || key === "collapsetransformation") layer.collapseTransformation = val;
    else if (key === "solo") layer.solo = val;
    else if (key === "shy") layer.shy = val;
    else if (key === "lock") layer.locked = val;
    else if (key === "frameblending") layer.frameBlending = val;
    else throw new Error("unknown flag: " + p.flag);
    return { ok: true };
  });
};

COMMANDS.addLayerMarker = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.time !== undefined, "time is required");
  return AEB.undo("aftr: addLayerMarker", function () {
    var mv = new MarkerValue(p.comment || "");
    if (p.duration !== undefined) mv.duration = p.duration;
    layer.property("Marker").setValueAtTime(p.time, mv);
    return { ok: true };
  });
};

COMMANDS.setTimeStretch = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.stretch !== undefined, "stretch (percent) is required");
  return AEB.undo("aftr: setTimeStretch", function () {
    layer.stretch = p.stretch;
    return { ok: true, stretch: layer.stretch };
  });
};

COMMANDS.enableTimeRemap = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: enableTimeRemap", function () {
    layer.timeRemapEnabled = (p.enabled !== false);
    return { ok: true };
  });
};

COMMANDS.replaceSource = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var src = null, proj = app.project;
  for (var i = 1; i <= proj.numItems; i++) {
    var it = proj.item(i);
    if ((p.itemId !== undefined && it.id === p.itemId) || (p.itemName && it.name === p.itemName)) { src = it; break; }
  }
  AEB.assert(src, "replacement item not found (itemId/itemName)");
  return AEB.undo("aftr: replaceSource", function () {
    layer.replaceSource(src, (p.fixExpressions !== false));
    return { ok: true };
  });
};
