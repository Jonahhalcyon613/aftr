// mask.jsx — masks (ES3).
// NOTE: AE enum constants (MaskMode, etc.) are referenced lazily inside
// functions, never at top level, so the bundle still loads in the headless
// simulator (which has no AE constants).

function _maskMode(s) {
  s = String(s || "add").toLowerCase();
  if (s === "none") return MaskMode.NONE;
  if (s === "subtract") return MaskMode.SUBTRACT;
  if (s === "intersect") return MaskMode.INTERSECT;
  if (s === "lighten") return MaskMode.LIGHTEN;
  if (s === "darken") return MaskMode.DARKEN;
  if (s === "difference") return MaskMode.DIFFERENCE;
  return MaskMode.ADD;
}

COMMANDS.addMask = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: addMask", function () {
    var masks = layer.property("ADBE Mask Parade");
    var mask = masks.addProperty("ADBE Mask Atom");
    if (p.name) mask.name = p.name;
    if (p.mode) mask.maskMode = _maskMode(p.mode);
    if (p.vertices) {
      var s = new Shape();
      s.vertices = p.vertices;
      if (p.inTangents) s.inTangents = p.inTangents;
      if (p.outTangents) s.outTangents = p.outTangents;
      s.closed = (p.closed !== false);
      mask.property("ADBE Mask Shape").setValue(s);
    }
    if (p.opacity !== undefined) mask.property("ADBE Mask Opacity").setValue(p.opacity);
    if (p.feather !== undefined) {
      var fe = (p.feather.length !== undefined) ? p.feather : [p.feather, p.feather];
      mask.property("ADBE Mask Feather").setValue(fe);
    }
    if (p.expansion !== undefined) mask.property("ADBE Mask Offset").setValue(p.expansion);
    if (p.inverted !== undefined) mask.inverted = !!p.inverted;
    return { maskIndex: mask.propertyIndex, name: mask.name };
  });
};

// Rectangular mask convenience.
COMMANDS.addRectMask = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var x = (p.left !== undefined) ? p.left : 0;
  var y = (p.top !== undefined) ? p.top : 0;
  var w = (p.width !== undefined) ? p.width : comp.width;
  var h = (p.height !== undefined) ? p.height : comp.height;
  return AEB.undo("aftr: addRectMask", function () {
    var masks = layer.property("ADBE Mask Parade");
    var mask = masks.addProperty("ADBE Mask Atom");
    if (p.name) mask.name = p.name;
    var s = new Shape();
    s.vertices = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    s.closed = true;
    mask.property("ADBE Mask Shape").setValue(s);
    if (p.feather !== undefined) mask.property("ADBE Mask Feather").setValue([p.feather, p.feather]);
    return { maskIndex: mask.propertyIndex, name: mask.name };
  });
};

COMMANDS.setMaskProperty = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.maskIndex >= 1 || p.maskName, "maskIndex or maskName is required");
  AEB.assert(p.property, "property is required");
  return AEB.undo("aftr: setMaskProperty", function () {
    var masks = layer.property("ADBE Mask Parade");
    var mask = p.maskName ? masks.property(p.maskName) : masks.property(p.maskIndex);
    AEB.assert(mask, "mask not found");
    var key = String(p.property).toLowerCase();
    if (key === "mode") mask.maskMode = _maskMode(p.value);
    else if (key === "inverted") mask.inverted = !!p.value;
    else if (key === "opacity") mask.property("ADBE Mask Opacity").setValue(p.value);
    else if (key === "feather") mask.property("ADBE Mask Feather").setValue((p.value.length !== undefined) ? p.value : [p.value, p.value]);
    else if (key === "expansion") mask.property("ADBE Mask Offset").setValue(p.value);
    else throw new Error("unknown mask property: " + p.property);
    return { ok: true };
  });
};
