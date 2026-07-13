// effect.jsx — effects (ES3). HLD §8.8. Prefer matchName (locale-independent).

function _resolveEffect(layer, ref) {
  var fx = AEB.effectsGroup(layer);
  AEB.assert(fx, "layer has no effects group");
  if (typeof ref === "number") {
    AEB.assert(ref >= 1 && ref <= fx.numProperties, "effect index out of range");
    return fx.property(ref);
  }
  // by name or matchName
  var byName = null;
  try { byName = fx.property(ref); } catch (e) {}
  if (byName) return byName;
  for (var i = 1; i <= fx.numProperties; i++) {
    var e = fx.property(i);
    if (e.matchName === ref || e.name === ref) return e;
  }
  throw new Error('Effect "' + ref + '" not found on layer');
}

COMMANDS.addEffect = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var ref = p.matchName || p.effectName || p.effect;
  AEB.assert(ref, "matchName or effectName is required");
  return AEB.undo("aftr: addEffect", function () {
    var fx = AEB.effectsGroup(layer);
    AEB.assert(fx.canAddProperty(ref), 'Cannot add effect "' + ref + '" (bad matchName or unsupported)');
    var added = fx.addProperty(ref);
    if (p.name) added.name = p.name;
    // optional initial params: { "Amount to Tint": 35, ... }
    if (p.params) {
      for (var k in p.params) {
        if (p.params.hasOwnProperty(k)) {
          try { added.property(k).setValue(p.params[k]); } catch (e) {}
        }
      }
    }
    return { effectIndex: added.propertyIndex, name: added.name, matchName: added.matchName };
  });
};

COMMANDS.setEffectParam = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(p.effect !== undefined, "effect (name/index/matchName) is required");
  AEB.assert(p.param !== undefined, "param (name/index) is required");
  AEB.assert(p.value !== undefined, "value is required");
  return AEB.undo("aftr: setEffectParam", function () {
    var effect = _resolveEffect(layer, p.effect);
    var param = (typeof p.param === "number") ? effect.property(p.param) : effect.property(p.param);
    AEB.assert(param, "param not found: " + p.param);
    if (p.time !== undefined) param.setValueAtTime(p.time, p.value);
    else param.setValue(p.value);
    return { ok: true };
  });
};

COMMANDS.listEffects = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var fx = AEB.effectsGroup(layer);
  var out = [];
  if (fx) {
    for (var i = 1; i <= fx.numProperties; i++) {
      var e = fx.property(i);
      out.push({ index: e.propertyIndex, name: e.name, matchName: e.matchName });
    }
  }
  return out;
};

// Expression Control = a tunable parameter the agent can drive via expressions.
COMMANDS.addExpressionControl = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var T = String(p.controlType || "slider").toLowerCase();
  var MN = {
    slider: "ADBE Slider Control", point: "ADBE Point Control",
    color: "ADBE Color Control", checkbox: "ADBE Checkbox Control",
    angle: "ADBE Angle Control", layer: "ADBE Layer Control", point3d: "ADBE Point3D Control"
  };
  var matchName = MN[T];
  AEB.assert(matchName, "unknown controlType: " + p.controlType);
  return AEB.undo("aftr: addExpressionControl", function () {
    var fx = AEB.effectsGroup(layer);
    var ctrl = fx.addProperty(matchName);
    if (p.name) ctrl.name = p.name;
    if (p.value !== undefined) {
      try { ctrl.property(1).setValue(p.value); } catch (e) {}
    }
    return { effectIndex: ctrl.propertyIndex, name: ctrl.name, matchName: ctrl.matchName };
  });
};
