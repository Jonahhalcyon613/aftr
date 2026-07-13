// executor.jsx — the HLD declarative realization layer (ES3). §10 spec->primitive.
//
// applySpec is idempotent: it wipes a segment's seg{id}_* layers and rebuilds
// them from the spec. State never drifts; a segment is a pure function of its
// spec. The agent only ever edits JSON; this is the only code that touches AE.

// Resolve an effect by DISPLAY NAME or matchName and add it to a group. AE's
// addProperty accepts both, so spec authors can write effect:"Glow" instead of
// the matchName "ADBE Glo2"; canAddProperty validates first for a clear error.
function _addEffectByName(group, nameOrMatch) {
  AEB.assert(group && group.canAddProperty(nameOrMatch),
    "effect not installed or not addable: '" + nameOrMatch + "' (use listInstalledEffects to discover names)");
  return group.addProperty(nameOrMatch);
}

// Apply a treatment's effects:[{ effect|matchName|name, params? }] to a layer.
// Returns [{ requested, matchName }] so the resolution shows up in the manifest.
function _applyEffects(layer, effects) {
  var out = [];
  for (var i = 0; i < effects.length; i++) {
    var e = effects[i];
    var nm = e.effect || e.matchName || e.name;
    if (!nm) continue;
    var fx = _addEffectByName(AEB.effectsGroup(layer), nm);
    if (e.params) {
      for (var k in e.params) {
        if (e.params.hasOwnProperty(k)) { try { fx.property(k).setValue(e.params[k]); } catch (er) {} }
      }
    }
    out.push({ requested: nm, matchName: fx.matchName });
  }
  return out;
}

