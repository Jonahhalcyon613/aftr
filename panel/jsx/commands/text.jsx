// text.jsx — text document styling + TEXT ANIMATORS (Animate panel) (ES3).
// addTextAnimator covers the full range-selector workflow (properties, advanced
// Based On / Shape / Ease, and keyframed Offset/Start) so pro text styles from
// the Animate panel can be built declaratively.

COMMANDS.setTextDocument = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  return AEB.undo("aftr: setTextDocument", function () {
    var sp = layer.property("Source Text");
    var d = sp.value;
    if (p.text !== undefined) d.text = p.text;
    if (p.font !== undefined) d.font = p.font;
    if (p.fontSize !== undefined) d.fontSize = p.fontSize;
    if (p.tracking !== undefined) d.tracking = p.tracking;
    if (p.leading !== undefined) d.leading = p.leading;
    if (p.applyFill !== undefined) d.applyFill = !!p.applyFill;
    if (p.fillColor !== undefined) { d.applyFill = true; d.fillColor = AEB.normColor(p.fillColor); }
    if (p.applyStroke !== undefined) d.applyStroke = !!p.applyStroke;
    if (p.strokeColor !== undefined) { d.applyStroke = true; d.strokeColor = AEB.normColor(p.strokeColor); }
    if (p.strokeWidth !== undefined) d.strokeWidth = p.strokeWidth;
    if (p.fauxBold !== undefined) { try { d.fauxBold = !!p.fauxBold; } catch (e) {} }
    if (p.fauxItalic !== undefined) { try { d.fauxItalic = !!p.fauxItalic; } catch (e) {} }
    if (p.allCaps !== undefined) { try { d.allCaps = !!p.allCaps; } catch (e) {} }
    if (p.justification !== undefined) {
      var J = [ParagraphJustification.LEFT_JUSTIFY, ParagraphJustification.RIGHT_JUSTIFY, ParagraphJustification.CENTER_JUSTIFY];
      d.justification = J[p.justification] || J[0];
    }
    sp.setValue(d);
    return { ok: true };
  });
};

var _TA_PROP = {
  position: "ADBE Text Position 3D", scale: "ADBE Text Scale 3D",
  rotation: "ADBE Text Rotation", opacity: "ADBE Text Opacity",
  tracking: "ADBE Text Tracking Amount", blur: "ADBE Text Blur"
};

function _taCoerce(key, v) {
  key = String(key).toLowerCase();
  if (key === "position") {
    if (v && v.length !== undefined) return [v[0] || 0, v[1] || 0, v[2] || 0];
    return [0, v, 0];
  }
  if (key === "scale") {
    if (v && v.length !== undefined) return [v[0], v[1], (v[2] !== undefined ? v[2] : v[0])];
    return [v, v, v];
  }
  if (key === "blur") {
    if (v && v.length !== undefined) return [v[0], v[1]];
    return [v, v];
  }
  // 1D
  if (v && v.length !== undefined) return v[0];
  return v;
}

function _taBasedOn(name) {
  var m = { characters: 1, character: 1, charactersexcludingspaces: 2, charsexclspaces: 2, words: 3, word: 3, lines: 4, line: 4 };
  return m[String(name).toLowerCase().replace(/[^a-z]/g, "")] || 1;
}
function _taShape(name) {
  var m = { square: 1, rampup: 2, rampdown: 3, triangle: 4, round: 5, smooth: 6 };
  return m[String(name).toLowerCase().replace(/[^a-z]/g, "")] || 1;
}

function _clampInf(v) { if (v < 0.1) return 0.1; if (v > 100) return 100; return v; }

