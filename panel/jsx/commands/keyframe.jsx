// keyframe.jsx — keyframe + interpolation primitives (ES3). HLD §8.6-8.7.

function _kfDims(prop) {
  var v = prop.value;
  return (v && v.length !== undefined && typeof v !== "string") ? v.length : 1;
}

COMMANDS.setKeyframe = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.time !== undefined, "time is required");
  AEB.assert(p.value !== undefined, "value is required");
  return AEB.undo("aftr: setKeyframe", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    prop.setValueAtTime(p.time, p.value);
    return { ok: true, numKeys: prop.numKeys };
  });
};

// Bulk keyframes in one call (faster). times[] + values[] parallel arrays.
COMMANDS.setKeyframes = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.times && p.times.length, "times[] is required");
  AEB.assert(p.values && p.values.length === p.times.length, "values[] must match times[]");
  return AEB.undo("aftr: setKeyframes", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    prop.setValuesAtTimes(p.times, p.values);
    // optional easing applied left->right after all keys exist (HLD gotcha)
    if (p.easyEase) {
      for (var k = 1; k <= prop.numKeys; k++) {
        var e = AEB.makeEases(prop, 33.3333, 33.3333, 0, 0);
        prop.setInterpolationTypeAtKey(k, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        prop.setTemporalEaseAtKey(k, e.inA, e.outA);
      }
    }
    return { ok: true, numKeys: prop.numKeys };
  });
};

COMMANDS.setEase = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.keyIndex >= 1, "keyIndex (1-based) is required");
  var inInf = (p.inInfluence !== undefined) ? p.inInfluence : 33.3333;
  var outInf = (p.outInfluence !== undefined) ? p.outInfluence : 33.3333;
  var inSpeed = p.inSpeed || 0, outSpeed = p.outSpeed || 0;
  return AEB.undo("aftr: setEase", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    var e = AEB.makeEases(prop, inInf, outInf, inSpeed, outSpeed);
    prop.setInterpolationTypeAtKey(p.keyIndex, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    prop.setTemporalEaseAtKey(p.keyIndex, e.inA, e.outA);
    return { ok: true };
  });
};

COMMANDS.setInterpolation = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.keyIndex >= 1, "keyIndex (1-based) is required");
  var map = {
    linear: KeyframeInterpolationType.LINEAR,
    bezier: KeyframeInterpolationType.BEZIER,
    hold: KeyframeInterpolationType.HOLD
  };
  var inT = map[String(p.inType || "linear").toLowerCase()] || KeyframeInterpolationType.LINEAR;
  var outT = map[String(p.outType || p.inType || "linear").toLowerCase()] || inT;
  return AEB.undo("aftr: setInterpolation", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    prop.setInterpolationTypeAtKey(p.keyIndex, inT, outT);
    return { ok: true };
  });
};

COMMANDS.removeKeyframes = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: removeKeyframes", function () {
    var prop = AEB.resolveProperty(layer, p.property);
    while (prop.numKeys > 0) prop.removeKey(1);
    return { ok: true };
  });
};