function _applyAnim(layer, tr) {
  // keyframes: { "position":[{t,v},...], "opacity":[{t,v},...] }
  if (tr.keyframes) {
    for (var pk in tr.keyframes) {
      if (!tr.keyframes.hasOwnProperty(pk)) continue;
      var prop = AEB.resolveProperty(layer, pk);
      var kfs = tr.keyframes[pk];
      var times = [], values = [];
      for (var i = 0; i < kfs.length; i++) { times.push(kfs[i].t); values.push(kfs[i].v); }
      if (times.length) prop.setValuesAtTimes(times, values);
    }
  }
  // ease: { "position": { key:2, in:[0,75], out:[0,75] } } (influence per element)
  if (tr.ease) {
    for (var pe in tr.ease) {
      if (!tr.ease.hasOwnProperty(pe)) continue;
      var ep = AEB.resolveProperty(layer, pe);
      var spec = tr.ease[pe];
      var inInf = (spec["in"] && spec["in"][1] !== undefined) ? spec["in"][1] : 33.3333;
      var outInf = (spec.out && spec.out[1] !== undefined) ? spec.out[1] : 33.3333;
      var e = AEB.makeEases(ep, inInf, outInf, 0, 0);
      var ki = spec.key || 1;
      ep.setInterpolationTypeAtKey(ki, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      ep.setTemporalEaseAtKey(ki, e.inA, e.outA);
    }
  }
  // expression: { "opacity":"linear(time-inPoint,0,0.5,0,100)" }
  if (tr.expression) {
    for (var px in tr.expression) {
      if (!tr.expression.hasOwnProperty(px)) continue;
      AEB.resolveProperty(layer, px).expression = tr.expression[px];
    }
  }
  // static: { "scale":[120,120] }
  if (tr.set) {
    for (var ps in tr.set) {
      if (!tr.set.hasOwnProperty(ps)) continue;
      AEB.resolveProperty(layer, ps).setValue(tr.set[ps]);
    }
  }
}

function _realizeTreatment(comp, prefix, tr, segStart, segEnd) {
  var kind = String(tr.type || "").toLowerCase();
  var name = prefix + (tr.name || kind);

  if (kind === "color_grade") {
    var adj = comp.layers.addSolid([1, 1, 1], name, comp.width, comp.height, 1);
    adj.adjustmentLayer = true;
    var matchName = tr.effect || tr.matchName;
    if (matchName) {
      var fx = _addEffectByName(AEB.effectsGroup(adj), matchName);
      if (tr.params) {
        for (var k in tr.params) {
          if (tr.params.hasOwnProperty(k)) { try { fx.property(k).setValue(tr.params[k]); } catch (e) {} }
        }
      }
    }
    _applyAnim(adj, tr);
    return adj;
  }

  if (kind === "title") {
    var tl = comp.layers.addText(tr.text || "");
    if (tr.fontSize || tr.fillColor || tr.justification !== undefined) {
      var sp = tl.property("Source Text"), doc = sp.value;
      if (tr.fontSize) doc.fontSize = tr.fontSize;
      if (tr.fillColor) { doc.applyFill = true; doc.fillColor = AEB.normColor(tr.fillColor); }
      if (tr.justification !== undefined) {
        var JJ = [ParagraphJustification.LEFT_JUSTIFY, ParagraphJustification.RIGHT_JUSTIFY, ParagraphJustification.CENTER_JUSTIFY];
        doc.justification = JJ[tr.justification] || JJ[0];
      }
      sp.setValue(doc);
    }
    if (tr.position && !(tr.keyframes && tr.keyframes.position)) {
      tl.property("Transform").property("Position").setValue(tr.position);
    }
    tl.name = name; // set AFTER source text (text layer name links to its text)
    if (tr.animator) COMMANDS.applyTextPreset({ compId: comp.id, layerName: name, preset: tr.animator });
    if (tr.neon) COMMANDS.neonGlow({ compId: comp.id, layerName: name, radius: tr.neon.radius });
    if (tr.grade) COMMANDS.cinematicGrade({ compId: comp.id, layerName: name, warm: tr.grade.warm });
    if (tr.glitch) COMMANDS.glitchEffect({ compId: comp.id, layerName: name, amount: tr.glitch.amount, shake: tr.glitch.shake });
    _applyAnim(tl, tr);
    return tl;
  }

  if (kind === "smoke") {
    var sW = comp.width, sH = comp.height, sMin = Math.min(sW, sH);
    var sc = tr.center || [sW / 2, sH * 0.55];
    var ssw = (tr.width || sW * 0.5) * (tr.size || 1);
    var ssh = (tr.height || sH * 0.7) * (tr.size || 1);
    var sL = _fireNoise(comp, prefix + "smoke", { contrast: 45, brightness: 8, scaleW: 130, scaleH: 280, complexity: 4, evo: 45, rise: 190 });
    var stint = sL.property("ADBE Effect Parade").addProperty("ADBE Tint");
    try { stint.property("Map Black To").setValue([0, 0, 0]); stint.property("Map White To").setValue(tr.color || [0.72, 0.74, 0.8]); } catch (e) {}
    _flameMask(sL, sc[0], sc[1], ssw, ssh, sMin * 0.24);
    sL.property("Transform").property("Opacity").setValue(tr.opacity || 55);
    sL.blendingMode = BlendingMode.SCREEN;
    sL.inPoint = segStart; sL.outPoint = segEnd;
    return sL;
  }

  // fire: the full realistic fire stack (reuses fire.jsx helpers), seg-prefixed
  // so the idempotent wipe-then-build cleans it on re-run.
  if (kind === "fire") {
    var W = comp.width, H = comp.height, minWH = Math.min(W, H);
    var fc = tr.center || [W / 2, H * 0.62];
    var fw = (tr.width || W * 0.34) * (tr.size || 1);
    var fh = (tr.height || H * 0.62) * (tr.size || 1);
    var fcx = fc[0], fcy = fc[1];
    var amb = comp.layers.addSolid([1, 0.35, 0.05], prefix + "fire_ambient", W, H, 1);
    _flameMask(amb, fcx, fcy + fh * 0.05, fw * 1.2, fh * 0.8, minWH * 0.16);
    amb.blendingMode = BlendingMode.ADD;
    amb.property("Transform").property("Opacity").setValue(tr.opacity !== undefined ? tr.opacity : 40);
    var fr = _fireNoise(comp, prefix + "fire_flame", { contrast: 270, brightness: -50, scaleW: 55, scaleH: 210, complexity: 6, evo: 130, rise: 560 });
    var ftd = fr.property("ADBE Effect Parade").addProperty("ADBE Turbulent Displace");
    try { ftd.property("Amount").setValue(35); ftd.property("Size").setValue(45); ftd.property("Evolution").expression = "time*90"; } catch (e) {}
    _ccToner(fr, tr.highlight || [1, 0.95, 0.55], tr.midtone || [1, 0.42, 0.02], [0, 0, 0]);
    _flameMask(fr, fcx, fcy, fw, fh, minWH * 0.065);
    fr.motionBlur = true;
    if (tr.embers !== false) {
      var fem = _fireNoise(comp, prefix + "fire_embers", { contrast: 750, brightness: -185, scale: 14, complexity: 6, evo: 220, rise: 1050 });
      _ccToner(fem, [1, 0.95, 0.7], [1, 0.6, 0.12], [0, 0, 0]);
      _flameMask(fem, fcx, fcy, fw * 1.25, fh * 1.05, minWH * 0.085);
      fem.blendingMode = BlendingMode.ADD;
      fem.property("Transform").property("Opacity").setValue(85);
    }
    var fglow = comp.layers.addSolid([1, 1, 1], prefix + "fire_glow", W, H, 1);
    fglow.adjustmentLayer = true;
    var fgfx = fglow.property("ADBE Effect Parade").addProperty("ADBE Glo2");
    try { fgfx.property("Glow Radius").setValue(60); fgfx.property("Glow Intensity").setValue(1.8); } catch (e) {}
    // trim every fire layer to the segment so it doesn't bleed into other segments
    var fireLayers = (typeof fem !== "undefined" && fem) ? [amb, fr, fem, fglow] : [amb, fr, fglow];
    for (var fl = 0; fl < fireLayers.length; fl++) {
      try { fireLayers[fl].inPoint = segStart; fireLayers[fl].outPoint = segEnd; } catch (e) {}
    }
    return fr;
  }

  if (kind === "procedural_motion") {
    var pl;
    if (tr.shape) {
      pl = comp.layers.addShape(); pl.name = name;
    } else {
      pl = comp.layers.addNull(); pl.name = name;
    }
    _applyAnim(pl, tr);
    return pl;
  }

  if (kind === "responsive_box") {
    var box = comp.layers.addShape(); box.name = name;
    var root = box.property("ADBE Root Vectors Group");
    var g = root.addProperty("ADBE Vector Group").property("ADBE Vectors Group");
    g.addProperty("ADBE Vector Shape - Rect");
    if (tr.fillColor) g.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(AEB.normColor(tr.fillColor));
    var sizeProp = g.property("ADBE Vector Shape - Rect").property("ADBE Vector Rect Size");
    var pad = tr.padding || [60, 40];
    if (tr.fitTo) {
      sizeProp.expression =
        "var s = thisComp.layer('" + prefix + tr.fitTo + "').sourceRectAtTime(); [s.width+" + pad[0] + ", s.height+" + pad[1] + "];";
    }
    _applyAnim(box, tr);
    return box;
  }

  if (kind === "tracked_pin") {
    var trk = comp.layers.addNull(); trk.name = name;
    if (tr.expression) _applyAnim(trk, tr);
    return trk;
  }

  if (kind === "transition") {
    var ov = comp.layers.addSolid(AEB.normColor(tr.color || [0, 0, 0]), name, comp.width, comp.height, 1);
    var op = ov.property("Transform").property("Opacity");
    var d = (tr.duration !== undefined) ? tr.duration : 0.5;
    if (String(tr.direction || "out") === "in") {
      op.setValueAtTime(segStart, 100); op.setValueAtTime(segStart + d, 0);
    } else {
      op.setValueAtTime(segEnd - d, 0); op.setValueAtTime(segEnd, 100);
    }
    return ov;
  }

  // generic: just make a null and apply anim so unknown types don't break the loop
  var gl = comp.layers.addNull(); gl.name = name;
  _applyAnim(gl, tr);
  return gl;
}

COMMANDS.removeLayersByPrefix = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(p.prefix, "prefix is required");
  return AEB.undo("aftr: removeLayersByPrefix", function () {
    var removed = [];
    for (var i = comp.numLayers; i >= 1; i--) {
      var L = comp.layer(i);
      if (L.name.indexOf(p.prefix) === 0) { removed.push(L.name); L.remove(); }
    }
    return { removed: removed };
  });
};

