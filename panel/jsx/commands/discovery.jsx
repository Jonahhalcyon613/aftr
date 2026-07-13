// discovery.jsx — read-only "what's installed" commands (ES3).
// listFonts is solid (postScriptName is authoritative). listInstalledEffects is
// best-effort (probes a known name set). getEnvironment + findEffectMatchName are
// extra discovery helpers. (listPlugins is panel-side — see panel/src/discovery.js.)

// --- listFonts -------------------------------------------------------------
// AE 2024+ exposes app.fonts. In practice the Font object only reveals its
// postScriptName via toString(); family/style are not readable directly, so we
// derive them (and say so). postScriptName is what setTextDocument targets.
function _famStyle(ps) {
  var fam = ps, style = "Regular";
  var dash = ps.lastIndexOf("-");
  if (dash > 0) { fam = ps.substring(0, dash); style = ps.substring(dash + 1); }
  fam = fam.replace(/MT$/, "").replace(/PS$/, "");
  style = style.replace(/MT$/, "");
  if (!style) style = "Regular";
  // de-camel the family a touch ("TimesNewRoman" -> "Times New Roman")
  fam = fam.replace(/([a-z])([A-Z])/g, "$1 $2");
  return { family: fam, style: style };
}

COMMANDS.listFonts = function (p) {
  p = p || {};
  AEB.assert(typeof app.fonts !== "undefined" && app.fonts, "app.fonts is not available (needs AE 2024+)");
  // app.fonts.allFonts is grouped by family: each element is an array of variant
  // Font objects (toString() == that variant's postScriptName). Flatten it.
  var all = app.fonts.allFonts;
  var filter = p.filter ? String(p.filter).toLowerCase() : null;
  var limit = (p.limit !== undefined) ? p.limit : 1000;
  var fonts = [], seen = {}, total = 0;
  for (var i = 0; i < all.length; i++) {
    var grp = all[i];
    var variants = (grp && typeof grp.length === "number") ? grp : [grp];
    for (var j = 0; j < variants.length; j++) {
      var ps = String(variants[j]); // single postScriptName
      if (!ps || seen[ps]) continue;
      seen[ps] = true;
      total++;
      if (filter && ps.toLowerCase().indexOf(filter) < 0) continue;
      if (fonts.length < limit) {
        var fs = _famStyle(ps);
        fonts.push({ postScriptName: ps, family: fs.family, style: fs.style });
      }
    }
  }
  return {
    count: fonts.length, totalInstalled: total, fonts: fonts,
    note: "postScriptName is authoritative; family/style are derived (AE's Font object does not expose them via scripting)."
  };
};

// --- listInstalledEffects --------------------------------------------------
// No global effects API exists. Best-effort: probe a curated set of effect
// display names on a throwaway layer and report which add successfully + their
// matchName (the value addEffect needs). Pass extra names via params.names.
var _COMMON_EFFECTS = [
  "Tint", "Tritone", "Fill", "Colorama", "Hue/Saturation", "Curves", "Levels", "Brightness & Contrast",
  "Exposure", "Color Balance", "Channel Mixer", "Black & White", "Photo Filter", "Lumetri Color",
  "Gaussian Blur", "Fast Box Blur", "Camera Lens Blur", "Directional Blur", "Radial Blur", "Channel Blur",
  "Compound Blur", "Bilateral Blur", "Sharpen", "Unsharp Mask", "Glow", "Drop Shadow", "Bevel Alpha",
  "Bevel Edges", "Roughen Edges", "Find Edges", "Mosaic", "Posterize", "Wave Warp", "Turbulent Displace",
  "Displacement Map", "Bulge", "Twirl", "Ripple", "Corner Pin", "Mesh Warp", "Liquify", "Optics Compensation",
  "Fractal Noise", "Turbulent Noise", "Cell Pattern", "Checkerboard", "Grid", "4-Color Gradient", "Gradient Ramp",
  "Circle", "Ellipse", "Lens Flare", "Beam", "Lightning", "Advanced Lightning", "Audio Spectrum", "Audio Waveform",
  "Stroke", "Vegas", "Write-on", "Scribble", "Radio Waves", "Fast Blur", "Median", "Remove Grain", "Reduce Noise",
  "Cartoon", "Texturize", "Shatter", "Card Dance", "Caustics", "Foam", "Wave World", "Echo", "Time Displacement",
  "Posterize Time", "CC Toner", "CC Light Rays", "CC Light Sweep", "CC Light Burst 2.5", "CC Radial Fast Blur",
  "CC Vector Blur", "CC Particle World", "CC Particle Systems II", "CC Rainfall", "CC Snowfall", "CC Star Burst",
  "CC Mr. Mercury", "CC Pixel Polly", "CC Ball Action", "CC Bubbles", "CC Drizzle", "CC Hair", "CC Mr. Smoothie",
  "CC Scatterize", "CC Threshold", "CC Threshold RGB", "CC Burn Film", "CC Glass", "CC Glass Wipe", "CC Grid Wipe",
  "CC Image Wipe", "CC Jaws", "CC Light Wipe", "CC Line Sweep", "CC Radial ScaleWipe", "CC Scale Wipe", "CC Twister",
  "CC WarpoMatic", "CC Bend It", "CC Bender", "CC Blobbylize", "CC Flo Motion", "CC Griddler", "CC Lens", "CC Page Turn",
  "CC Power Pin", "CC Ripple Pulse", "CC Slant", "CC Smear", "CC Sphere", "CC Split", "CC Split 2", "CC Tiler",
  "CC Kaleida", "CC Mr. Smoothie", "CC RepeTile", "CC Block Load", "CC Force Motion Blur", "CC Wide Time",
  "Linear Wipe", "Radial Wipe", "Venetian Blinds", "Iris Wipe", "Block Dissolve", "Gradient Wipe", "Card Wipe",
  "Vignette", "Magnify", "Mirror", "Offset", "Transform", "Motion Tile", "Polar Coordinates", "Spherize",
  "Invert", "Minimax", "Set Matte", "Set Channels", "Shift Channels", "Solid Composite", "Compound Arithmetic",
  // popular third-party (Plugin Everything) — probed by display name so discovery surfaces them
  "Deep Glow", "Deep Glow 2", "Shadow Studio", "Shadow Studio 2", "Shadow Studio 3"
];

