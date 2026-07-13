// plugins.jsx — friendly wrappers for installed third-party effects (ES3).
//
// Deep Glow 2 (Plugin Everything, matchName "PEDG2") and Shadow Studio 3
// ("PESS3") both REUSE display names internally ("Enable", "Blend Mode",
// "Opacity", "Renderer" appear many times), so their params must be set by
// stable matchName, not display name. The friendly->matchName maps below were
// captured live with `introspectEffect`; re-run it if the plugin version bumps
// (the maps are versioned: Deep Glow 2 v1.1.0, Shadow Studio 3 v1.0.0).

// Color props on these plugins are 4-component RGBA (0..1). normColor gives RGB;
// append alpha so setValue gets the shape it expects.
function _color4(c) {
  var n = AEB.normColor(c);
  var a = (c && c.length >= 4) ? c[3] : 1;
  return [n[0], n[1], n[2], a];
}

// Add an effect by matchName, or reuse the first existing instance on the layer
// (so re-applying tweaks the same effect instead of stacking duplicates).
function _ensureEffect(layer, matchName, displayName) {
  var grp = AEB.effectsGroup(layer);
  for (var i = 1; i <= grp.numProperties; i++) {
    if (grp.property(i).matchName === matchName) return grp.property(i);
  }
  if (grp.canAddProperty(matchName)) return grp.addProperty(matchName);
  AEB.assert(grp.canAddProperty(displayName),
    (displayName || matchName) + " is not installed (check Effect Manager / re-run introspectEffect)");
  return grp.addProperty(displayName);
}

// Set { matchName: value } pairs on an effect; skips params that don't resolve.
function _applyParamMap(fx, pairs) {
  var applied = [];
  for (var mn in pairs) {
    if (!pairs.hasOwnProperty(mn)) continue;
    try {
      var pr = fx.property(mn);
      if (pr) { pr.setValue(pairs[mn]); applied.push(mn); }
    } catch (e) {}
  }
  return applied;
}

// Build the matchName->value payload from a friendly map + the params object.
function _collectPairs(p, friendlyMap) {
  var pairs = {};
  for (var k in friendlyMap) {
    if (friendlyMap.hasOwnProperty(k) && p[k] !== undefined) pairs[friendlyMap[k]] = p[k];
  }
  if (p.params) { for (var rp in p.params) if (p.params.hasOwnProperty(rp)) pairs[rp] = p.params[rp]; }
  return pairs;
}

// --- Deep Glow 2 (PEDG2) ----------------------------------------------------
var _DEEPGLOW = {
  radius: "PEDG2-0017", exposure: "PEDG2-0018", threshold: "PEDG2-0020",
  thresholdSmooth: "PEDG2-0021", glowMode: "PEDG2-0103", blendMode: "PEDG2-0024",
  saturationBias: "PEDG2-0096"
};

COMMANDS.deepGlow = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: deepGlow", function () {
    var fx = _ensureEffect(layer, "PEDG2", "Deep Glow 2");
    var pairs = _collectPairs(p, _DEEPGLOW);
    // a `color` enables the Tint section and sets the glow color
    if (p.color !== undefined) {
      pairs["PEDG2-0041"] = 1;                 // Tint > Enable
      pairs["PEDG2-0042"] = _color4(p.color);  // Color (inner)
      if (p.colorOuter !== undefined) pairs["PEDG2-0066"] = _color4(p.colorOuter);
      if (p.tintStrength !== undefined) pairs["PEDG2-0044"] = p.tintStrength;
      if (p.tintMode !== undefined) pairs["PEDG2-0043"] = p.tintMode;
    }
    var applied = _applyParamMap(fx, pairs);
    return { matchName: "PEDG2", effectName: fx.name, layer: layer.name, applied: applied };
  });
};

// --- Shadow Studio 3 (PESS3) ------------------------------------------------
var _SHADOWSTUDIO = {
  lightType: "PESS3-0001", lightDirection: "PESS3-0002", angle: "PESS3-0002",
  lightOrigin: "PESS3-0003", shadowLength: "PESS3-0004", length: "PESS3-0004",
  lightRadius: "PESS3-0005", softness: "PESS3-0075", opacityStart: "PESS3-0008",
  opacityEnd: "PESS3-0009", innerShadow: "PESS3-0069", samples: "PESS3-0022",
  qualityPreset: "PESS3-0023", shadowOpacity: "PESS3-0038", sourceOpacity: "PESS3-0026"
};

COMMANDS.shadowStudio = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: shadowStudio", function () {
    var fx = _ensureEffect(layer, "PESS3", "Shadow Studio 3");
    var pairs = _collectPairs(p, _SHADOWSTUDIO);
    if (p.color !== undefined) pairs["PESS3-0006"] = _color4(p.color);
    var applied = _applyParamMap(fx, pairs);
    return { matchName: "PESS3", effectName: fx.name, layer: layer.name, applied: applied };
  });
};
