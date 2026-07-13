// fire.jsx — one-call realistic fire effect (ES3).
// Builds the full out-of-the-box fire stack: animated Fractal Noise flame +
// Turbulent Displace + CC Toner colorize + feathered flame mask, plus rising
// embers (sparse high-contrast noise, Add) and an ambient warm glow, topped by
// a Glow adjustment layer. All matchNames/expressions are encapsulated here.

function _fireNoise(comp, name, cfg) {
  var W = comp.width, H = comp.height;
  var L = comp.layers.addSolid([0, 0, 0], name, W, H, 1);
  var fn = L.property("ADBE Effect Parade").addProperty("ADBE Fractal Noise");
  fn.property("ADBE Fractal Noise-0004").setValue(cfg.contrast);     // Contrast
  fn.property("ADBE Fractal Noise-0005").setValue(cfg.brightness);   // Brightness
  if (cfg.scaleW) {
    fn.property("ADBE Fractal Noise-0009").setValue(0);              // Uniform Scaling off
    fn.property("ADBE Fractal Noise-0011").setValue(cfg.scaleW);     // Scale Width
    fn.property("ADBE Fractal Noise-0012").setValue(cfg.scaleH);     // Scale Height
  } else {
    fn.property("ADBE Fractal Noise-0010").setValue(cfg.scale);      // Scale
  }
  fn.property("ADBE Fractal Noise-0015").setValue(cfg.complexity || 6); // Complexity
  fn.property("ADBE Fractal Noise-0023").expression = "time*" + (cfg.evo || 120); // Evolution
  fn.property("ADBE Fractal Noise-0013").expression =                 // Offset Turbulence (rise)
    "[thisComp.width/2, thisComp.height/2 - time*" + (cfg.rise || 500) + "]";
  return L;
}

function _ccToner(layer, hi, mid, sh) {
  var t = layer.property("ADBE Effect Parade").addProperty("CC Toner");
  try { t.property("Highlights").setValue(hi); } catch (e) {}
  try { t.property("Midtones").setValue(mid); } catch (e) {}
  try { t.property("Shadows").setValue(sh); } catch (e) {}
  return t;
}

function _flameMask(layer, cx, cy, w, h, feather) {
  var hw = w * 0.5;
  var verts = [[cx, cy - h * 0.58], [cx + hw, cy + h * 0.02], [cx, cy + h * 0.42], [cx - hw, cy + h * 0.02]];
  var inT = [[-hw * 0.28, h * 0.22], [hw * 0.12, -h * 0.36], [hw * 0.62, 0], [-hw * 0.12, h * 0.36]];
  var outT = [[hw * 0.28, h * 0.22], [-hw * 0.12, h * 0.36], [-hw * 0.62, 0], [hw * 0.12, -h * 0.36]];
  var m = layer.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
  var s = new Shape(); s.vertices = verts; s.inTangents = inT; s.outTangents = outT; s.closed = true;
  m.property("ADBE Mask Shape").setValue(s);
  m.property("ADBE Mask Feather").setValue([feather, feather]);
  return m;
}

COMMANDS.fireEffect = function (p) {
  var comp = AEB.requireComp(p);
  var W = comp.width, H = comp.height, minWH = Math.min(W, H);
  var center = p.center || [W / 2, H * 0.62];
  var size = (p.size !== undefined) ? p.size : 1;
  var w = (p.width || W * 0.34) * size;
  var h = (p.height || H * 0.62) * size;
  var cx = center[0], cy = center[1];
  var pre = p.prefix || "fire_";

  return AEB.undo("aftr: fireEffect", function () {
    var made = [];

    // ambient warm glow (will end up at the bottom of the fire layers)
    var amb = comp.layers.addSolid([1, 0.35, 0.05], pre + "ambient", W, H, 1);
    _flameMask(amb, cx, cy + h * 0.05, w * 1.2, h * 0.8, minWH * 0.16);
    amb.blendingMode = BlendingMode.ADD;
    amb.property("Transform").property("Opacity").setValue(p.ambient !== undefined ? p.ambient : 40);
    made.push(amb.name);

    // main flame
    var fire = _fireNoise(comp, pre + "flame", { contrast: 270, brightness: -50, scaleW: 55, scaleH: 210, complexity: 6, evo: 130, rise: 560 });
    var td = fire.property("ADBE Effect Parade").addProperty("ADBE Turbulent Displace");
    try { td.property("Amount").setValue(35); td.property("Size").setValue(45); td.property("Evolution").expression = "time*90"; } catch (e) {}
    _ccToner(fire, p.highlight || [1, 0.95, 0.55], p.midtone || [1, 0.42, 0.02], [0, 0, 0]);
    _flameMask(fire, cx, cy, w, h, minWH * 0.065);
    fire.motionBlur = true;
    made.push(fire.name);

    // embers / sparks
    if (p.embers !== false) {
      var em = _fireNoise(comp, pre + "embers", { contrast: 750, brightness: -185, scale: 14, complexity: 6, evo: 220, rise: 1050 });
      _ccToner(em, [1, 0.95, 0.7], [1, 0.6, 0.12], [0, 0, 0]);
      _flameMask(em, cx, cy, w * 1.25, h * 1.05, minWH * 0.085);
      em.blendingMode = BlendingMode.ADD;
      em.property("Transform").property("Opacity").setValue(85);
      made.push(em.name);
    }

    // glow adjustment (top)
    var glowAdj = comp.layers.addSolid([1, 1, 1], pre + "glow", W, H, 1);
    glowAdj.adjustmentLayer = true;
    var glow = glowAdj.property("ADBE Effect Parade").addProperty("ADBE Glo2");
    try { glow.property("Glow Radius").setValue(p.glowRadius || 60); glow.property("Glow Intensity").setValue(p.glowIntensity || 1.8); } catch (e) {}
    made.push(glowAdj.name);

    if (p.compMotionBlur !== false) comp.motionBlur = true;
    return { layers: made, center: [cx, cy], width: w, height: h };
  });
};
