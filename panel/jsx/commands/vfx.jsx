// vfx.jsx — more one-call VFX presets (ES3). Reuses fire.jsx helpers
// (_fireNoise/_ccToner/_flameMask) which are global in the bundle.

// Soft rising smoke (gray Fractal Noise, Screen).
COMMANDS.smokeEffect = function (p) {
  var comp = AEB.requireComp(p);
  var W = comp.width, H = comp.height, minWH = Math.min(W, H);
  var center = p.center || [W / 2, H * 0.55];
  var sw = (p.width || W * 0.5) * (p.size || 1);
  var sh = (p.height || H * 0.7) * (p.size || 1);
  var cx = center[0], cy = center[1], pre = p.prefix || "smoke_";
  return AEB.undo("aftr: smokeEffect", function () {
    var L = _fireNoise(comp, pre + "smoke", { contrast: 45, brightness: 8, scaleW: 130, scaleH: 280, complexity: 4, evo: 45, rise: 190 });
    var tint = L.property("ADBE Effect Parade").addProperty("ADBE Tint");
    try { tint.property("Map Black To").setValue([0, 0, 0]); tint.property("Map White To").setValue(p.color || [0.72, 0.74, 0.8]); } catch (e) {}
    _flameMask(L, cx, cy, sw, sh, minWH * 0.24);
    L.property("Transform").property("Opacity").setValue(p.opacity || 55);
    L.blendingMode = BlendingMode.SCREEN;
    return { layers: [L.name] };
  });
};

// Digital glitch applied to a target layer (displacement + choppy jitter).
COMMANDS.glitchEffect = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: glitchEffect", function () {
    var fx = layer.property("ADBE Effect Parade");
    var td = fx.addProperty("ADBE Turbulent Displace");
    try {
      td.property("Amount").setValue(p.amount || 45);
      td.property("Size").setValue(p.size || 9);
      td.property("Complexity").setValue(2);
      td.property("Evolution").expression = "posterizeTime(14); time*600";
    } catch (e) {}
    var pos = layer.property("Transform").property("Position");
    var amt = (p.shake !== undefined) ? p.shake : 14;
    pos.expression = "posterizeTime(12); v = wiggle(10, " + amt + "); [v[0], value[1]];";
    var op = layer.property("Transform").property("Opacity");
    op.expression = "posterizeTime(12); random() > 0.92 ? 60 : value;";
    return { ok: true };
  });
};

// Cinematic Lumetri grade applied to a layer (delegates to applyLumetri).
COMMANDS.cinematicGrade = function (p) {
  var warm = !!p.warm;
  return COMMANDS.applyLumetri({
    compId: p.compId, layer: p.layer, layerName: p.layerName, layerIndex: p.layerIndex,
    settings: {
      contrast: (p.contrast !== undefined) ? p.contrast : 20,
      saturation: (p.saturation !== undefined) ? p.saturation : 86,
      highlights: 12, shadows: -12, whites: 10, blacks: -10,
      temperature: warm ? 16 : -10, vibrance: 16
    }
  });
};

// Neon look on a shape/text layer: bright fill + colored glow stack.
COMMANDS.neonGlow = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: neonGlow", function () {
    var fx = layer.property("ADBE Effect Parade");
    var g1 = fx.addProperty("ADBE Glo2");
    try { g1.property("Glow Radius").setValue(p.radius || 30); g1.property("Glow Intensity").setValue(2.2); } catch (e) {}
    var g2 = fx.addProperty("ADBE Glo2");
    try { g2.property("Glow Radius").setValue((p.radius || 30) * 3); g2.property("Glow Intensity").setValue(1.4); } catch (e) {}
    layer.motionBlur = true;
    return { ok: true };
  });
};
