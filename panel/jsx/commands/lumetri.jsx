// lumetri.jsx — friendly Lumetri Color grading (ES3).
// Lumetri's params are opaque matchNames ("ADBE Lumetri-00XX") and several
// share a display name ("Saturation" exists in Basic, Creative, Color Wheels).
// This maps friendly keys to the EXACT matchName so the agent grades with plain
// names: applyLumetri { compId, layer, settings:{ saturation:150, contrast:20 } }.

var _LUMETRI = {
  // Basic Correction
  temperature: "ADBE Lumetri-0007", tint: "ADBE Lumetri-0008",
  saturation: "ADBE Lumetri-0020", exposure: "ADBE Lumetri-0011",
  contrast: "ADBE Lumetri-0012", highlights: "ADBE Lumetri-0013",
  shadows: "ADBE Lumetri-0014", whites: "ADBE Lumetri-0015", blacks: "ADBE Lumetri-0016",
  // Creative
  vibrance: "ADBE Lumetri-0030", sharpen: "ADBE Lumetri-0029",
  creativesaturation: "ADBE Lumetri-0031", fadedfilm: "ADBE Lumetri-0028",
  // Vignette
  vignette: "ADBE Lumetri-0051", vignetteamount: "ADBE Lumetri-0051",
  vignettemidpoint: "ADBE Lumetri-0052", vignetteroundness: "ADBE Lumetri-0053",
  vignettefeather: "ADBE Lumetri-0054"
};

function _findOrAddLumetri(layer) {
  var fx = AEB.effectsGroup(layer);
  AEB.assert(fx, "layer has no effects group");
  for (var i = 1; i <= fx.numProperties; i++) {
    if (fx.property(i).matchName === "ADBE Lumetri") return fx.property(i);
  }
  return fx.addProperty("ADBE Lumetri");
}

var _LUMETRI_SKIP = { compId: 1, comp: 1, compName: 1, layer: 1, layerName: 1, layerIndex: 1, settings: 1, time: 1 };

COMMANDS.applyLumetri = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  var settings = p.settings ? p.settings : p; // accept { settings:{...} } or flat
  return AEB.undo("aftr: applyLumetri", function () {
    var lumetri = _findOrAddLumetri(layer);
    var applied = {}, skipped = [];
    for (var key in settings) {
      if (!settings.hasOwnProperty(key)) continue;
      if (_LUMETRI_SKIP[key]) continue;
      var mn = _LUMETRI[String(key).toLowerCase()];
      if (!mn) { skipped.push(key); continue; }
      try {
        var prop = lumetri.property(mn);
        if (p.time !== undefined) prop.setValueAtTime(p.time, settings[key]);
        else prop.setValue(settings[key]);
        applied[key] = settings[key];
      } catch (e) { skipped.push(key + "(" + e.toString() + ")"); }
    }
    return { effectIndex: lumetri.propertyIndex, applied: applied, skipped: skipped };
  });
};

// Discoverability: list the friendly Lumetri keys the bridge understands.
COMMANDS.lumetriParams = function () {
  var keys = [];
  for (var k in _LUMETRI) { if (_LUMETRI.hasOwnProperty(k)) keys.push(k); }
  return { params: keys };
};