COMMANDS.applySpec = function (p) {
  var comp = AEB.requireComp(p);
  var spec = p.spec || {};
  var segId = (p.segmentId !== undefined && p.segmentId !== null) ? p.segmentId : spec.segment_id;
  AEB.assert(segId !== undefined && segId !== null, "segmentId (or spec.segment_id) is required");
  var prefix = "seg" + segId + "_";
  var segStart = (p.segment && p.segment.start !== undefined) ? p.segment.start : 0;
  var segEnd = (p.segment && p.segment.end !== undefined) ? p.segment.end : comp.duration;

  return AEB.undo("aftr: applySpec " + prefix, function () {
    // 1. idempotent wipe
    for (var i = comp.numLayers; i >= 1; i--) {
      if (comp.layer(i).name.indexOf(prefix) === 0) comp.layer(i).remove();
    }
    // 2. rebuild from spec
    var built = [];
    var treatments = spec.treatments || [];
    for (var t = 0; t < treatments.length; t++) {
      var layer = _realizeTreatment(comp, prefix, treatments[t], segStart, segEnd);
      if (layer) {
        if (treatments[t].trimToSegment !== false) {
          try { layer.inPoint = segStart; layer.outPoint = segEnd; } catch (e) {}
        }
        var info = AEB.layerInfo(layer);
        // generic: any treatment may carry effects:[{ effect:"Glow", params }]
        if (treatments[t].effects && treatments[t].effects.length) {
          info.effects = _applyEffects(layer, treatments[t].effects);
        }
        // friendly third-party plugin modifiers (Plugin Everything)
        if (treatments[t].deepGlow) {
          var dg = treatments[t].deepGlow; dg.compId = comp.id; dg.layerName = layer.name;
          try { COMMANDS.deepGlow(dg); } catch (e) {}
        }
        if (treatments[t].shadowStudio) {
          var ss = treatments[t].shadowStudio; ss.compId = comp.id; ss.layerName = layer.name;
          try { COMMANDS.shadowStudio(ss); } catch (e) {}
        }
        built.push(info);
      }
    }
    return { segmentId: segId, prefix: prefix, built: built.length, layers: built };
  });
};