// Session caches: building/removing a temp comp per call is wasteful when agents
// probe repeatedly. The effect set is stable for a session — cache the default
// probe + a name->matchName map; pass refresh:true to rebuild (e.g. after
// installing a plugin mid-session). The cache lives as long as the bundle is
// loaded (a hot-reload or panel reopen clears it).
var _effectsCache = null;     // last default listInstalledEffects result
var _effectMatchMap = null;   // { displayName: matchName } from the default probe

COMMANDS.listInstalledEffects = function (p) {
  p = p || {};
  var extra = (p.names && p.names.length) ? p.names : null;
  // Serve from cache for the default probe (no extra names, no refresh).
  if (_effectsCache && !p.refresh && !extra) {
    var hit = {};
    for (var ck in _effectsCache) if (_effectsCache.hasOwnProperty(ck)) hit[ck] = _effectsCache[ck];
    hit.cached = true;
    return hit;
  }
  var names = extra ? _COMMON_EFFECTS.concat(extra) : _COMMON_EFFECTS;
  var comp = app.project.items.addComp("__discoverFX", 16, 16, 1, 0.1, 30);
  var found = [], probed = 0;
  try {
    var solid = comp.layers.addSolid([0, 0, 0], "s", 16, 16, 1);
    var fx = solid.property("ADBE Effect Parade");
    for (var i = 0; i < names.length; i++) {
      probed++;
      try {
        if (fx && fx.canAddProperty(names[i])) {
          var e = fx.addProperty(names[i]);
          found.push({ name: names[i], matchName: e.matchName });
          e.remove();
        }
      } catch (er) { /* not installed / not addable */ }
    }
  } finally {
    comp.remove();
  }
  var result = {
    count: found.length, probed: probed, effects: found, bestEffort: true, cached: false,
    note: "Best-effort: probes a known set of effect display names (AE has no global effects API). matchName is what addEffect uses. Pass params.names to probe more, refresh:true to rebuild the cache."
  };
  // Only cache the default probe (extra names produce a non-canonical set).
  if (!extra) {
    _effectsCache = result;
    _effectMatchMap = {};
    for (var f = 0; f < found.length; f++) _effectMatchMap[found[f].name] = found[f].matchName;
  }
  return result;
};

// Resolve a single effect display name to its matchName (or null). Uses the
// cached map from listInstalledEffects when available (no temp comp); otherwise
// probes once and folds the answer into the cache.
COMMANDS.findEffectMatchName = function (p) {
  AEB.assert(p && p.name, "name (effect display name) is required");
  if (_effectMatchMap && !p.refresh && _effectMatchMap.hasOwnProperty(p.name)) {
    return { name: p.name, matchName: _effectMatchMap[p.name], installed: true, cached: true };
  }
  var comp = app.project.items.addComp("__findFX", 16, 16, 1, 0.1, 30);
  var matchName = null;
  try {
    var solid = comp.layers.addSolid([0, 0, 0], "s", 16, 16, 1);
    var fx = solid.property("ADBE Effect Parade");
    if (fx && fx.canAddProperty(p.name)) { var e = fx.addProperty(p.name); matchName = e.matchName; e.remove(); }
  } catch (er) { /* not installed */ } finally { comp.remove(); }
  if (matchName && _effectMatchMap) _effectMatchMap[p.name] = matchName; // fold into cache
  return { name: p.name, matchName: matchName, installed: matchName !== null, cached: false };
};