// Apply a CSS-style cubic-bezier [x1,y1,x2,y2] as temporal ease across the two
// keyframes of a selector field. Influence = handle x-extent; speed = avg speed
// scaled by the bezier's endpoint tangent slope.
function _taBezierEase(prop, from, to, t0, t1, b) {
  var x1 = b[0], y1 = b[1], x2 = b[2], y2 = b[3];
  var dt = (t1 - t0); if (dt <= 0) dt = 0.0001;
  var avg = (to - from) / dt;
  var slopeStart = (x1 > 0.0001) ? (y1 / x1) : 0;
  var slopeEnd = ((1 - x2) > 0.0001) ? ((1 - y2) / (1 - x2)) : 0;
  prop.setInterpolationTypeAtKey(1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
  prop.setTemporalEaseAtKey(1, [new KeyframeEase(0, 16.667)], [new KeyframeEase(avg * slopeStart, _clampInf(x1 * 100))]);
  prop.setInterpolationTypeAtKey(2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
  prop.setTemporalEaseAtKey(2, [new KeyframeEase(avg * slopeEnd, _clampInf((1 - x2) * 100))], [new KeyframeEase(0, 16.667)]);
}

COMMANDS.addTextAnimator = function (p) {
  var comp = AEB.requireComp(p);
  var layer = AEB.requireLayer(comp, p);
  AEB.assert(layer.property("ADBE Text Properties"), "layer is not a text layer");
  return AEB.undo("aftr: addTextAnimator", function () {
    var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
    var anim = animators.addProperty("ADBE Text Animator");
    if (p.name) anim.name = p.name;
    var props = anim.property("ADBE Text Animator Properties");

    // 1. animator property values (the "from"/hidden state)
    var applied = [];
    if (p.properties) {
      for (var key in p.properties) {
        if (!p.properties.hasOwnProperty(key)) continue;
        var mn = _TA_PROP[String(key).toLowerCase()];
        if (!mn) continue;
        var ap = props.addProperty(mn);
        ap.setValue(_taCoerce(key, p.properties[key]));
        applied.push(key);
      }
    }

    // 2. range selector + advanced
    var sel = anim.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
    var s = p.selector || {};
    if (s.start !== undefined) sel.property("ADBE Text Percent Start").setValue(s.start);
    if (s.end !== undefined) sel.property("ADBE Text Percent End").setValue(s.end);
    if (s.offset !== undefined) sel.property("ADBE Text Percent Offset").setValue(s.offset);
    var adv = sel.property("ADBE Text Range Advanced");
    if (s.basedOn !== undefined) adv.property("ADBE Text Range Type2").setValue(_taBasedOn(s.basedOn));
    if (s.shape !== undefined) adv.property("ADBE Text Range Shape").setValue(_taShape(s.shape));
    if (s.easeHigh !== undefined) adv.property("ADBE Text Levels Max Ease").setValue(s.easeHigh);
    if (s.easeLow !== undefined) adv.property("ADBE Text Levels Min Ease").setValue(s.easeLow);

    // 3. animate a selector field (offset|start|end) over a frame range
    if (p.animate) {
      var a = (p.animate.length !== undefined) ? p.animate : [p.animate]; // allow 1 or many
      for (var ai = 0; ai < a.length; ai++) {
        var an = a[ai];
        var fkey = String(an.field || "offset").toLowerCase();
        var prop;
        if (fkey === "amount") {
          // selector Amount (under Advanced): drives ALL units uniformly/together
          prop = adv.property("ADBE Text Selector Max Amount");
        } else {
          var FMN = { offset: "ADBE Text Percent Offset", start: "ADBE Text Percent Start", end: "ADBE Text Percent End" };
          prop = sel.property(FMN[fkey]);
        }
        var fps = comp.frameRate;
        var t0 = (an.startFrame || 0) / fps;
        var t1 = ((an.endFrame !== undefined) ? an.endFrame : 15) / fps;
        prop.setValueAtTime(t0, an.from);
        prop.setValueAtTime(t1, an.to);
        if (an.bezier && an.bezier.length === 4) {
          _taBezierEase(prop, an.from, an.to, t0, t1, an.bezier);
          continue;
        }
        var mode = String(an.ease || "").toLowerCase();
        if (mode === "easeout" || mode === "easyease" || an.easyEase) {
          var inK1 = (mode === "easeout") ? 20 : 33.3333;
          var inK2 = (mode === "easeout") ? 85 : 33.3333;
          prop.setInterpolationTypeAtKey(1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
          prop.setTemporalEaseAtKey(1, [new KeyframeEase(0, 33.3333)], [new KeyframeEase(0, inK1)]);
          prop.setInterpolationTypeAtKey(2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
          prop.setTemporalEaseAtKey(2, [new KeyframeEase(0, inK2)], [new KeyframeEase(0, 33.3333)]);
        }
      }
    }

    if (p.motionBlur) layer.motionBlur = true;
    return { animatorIndex: anim.propertyIndex, name: anim.name, properties: applied };
  });
};

// Named presets for the four pro text styles. Each value is an array of one or
// more animator configs (run in order), so a style can stack animators like the
// two-animator blurFade build.
var _TEXT_PRESETS = {
  // Style 1: words slide up + fade in, smoothed with high/low ease.
  wordreveal: [
    { properties: { position: 80, opacity: 0 }, selector: { basedOn: "words", easeHigh: 20, easeLow: 100 }, animate: { field: "offset", from: 0, to: 100, startFrame: 0, endFrame: 15 }, motionBlur: true }
  ],
  // Style 2: characters scale + slide up + fade in, fast-in/slow-out.
  charscale: [
    { properties: { position: 140, scale: 20, opacity: 0 }, selector: { basedOn: "charactersExcludingSpaces", easeLow: 100 }, animate: { field: "start", from: 0, to: 100, startFrame: 0, endFrame: 30, ease: "easeOut" }, motionBlur: true }
  ],
  // Style 3: bunched characters spring apart while scaling/rotating in.
  bunchrotate: [
    { properties: { scale: 40, rotation: 30, opacity: 0, tracking: -60 }, selector: { basedOn: "charactersExcludingSpaces" }, animate: { field: "start", from: 0, to: 100, startFrame: 0, endFrame: 20, ease: "easeOut" }, motionBlur: true }
  ],
  // Style 4: opacity + scale + rotation + blur on ONE animator (so they resolve
  // together per letter), swept across characters so letters cascade with overlap.
  blurfade: [
    { name: "BlurFade", properties: { opacity: 0, scale: 60, rotation: 15, blur: 15 }, selector: { basedOn: "charactersExcludingSpaces", easeLow: 0 }, animate: { field: "start", from: 0, to: 100, startFrame: 0, endFrame: 30, ease: "easeOut" }, motionBlur: true }
  ]
};

// Clone the animate config(s) and stamp the same bezier on every keyframe pair,
// so one easing curve can drive an entire preset (and all presets uniformly).
function _withBezier(animate, bez) {
  var arr = (animate && animate.length !== undefined) ? animate : [animate];
  var res = [];
  for (var i = 0; i < arr.length; i++) {
    var a = arr[i]; var n = {};
    for (var k in a) { if (a.hasOwnProperty(k)) n[k] = a[k]; }
    n.bezier = bez;
    res.push(n);
  }
  return res;
}

// Clone the animate config(s) and shift every keyframe by `off` frames, so a
// preset can start at an arbitrary point in the timeline (sequential showcases).
function _shiftAnimate(animate, off) {
  var arr = (animate && animate.length !== undefined) ? animate : [animate];
  var res = [];
  for (var i = 0; i < arr.length; i++) {
    var a = arr[i]; var n = {};
    for (var k in a) { if (a.hasOwnProperty(k)) n[k] = a[k]; }
    if (n.startFrame !== undefined) n.startFrame += off;
    if (n.endFrame !== undefined) n.endFrame += off;
    res.push(n);
  }
  return res;
}

// Scale the timeline of a preset's keyframes by `s` (proportional: both offset
// and duration), so a preset can run slower/faster while keeping its rhythm.
function _stretchAnimate(animate, s) {
  var arr = (animate && animate.length !== undefined) ? animate : [animate];
  var res = [];
  for (var i = 0; i < arr.length; i++) {
    var a = arr[i]; var n = {};
    for (var k in a) { if (a.hasOwnProperty(k)) n[k] = a[k]; }
    if (n.startFrame !== undefined) n.startFrame = Math.round(n.startFrame * s);
    if (n.endFrame !== undefined) n.endFrame = Math.round(n.endFrame * s);
    res.push(n);
  }
  return res;
}

COMMANDS.applyTextPreset = function (p) {
  var key = String(p.preset || "wordReveal").toLowerCase().replace(/[^a-z]/g, "");
  var cfg = _TEXT_PRESETS[key];
  AEB.assert(cfg, "unknown text preset: " + p.preset + " (wordReveal|charScale|bunchRotate|blurFade)");
  var list = (cfg.length !== undefined) ? cfg : [cfg];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    var params = { compId: p.compId, layer: p.layer, layerName: p.layerName, layerIndex: p.layerIndex };
    for (var k in c) { if (c.hasOwnProperty(k)) params[k] = c[k]; }
    // clone properties so caller overrides (p.props) don't mutate the template
    if (params.properties) {
      var cp = {}; for (var pk in params.properties) { if (params.properties.hasOwnProperty(pk)) cp[pk] = params.properties[pk]; }
      if (p.props) { for (var ok in p.props) { if (p.props.hasOwnProperty(ok)) cp[ok] = p.props[ok]; } }
      params.properties = cp;
    }
    // clone selector + merge caller overrides (p.sel), e.g. easeHigh/easeLow
    if (params.selector || p.sel) {
      var cs = {}; var src = params.selector || {};
      for (var sk in src) { if (src.hasOwnProperty(sk)) cs[sk] = src[sk]; }
      if (p.sel) { for (var so in p.sel) { if (p.sel.hasOwnProperty(so)) cs[so] = p.sel[so]; } }
      params.selector = cs;
    }
    if (p.bezier && p.bezier.length === 4) params.animate = _withBezier(params.animate, p.bezier);
    if (p.stretch && p.stretch !== 1) params.animate = _stretchAnimate(params.animate, p.stretch);
    // override the selector value range (e.g. start sweep from <0 so the first
    // character is fully covered at frame 0 — fixes the leftmost-edge artifact)
    if (p.animFrom !== undefined || p.animTo !== undefined) {
      var aa = (params.animate && params.animate.length !== undefined) ? params.animate : [params.animate];
      for (var qi = 0; qi < aa.length; qi++) {
        if (p.animFrom !== undefined) aa[qi].from = p.animFrom;
        if (p.animTo !== undefined) aa[qi].to = p.animTo;
      }
      params.animate = aa;
    }
    if (p.startFrame) params.animate = _shiftAnimate(params.animate, p.startFrame);
    if (!params.name) params.name = (p.name || ("Preset_" + key)) + (list.length > 1 ? ("_" + (i + 1)) : "");
    out.push(COMMANDS.addTextAnimator(params));
  }
  return { preset: key, animators: out, bezier: (p.bezier || null) };
};

// ---------------------------------------------------------------------------
// applyWordReveal — deterministic, text-driven, multi-line per-word reveal.
// Splits text into lines/words, measures each run's rendered width via
// sourceRectAtTime, lays them out naturally (each line centered on centerX,
// the block centered on centerY), and animates each word as its own layer so
// the cubic-bezier drives the word itself. Words cascade with overlap.
// ---------------------------------------------------------------------------

// Create a throwaway text layer, measure its bounds, remove it. Tracking is
// applied before measuring so layout stays exact when kerning changes.
function _wrMeasure(comp, str, font, size, trk) {
  var L = comp.layers.addText(str);
  var st = L.property("Source Text"); var d = st.value;
  try { d.resetCharStyle(); } catch (e) {}
  d.font = font; d.fontSize = size; if (trk !== undefined) d.tracking = trk; st.setValue(d);
  var r = L.sourceRectAtTime(0, false);
  var out = { width: r.width, height: r.height, left: r.left, top: r.top };
  L.remove();
  return out;
}

// Smart deterministic line height. The thing that actually defines a line's
// "top" is its CAP height; ascenders just poke up and may ride into the leading
// (normal in tight type). The only real collision risk is the previous line's
// DESCENDER hitting the next line's caps. So: leading = capHeight + (the largest
// descender among the upper lines) + a tiny gap. Measured from the ACTUAL text,
// so descender-free text packs tight and descender text gets exactly the room it
// needs — works in all cases, any font/size.
function _autoLeading(comp, text, font, size, trk) {
  var capH = _wrMeasure(comp, "H", font, size, trk).height;
  var raw = String(text).split("\n");
  var lines = [];
  for (var i = 0; i < raw.length; i++) { if (raw[i].length) lines.push(raw[i]); }
  if (lines.length < 2) return Math.round(capH * 1.2);
  // measure each line's real ascent/descent from the ACTUAL glyphs
  var asc = [], desc = [];
  for (var j = 0; j < lines.length; j++) {
    var m = _wrMeasure(comp, lines[j], font, size, trk);
    asc.push(-m.top);                      // baseline -> top of ink
    desc.push(m.height + m.top);           // baseline -> bottom of ink
  }
  // tightest non-touching baseline gap = max over pairs of (upper descent +
  // lower ascent), so the lower line's ascenders just clear the upper line.
  var need = 0;
  for (var k = 0; k < lines.length - 1; k++) { var v = desc[k] + asc[k + 1]; if (v > need) need = v; }
  return Math.round(need + capH * 0.10);   // + a small balanced gap
}

// Measure how this font maps the leading PROPERTY to real baseline spacing.
// For (variable) fonts that don't honor leading 1:1, spacing = leading + offset;
// this returns that offset so callers can invert it.
function _leadOffset(comp, font, size, trk) {
  function bh(txt, lead) {
    var L = comp.layers.addText(txt);
    var s = L.property("Source Text"); var v = s.value;
    try { v.resetCharStyle(); } catch (e) {}
    v.font = font; v.fontSize = size; if (trk !== undefined) v.tracking = trk;
    if (lead !== null) { try { v.autoLeading = false; } catch (e) {} v.leading = lead; }
    s.setValue(v);
    var r = L.sourceRectAtTime(0, false); L.remove(); return r.height;
  }
  var Lt = 60;
  return (bh("Hg\rHg", Lt) - bh("Hg", null)) - Lt;   // spacing(Lt) - oneLine - Lt
}

// Build ONE text layer per line, positioned MANUALLY by measured metrics. This
// bypasses AE's leading property entirely (variable fonts override it, which
// inflated line spacing). Deterministic baseline spacing = _autoLeading. Returns
// the created layer names (top line first).
function _makeLineLayers(comp, p) {
  var font = p.font || "Inter-Regular";
  var size = p.fontSize || 130;
  var trk = p.tracking;
  var fill = AEB.normColor(p.fillColor || [1, 1, 1]);
  var cx = (p.centerX !== undefined) ? p.centerX : comp.width / 2;
  var cy = (p.centerY !== undefined) ? p.centerY : comp.height / 2;
  var raw = String(p.text).split("\n"); var lines = [];
  for (var i = 0; i < raw.length; i++) { if (raw[i].length) lines.push(raw[i]); }
  var n = lines.length;
  var spacing = (p.lineHeight !== undefined) ? p.lineHeight : _autoLeading(comp, p.text, font, size, trk);
  var ref = _wrMeasure(comp, "Hg", font, size, trk);
  var vOff = ref.top + ref.height / 2;
  var b0 = cy - ((n - 1) * spacing) / 2 - vOff;
  var names = [];
  for (var j = 0; j < n; j++) {
    var L = comp.layers.addText(lines[j]);
    var st = L.property("Source Text"); var d = st.value;
    try { d.resetCharStyle(); } catch (e) {}
    d.font = font; d.fontSize = size; d.applyFill = true; d.fillColor = fill;
    if (trk !== undefined) d.tracking = trk;
    d.justification = ParagraphJustification.CENTER_JUSTIFY;
    st.setValue(d);
    L.property("ADBE Transform Group").property("ADBE Position").setValue([cx, b0 + j * spacing]);
    var nm = (p.namePrefix || "L") + "_ln" + j;
    L.name = nm;
    if (p.trimIn !== undefined) L.inPoint = p.trimIn;
    if (p.trimOut !== undefined) L.outPoint = p.trimOut;
    names.push(nm);
  }
  return names;
}

// Apply a single-layer preset to text. If `text` is given (and no explicit
// layer), build one manually-positioned layer per line and apply the preset to
// each so multi-line spacing is correct regardless of the font's leading.
function _applyPresetLines(params, presetName) {
  var hasLayer = (params.layer !== undefined || params.layerIndex !== undefined || params.layerName !== undefined);
  if (!params.text || hasLayer) {
    params.preset = presetName;
    return COMMANDS.applyTextPreset(params);
  }
  var comp = AEB.requireComp(params);
  var names = _makeLineLayers(comp, params);   // exact manual spacing, any size
  // Continuous cascade: time each line by its share of the total characters, so
  // the sweep flows from one line into the next at a constant per-character rate
  // — identical to one seamless block, but with correct per-line positioning.
  var raw = String(params.text).split("\n"); var lns = [];
  for (var i = 0; i < raw.length; i++) { if (raw[i].length) lns.push(raw[i]); }
  var counts = [], total = 0;
  for (var c = 0; c < lns.length; c++) { var nc = lns[c].replace(/ /g, "").length; if (nc < 1) nc = 1; counts.push(nc); total += nc; }
  var cfg = _TEXT_PRESETS[presetName];
  var arr = (cfg.length !== undefined) ? cfg : [cfg];
  var presetSpan = 0;
  for (var a = 0; a < arr.length; a++) {
    var an = arr[a].animate; var ea = (an && an.length !== undefined) ? an : [an];
    for (var b = 0; b < ea.length; b++) { if (ea[b] && ea[b].endFrame > presetSpan) presetSpan = ea[b].endFrame; }
  }
  if (presetSpan < 1) presetSpan = 1;
  var totalSpan = presetSpan * (params.stretch || 1);
  var base = params.startFrame || 0;
  var cum = 0, out = [];
  for (var j = 0; j < names.length; j++) {
    var lineStart = base + Math.round(totalSpan * (cum / total));
    var lineEnd = base + Math.round(totalSpan * ((cum + counts[j]) / total));
    cum += counts[j];
    var dur = lineEnd - lineStart; if (dur < 1) dur = 1;
    var lp = {}; for (var k in params) { if (params.hasOwnProperty(k)) lp[k] = params[k]; }
    lp.text = undefined; lp.layerIndex = undefined; lp.layer = undefined;
    lp.layerName = names[j];
    lp.preset = presetName;
    lp.startFrame = lineStart;
    lp.stretch = dur / presetSpan;     // scale the preset's sweep to this line's time slice
    out.push(COMMANDS.applyTextPreset(lp));
  }
  return { lines: names.length, perLine: out };
}

// Single-word reveal animator (one word unit, no selector smoothing) whose
// offset keyframes carry the bezier, so the curve IS the word's motion.
function _wrAnimator(layer, comp, rise, sF, eF, bez) {
  var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
  var anim = animators.addProperty("ADBE Text Animator");
  anim.name = "Reveal";
  var props = anim.property("ADBE Text Animator Properties");
  props.addProperty("ADBE Text Position 3D").setValue([0, rise, 0]);
  props.addProperty("ADBE Text Opacity").setValue(0);
  var sel = anim.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
  var adv = sel.property("ADBE Text Range Advanced");
  adv.property("ADBE Text Range Type2").setValue(3);          // based on: words
  adv.property("ADBE Text Levels Max Ease").setValue(0);
  adv.property("ADBE Text Levels Min Ease").setValue(0);
  var off = sel.property("ADBE Text Percent Offset");
  var fps = comp.frameRate;
  var t0 = sF / fps, t1 = eF / fps;
  off.setValueAtTime(t0, 0);
  off.setValueAtTime(t1, 100);
  _taBezierEase(off, 0, 100, t0, t1, bez);
}

COMMANDS.applyWordReveal = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(typeof p.text === "string" && p.text.length, "text is required");
  var font = p.font || "Inter-Regular";
  var size = p.fontSize || 130;
  var fill = AEB.normColor(p.fillColor || [1, 1, 1]);
  var cx = (p.centerX !== undefined) ? p.centerX : comp.width / 2;
  var cy = (p.centerY !== undefined) ? p.centerY : comp.height / 2;
  var lineH = (p.lineHeight !== undefined) ? p.lineHeight : null;  // default measured below
  var rise = (p.rise !== undefined) ? p.rise : 80;
  var revF = (p.revealFrames !== undefined) ? p.revealFrames : 30;
  var stag = (p.stagger !== undefined) ? p.stagger : 15;
  var startF = (p.startFrame !== undefined) ? p.startFrame : 0;
  var bez = (p.bezier && p.bezier.length === 4) ? p.bezier : [0, 0, 1, 1];
  var mb = (p.motionBlur !== undefined) ? !!p.motionBlur : true;
  var trk = (p.tracking !== undefined) ? p.tracking : 0;
  var prefix = p.namePrefix || "WR";

  return AEB.undo("aftr: applyWordReveal", function () {
    // deterministic space width for this font/size/tracking
    var sp = _wrMeasure(comp, "n n", font, size, trk).width - _wrMeasure(comp, "nn", font, size, trk).width;
    if (!(sp > 0)) sp = size * 0.25;

    var rawLines = String(p.text).split("\n");
    var lines = [];
    for (var li = 0; li < rawLines.length; li++) {
      var parts = rawLines[li].split(" ");
      var words = [];
      for (var wi = 0; wi < parts.length; wi++) { if (parts[wi].length) words.push(parts[wi]); }
      if (words.length) lines.push(words);
    }
    AEB.assert(lines.length, "text has no words");
    var nLines = lines.length;
    // ONE stable vertical reference (not per-line) so baselines are spaced by a
    // constant lineH regardless of per-line ascenders/descenders. Block centered.
    var ref = _wrMeasure(comp, "Hg", font, size, trk);
    if (lineH === null) lineH = _autoLeading(comp, p.text, font, size, trk);   // content-aware default
    var vOff = ref.top + ref.height / 2;
    var b0 = cy - ((nLines - 1) * lineH) / 2 - vOff;   // first baseline

    var created = [];
    var k = 0;
    for (var i = 0; i < nLines; i++) {
      var lw = lines[i];
      var widths = [], total = 0;
      for (var j = 0; j < lw.length; j++) { var w = _wrMeasure(comp, lw[j], font, size, trk).width; widths.push(w); total += w; }
      total += sp * (lw.length - 1);
      var lineLeft = cx - total / 2;
      var vy = b0 + i * lineH;                          // consistent baseline spacing

      var cumX = lineLeft;
      for (var j2 = 0; j2 < lw.length; j2++) {
        var word = lw[j2];
        var L = comp.layers.addText(word);
        var st = L.property("Source Text"); var d = st.value;
        try { d.resetCharStyle(); } catch (e) {}
        d.font = font; d.fontSize = size; d.applyFill = true; d.fillColor = fill;
        d.tracking = trk;
        d.justification = ParagraphJustification.LEFT_JUSTIFY;
        st.setValue(d);
        var r = L.sourceRectAtTime(0, false);
        L.property("ADBE Transform Group").property("ADBE Position").setValue([cumX - r.left, vy]);
        L.name = prefix + "_" + k + "_" + word.replace(/[^A-Za-z0-9]/g, "");
        var sF = startF + k * stag, eF = sF + revF;
        _wrAnimator(L, comp, rise, sF, eF, bez);
        if (mb) L.motionBlur = true;
        if (p.trimIn !== undefined) L.inPoint = p.trimIn;
        if (p.trimOut !== undefined) L.outPoint = p.trimOut;
        created.push(L.name);
        cumX += widths[j2] + sp;
        k++;
      }
    }
    return { created: created.length, words: k, lines: nLines, spaceWidth: sp,
             lastEndFrame: startF + (k - 1) * stag + revF, names: created };
  });
};

// Per-letter scale/rise/opacity animator (one char unit) — bezier on the
// offset keyframes IS the letter's motion.
function _csAnimator(layer, comp, scaleFrom, rise, sF, eF, bez) {
  var animators = layer.property("ADBE Text Properties").property("ADBE Text Animators");
  var anim = animators.addProperty("ADBE Text Animator");
  anim.name = "CharScale";
  var props = anim.property("ADBE Text Animator Properties");
  props.addProperty("ADBE Text Position 3D").setValue([0, rise, 0]);
  props.addProperty("ADBE Text Scale 3D").setValue([scaleFrom, scaleFrom, scaleFrom]);
  props.addProperty("ADBE Text Opacity").setValue(0);
  var sel = anim.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
  var adv = sel.property("ADBE Text Range Advanced");
  adv.property("ADBE Text Range Type2").setValue(1);         // based on: characters
  adv.property("ADBE Text Levels Max Ease").setValue(0);
  adv.property("ADBE Text Levels Min Ease").setValue(0);
  var off = sel.property("ADBE Text Percent Offset");
  var fps = comp.frameRate;
  var t0 = sF / fps, t1 = eF / fps;
  off.setValueAtTime(t0, 0);
  off.setValueAtTime(t1, 100);
  _taBezierEase(off, 0, 100, t0, t1, bez);
}

// Deterministic, letter-based char-scale reveal. Like applyWordReveal but each
// LETTER is its own measured/positioned layer (kerning-correct via prefix
// measurement), scaling up + rising + fading with an overlapping cascade.
COMMANDS.applyCharScale = function (p) {
  var comp = AEB.requireComp(p);
  AEB.assert(typeof p.text === "string" && p.text.length, "text is required");
  var font = p.font || "Inter-Regular";
  var size = p.fontSize || 130;
  var fill = AEB.normColor(p.fillColor || [1, 1, 1]);
  var cx = (p.centerX !== undefined) ? p.centerX : comp.width / 2;
  var cy = (p.centerY !== undefined) ? p.centerY : comp.height / 2;
  var lineH = (p.lineHeight !== undefined) ? p.lineHeight : Math.round(size * 0.52);
  var rise = (p.rise !== undefined) ? p.rise : 40;
  var scaleFrom = (p.scaleFrom !== undefined) ? p.scaleFrom : 30;
  var revF = (p.revealFrames !== undefined) ? p.revealFrames : 18;
  var stag = (p.stagger !== undefined) ? p.stagger : 4;
  var startF = (p.startFrame !== undefined) ? p.startFrame : 0;
  var bez = (p.bezier && p.bezier.length === 4) ? p.bezier : [0, 0, 1, 1];
  var mb = (p.motionBlur !== undefined) ? !!p.motionBlur : true;
  var trk = (p.tracking !== undefined) ? p.tracking : 0;
  var prefix = p.namePrefix || "CS";

  return AEB.undo("aftr: applyCharScale", function () {
    var rawLines = String(p.text).split("\n");
    var lines = [];
    for (var li = 0; li < rawLines.length; li++) { if (rawLines[li].length) lines.push(rawLines[li]); }
    AEB.assert(lines.length, "text has no characters");
    var nLines = lines.length;
    var blockTop = cy - (nLines * lineH) / 2;
    var created = [], k = 0;
    for (var i = 0; i < nLines; i++) {
      var line = lines[i];
      var lineRect = _wrMeasure(comp, line, font, size, trk);
      var lineLeft = cx - lineRect.width / 2;
      var lineCenterY = blockTop + lineH * (i + 0.5);
      var vy = lineCenterY - (lineRect.top + lineRect.height / 2);
      for (var j = 0; j < line.length; j++) {
        var ch = line.charAt(j);
        if (ch === " ") continue;
        var leftEdge = lineLeft + (j === 0 ? 0 : _wrMeasure(comp, line.substring(0, j), font, size, trk).width);
        var L = comp.layers.addText(ch);
        var st = L.property("Source Text"); var d = st.value;
        try { d.resetCharStyle(); } catch (e) {}
        d.font = font; d.fontSize = size; d.applyFill = true; d.fillColor = fill; d.tracking = trk;
        d.justification = ParagraphJustification.LEFT_JUSTIFY;
        st.setValue(d);
        try { L.property("ADBE Text Properties").property("ADBE Text More Options").property("ADBE Text Anchor Point Align").setValue([0, -50]); } catch (e) {}
        var r = L.sourceRectAtTime(0, false);
        L.property("ADBE Transform Group").property("ADBE Position").setValue([leftEdge - r.left, vy]);
        L.name = prefix + "_" + k + "_" + ch.replace(/[^A-Za-z0-9]/g, "x");
        var sF = startF + k * stag, eF = sF + revF;
        _csAnimator(L, comp, scaleFrom, rise, sF, eF, bez);
        if (mb) L.motionBlur = true;
        if (p.trimIn !== undefined) L.inPoint = p.trimIn;
        if (p.trimOut !== undefined) L.outPoint = p.trimOut;
        created.push(L.name);
        k++;
      }
    }
    return { created: created.length, letters: k, lines: nLines,
             lastEndFrame: startF + (k - 1) * stag + revF, names: created };
  });
};

// ---------------------------------------------------------------------------
// Combinatorial text presets: 4 styles x 8 eases. applyTextStyle resolves a
// (style, ease) pair by NAME and dispatches to the right builder, so an agent
// can call any combination in one shot. Eases mirror curves.md.
// ---------------------------------------------------------------------------
var _EASES = {
  easeinoutcubic: [0.65, 0, 0.35, 1], easeoutquart: [0.25, 1, 0.5, 1],
  easeinoutquart: [0.76, 0, 0.24, 1], easeoutquint: [0.22, 1, 0.36, 1],
  easeinoutquint: [0.83, 0, 0.17, 1], easeoutexpo: [0.16, 1, 0.3, 1],
  easeinoutexpo: [0.87, 0, 0.13, 1], easeinoutcirc: [0.85, 0, 0.15, 1]
};
function _styleKey(s) { return String(s).toLowerCase().replace(/[^a-z]/g, ""); }

// Self-contained helper: when a style is called with `text` and no layer ref,
// build a centered point-text layer so the call needs nothing pre-made.
function _styleMakeLayer(params) {
  if (!(params.text && params.layer === undefined && params.layerIndex === undefined && params.layerName === undefined)) return;
  var comp = AEB.requireComp(params);
  var size = params.fontSize || 130;
  var font = params.font || "Inter-Regular";
  var trk = params.tracking;
  var cx = (params.centerX !== undefined) ? params.centerX : comp.width / 2;
  var cy = (params.centerY !== undefined) ? params.centerY : comp.height / 2;
  // deterministic, content-aware target spacing. Override with lineHeight.
  var desired = (params.lineHeight !== undefined) ? params.lineHeight : _autoLeading(comp, params.text, font, size, trk);
  // This font maps the leading PROPERTY to actual baseline spacing with a
  // constant offset (spacing = leading + offset). Measure it and invert so the
  // rendered spacing equals `desired` — keeps everything in ONE seamless layer.
  var lead = Math.round(desired - _leadOffset(comp, font, size, trk));

  var TL = comp.layers.addText(params.text);
  var st = TL.property("Source Text"); var dd = st.value;
  try { dd.resetCharStyle(); } catch (e) {}
  dd.font = font; dd.fontSize = size;
  dd.applyFill = true; dd.fillColor = AEB.normColor(params.fillColor || [1, 1, 1]);
  if (trk !== undefined) dd.tracking = trk;
  try { dd.autoLeading = false; } catch (e) {}
  dd.leading = lead;
  dd.justification = ParagraphJustification.CENTER_JUSTIFY;
  st.setValue(dd);
  // center the WHOLE block: measure the rendered bounds (leading applied) and
  // place so its center sits on (cx, cy). Deterministic for any line count.
  var rb = TL.sourceRectAtTime(0, false);
  TL.property("ADBE Transform Group").property("ADBE Position").setValue([cx, cy - (rb.top + rb.height / 2)]);
  if (params.namePrefix) TL.name = params.namePrefix;
  if (params.trimIn !== undefined) TL.inPoint = params.trimIn;
  if (params.trimOut !== undefined) TL.outPoint = params.trimOut;
  params.layerIndex = 1;
}

COMMANDS.listTextStyles = function () {
  var eases = []; for (var e in _EASES) { if (_EASES.hasOwnProperty(e)) eases.push(e); }
  return {
    styles: ["wordReveal", "charScale", "bunchRotate", "blurFade"],
    ready: ["wordReveal", "charScale", "bunchRotate", "blurFade"],
    pending: [],
    eases: eases,
    combos: eases.length * 4
  };
};

COMMANDS.applyTextStyle = function (p) {
  var style = _styleKey(p.style || "wordReveal");
  var bez = (p.bezier && p.bezier.length === 4) ? p.bezier : _EASES[_styleKey(p.ease)];
  AEB.assert(bez, "unknown ease: " + p.ease + " (give a known ease name or bezier[4])");
  var params = {}; for (var k in p) { if (p.hasOwnProperty(k)) params[k] = p[k]; }
  params.bezier = bez;
  var res, builder;
  if (style === "wordreveal") {
    // bake in the approved style-1 timing as defaults (overridable)
    if (params.revealFrames === undefined) params.revealFrames = 18;
    if (params.stagger === undefined) params.stagger = 9;
    builder = "applyWordReveal";
    res = COMMANDS.applyWordReveal(params);
  } else if (style === "charscale") {
    // approved style-2 settings, baked in (all overridable)
    var props2 = params.props || {};
    if (props2.position === undefined) props2.position = 50;
    if (props2.scale === undefined) props2.scale = 80;
    params.props = props2;
    var sel2 = params.sel || {};
    if (sel2.easeLow === undefined) sel2.easeLow = 0;
    params.sel = sel2;
    if (params.animFrom === undefined) params.animFrom = -15;   // first-letter edge fix
    if (params.stretch === undefined) params.stretch = 2;
    builder = "applyTextPreset";
    res = _applyPresetLines(params, "charscale");
  } else if (style === "bunchrotate") {
    // approved style-3 settings, baked in (all overridable)
    if (params.animFrom === undefined) params.animFrom = -15;   // first-letter edge fix
    if (params.stretch === undefined) params.stretch = 2;
    builder = "applyTextPreset";
    res = _applyPresetLines(params, "bunchrotate");
  } else if (style === "blurfade") {
    // approved style-4 settings, baked in (all overridable)
    if (params.animFrom === undefined) params.animFrom = -15;   // first-letter edge fix
    if (params.stretch === undefined) params.stretch = 2;
    builder = "applyTextPreset";
    res = _applyPresetLines(params, "blurfade");
  } else {
    throw new Error("unknown style: " + p.style + " (wordReveal|charScale|bunchRotate|blurFade)");
  }
  return { style: style, ease: (_styleKey(p.ease) || "custom"), bezier: bez, builder: builder, result: res };
};