// --- introspectEffect ------------------------------------------------------
// Add an effect (by display name OR matchName) to a throwaway layer and dump
// its full parameter tree: each param's name + matchName (what setValue targets)
// + value type + default value. This is how you wire ANY third-party plugin —
// you learn the exact param matchNames without opening AE. Pass { name } or
// { names:[...] }, optional { depth } (default 2).
function _vtName(vt) {
  try {
    var P = PropertyValueType;
    if (vt === P.NO_VALUE) return "GROUP";
    if (vt === P.OneD) return "OneD";
    if (vt === P.TwoD || vt === P.TwoD_SPATIAL) return "TwoD";
    if (vt === P.ThreeD || vt === P.ThreeD_SPATIAL) return "ThreeD";
    if (vt === P.COLOR) return "Color";
    if (vt === P.LAYER_INDEX) return "LayerIndex";
    if (vt === P.MASK_INDEX) return "MaskIndex";
    if (vt === P.SHAPE) return "Shape";
    if (vt === P.TEXT_DOCUMENT) return "Text";
    if (vt === P.CUSTOM_VALUE) return "Custom";
    if (vt === P.MARKER) return "Marker";
  } catch (e) {}
  return String(vt);
}
function _fxParamTree(prop, depth) {
  var out = [];
  if (depth < 0) return out;
  var n = 0; try { n = prop.numProperties || 0; } catch (e) {}
  for (var i = 1; i <= n; i++) {
    var c; try { c = prop.property(i); } catch (e) { continue; }
    var node = { name: c.name, matchName: c.matchName };
    var cn = 0; try { cn = c.numProperties || 0; } catch (e) {}
    if (cn > 0 && depth > 0) {
      node.children = _fxParamTree(c, depth - 1);
    } else {
      try { if (c.propertyValueType !== undefined) node.valueType = _vtName(c.propertyValueType); } catch (e) {}
      try { node.value = c.value; } catch (e) {}
      try { if (c.expressionEnabled) node.expression = c.expression; } catch (e) {}
    }
    out.push(node);
  }
  return out;
}

COMMANDS.introspectEffect = function (p) {
  p = p || {};
  var names = [];
  if (p.names && p.names.length) names = p.names;
  else if (p.name) names = [p.name];
  AEB.assert(names.length, "name (or names[]) is required");
  var depth = (p.depth !== undefined) ? p.depth : 2;
  var comp = app.project.items.addComp("__introspectFX", 64, 64, 1, 0.2, 30);
  var results = [];
  try {
    var solid = comp.layers.addSolid([0, 0, 0], "s", 64, 64, 1);
    var fx = solid.property("ADBE Effect Parade");
    for (var k = 0; k < names.length; k++) {
      var nm = names[k];
      var entry = { requested: nm, installed: false, matchName: null, paramCount: 0, params: [] };
      try {
        if (fx.canAddProperty(nm)) {
          var e = fx.addProperty(nm);
          entry.installed = true;
          entry.matchName = e.matchName;
          entry.name = e.name;
          try { entry.paramCount = e.numProperties; } catch (er) {}
          entry.params = _fxParamTree(e, depth);
          e.remove();
        }
      } catch (er) { entry.error = String(er); }
      results.push(entry);
    }
  } finally { comp.remove(); }
  return { count: results.length, effects: results };
};

// --- getEnvironment --------------------------------------------------------
COMMANDS.getEnvironment = function () {
  var env = { aeVersion: app.version, buildName: app.buildName };
  try { env.extendScript = $.version; } catch (e) {}
  try { env.os = $.os; } catch (e) {}
  try { env.locale = $.locale; } catch (e) {}
  try { env.language = String(app.isoLanguage); } catch (e) {}
  try { env.fontCount = app.fonts.allFonts.length; } catch (e) {}
  try { env.projectPath = app.project.file ? app.project.file.fsName : null; } catch (e) {}
  try { env.numItems = app.project.numItems; } catch (e) {}
  try { env.memoryInUseMB = Math.round(app.memoryInUse / 1048576); } catch (e) {}
  try { env.availableGPUAccelTypes = String(app.availableGPUAccelTypes); } catch (e) {}
  return env;
};
