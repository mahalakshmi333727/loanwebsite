/* ==========================================================================
   THREE-SCENE.JS
   Part 3 — the advanced interactive 3D bond-document experience.

   Still responsible ONLY for the Three.js scene itself: camera, renderer,
   lights, layered "paper" geometry, materials, animation loop, resize
   handling, pointer parallax, scroll-driven storytelling transforms,
   document hotspots (hover/click), the services paper-stack, the
   "how it works" process progression, and device-aware render quality.

   No DOM wiring beyond the container/canvas it is given, and no
   scroll-listening/IntersectionObserver code — that stays in
   interactions.js, which feeds this module a single continuous
   "stage progress" number each frame via the returned controller.

   Exposes: window.BondSite.ThreeScene.init(container, canvas, options)
   Returns a controller object, or throws if Three.js / WebGL is
   unavailable, so the caller can fall back to the static CSS paper visual.
   ========================================================================== */

window.BondSite = window.BondSite || {};

(function () {
  "use strict";

  var PAPER_SECONDARY = 0xF0F5FA;
  var FADED_BLUE = 0x829BB5;
  var INK_BLUE_HEX = "36,91,136";

  /* ------------------------------------------------------------------
     Stage keyframes for the scroll-driven storytelling.
     One entry per Home-page section (data-3d-stage on the section).
     "seal", "services" and "process" are 0..1 envelopes used to fade
     in/out the seal emphasis, the services paper-stack and the process
     progression group as the matching section comes into view.
     ------------------------------------------------------------------ */

  var STAGES = [
    { id: "hero",     rot: { x: -0.09, y:  0.10 }, pos: { x: 0.00,  y: 0.00, z: 0 },   cam: { x: 0.00,  y: 0.00 }, seal: 1.00, services: 0.00, process: 0.00 },
    { id: "intro",    rot: { x: -0.06, y:  0.26 }, pos: { x: 0.16,  y: -0.02, z: 0 },  cam: { x: 0.05,  y: 0.00 }, seal: 0.65, services: 0.05, process: 0.00 },
    { id: "services", rot: { x: -0.05, y:  0.04 }, pos: { x: -0.06, y: 0.02, z: 0 },   cam: { x: -0.05, y: 0.02 }, seal: 0.45, services: 1.00, process: 0.00 },
    { id: "how",      rot: { x: -0.17, y: -0.10 }, pos: { x: 0.05,  y: 0.00, z: 0 },   cam: { x: 0.02,  y: -0.02 }, seal: 0.45, services: 0.05, process: 1.00 },
    { id: "trust",    rot: { x: -0.08, y:  0.14 }, pos: { x: 0.00,  y: 0.02, z: 0 },   cam: { x: 0.00,  y: 0.02 }, seal: 1.15, services: 0.00, process: 0.00 },
    { id: "cta",      rot: { x: -0.09, y:  0.10 }, pos: { x: 0.00,  y: 0.00, z: 0 },   cam: { x: 0.00,  y: 0.00 }, seal: 1.00, services: 0.00, process: 0.00 }
  ];

  var HOTSPOTS = [
    { id: "cover",        label: "YOUR COVER"  , x: -0.55, y:  0.62, target: "intro" },
    { id: "documents",    label: "DOCUMENTS",    x:  0.55, y:  0.62, target: "services" },
    { id: "process",      label: "PROCESS",      x: -0.55, y: -0.72, target: "how" },
    { id: "support",      label: "SUPPORT",      x:  0.55, y: -0.72, target: "cta" }
  ];

  /* ------------------------------------------------------------------
     Device-aware quality tiers. A fourth "minimal" tier sits below
     "low" for low-end phones specifically (small viewport AND weak
     hardware), rather than assuming every narrow viewport is weak.
     ------------------------------------------------------------------ */

  function isLowEndDevice() {
    var mem = navigator.deviceMemory;      // GB, when the browser exposes it
    var cores = navigator.hardwareConcurrency;
    if (typeof mem === "number" && mem > 0 && mem <= 3) return true;
    if (typeof cores === "number" && cores > 0 && cores <= 4) return true;
    return false;
  }

  function qualityTier(width) {
    if (width <= 480) return isLowEndDevice() ? "minimal" : "low";
    if (width <= 1024) return "medium";
    return "high";
  }

  var QUALITY = {
    minimal: { pixelRatio: 1.0,  sealSegments: 16, motionScale: 0.35, docScale: 0.5,  aniso: 1 },
    low:    { pixelRatio: 1.25, sealSegments: 24, motionScale: 0.55, docScale: 0.5,  aniso: 2 },
    medium: { pixelRatio: 1.6,  sealSegments: 32, motionScale: 0.8,  docScale: 0.75, aniso: 4 },
    high:   { pixelRatio: 2.0,  sealSegments: 48, motionScale: 1.0,  docScale: 1.0,  aniso: 8 }
  };

  /* ------------------------------------------------------------------
     Procedural textures (canvas-drawn, no binary assets required)
     ------------------------------------------------------------------ */

  function drawGrain(ctx, w, h, density) {
    var i, x, y, a;
    for (i = 0; i < density; i++) {
      x = Math.random() * w;
      y = Math.random() * h;
      a = Math.random() * 0.035;
      ctx.fillStyle = "rgba(111,116,115," + a.toFixed(3) + ")";
      ctx.fillRect(x, y, 1, 1);
    }
  }

  function labelToTextureXY(hx, hy, w, h) {
    // hx/hy are in the same local units used for the plane (~-1.15..1.15, -1.45..1.45)
    var tx = (hx / 1.15) * 0.5 + 0.5;
    var ty = 0.5 - (hy / 1.45) * 0.5;
    return { x: tx * w, y: ty * h };
  }

  // Original, generic circular document seal. Deliberately abstract —
  // reads as "DOCUMENT VERIFIED", not any real emblem, seal or stamp.
  function createSealTexture() {
    var s = 256;
    var c = document.createElement("canvas");
    c.width = s; c.height = s;
    var ctx = c.getContext("2d");
    ctx.clearRect(0, 0, s, s);
    var cx = s / 2, cy = s / 2;

    ctx.strokeStyle = "rgba(40,109,150,0.85)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(127,169,188,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2);
    ctx.stroke();

    var i, ang, r1 = s * 0.42, r2 = s * 0.47;
    ctx.strokeStyle = "rgba(40,109,150,0.55)";
    ctx.lineWidth = 2;
    for (i = 0; i < 28; i++) {
      ang = (i / 28) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(22,75,104,0.85)";
    ctx.font = "600 15px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("DOCUMENT", cx, cy - 8);
    ctx.fillText("VERIFIED", cx, cy + 10);

    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  // A small, plain "sheet" texture reused by the services stack and the
  // process-progression mini documents — same paper language, lighter.
  function createMiniSheetTexture(withMark) {
    var w = 220, h = 280;
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    drawGrain(ctx, w, h, 500);
    ctx.strokeStyle = "rgba(40,109,150,0.5)";
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.strokeStyle = "rgba(111,116,115,0.18)";
    ctx.lineWidth = 1;
    var y;
    for (y = 40; y < h - 24; y += 18) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
    }
    if (withMark) {
      // original verification glyph: a simple circled diagonal tick-less
      // mark (two crossing strokes inside a ring) — not a copied icon set
      ctx.strokeStyle = "rgba(40,109,150,0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w - 40, 36, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w - 46, 36);
      ctx.lineTo(w - 40, 42);
      ctx.lineTo(w - 30, 28);
      ctx.stroke();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  /* ------------------------------------------------------------------
     PART 7 — Premium fictional bond-document artwork

     Everything below is drawn procedurally on 2D canvases (no image
     assets). The design is an ORIGINAL, fictional "Insurance Review
     Sheet" for Renoahbusinesshub: it borrows the general feel of a
     printed bond paper — ruled header, numbered clauses, signature
     block, security-style border and a stamped seal — without using
     any government emblem, seal, wording, stamp serial number or
     denomination.

     All artwork is laid out in one fixed logical space (DOC_W x DOC_H)
     and scaled to the device-quality tier, so the composition is the
     same on every device and only the pixel density changes. Random
     detail (grain, fibres, ink) comes from a seeded generator, so the
     document is identical on every load and when it is repainted.
     ------------------------------------------------------------------ */

  var DOC_W = 1024;
  var DOC_H = 1280;
  var FONT_DISPLAY = "'Special Elite', 'Courier Prime', 'Courier New', monospace";
  var FONT_BODY = "'Courier Prime', 'Courier New', monospace";

  var C_INK = "36,91,136";         // printed blue
  var C_INK_DEEP = "11,31,58";     // headings
  var C_INK_FADE = "130,155,181";  // watermark
  var C_PEN = "18,52,90";          // hand-written blue pen
  var C_TYPE = "38,53,72";         // printed body text
  var C_GREY = "71,85,105";
  var C_CREAM = "255,255,255";     // light text used on the blue banner
  var C_ACCENT = "150,74,46";      // muted terracotta, for the region/serial line
  var PAPER_TONE = "#FFFFFF";

  // A printed medallion — concentric rings, a tick collar and an "RH"
  // monogram — the document's ORIGINAL fictional emblem. Deliberately
  // abstract and geometric so it reads as "an official-looking seal"
  // without resembling any real national or governmental emblem.
  function printedMedallion(ctx, cx, cy, r, color, alpha) {
    var i, ang;
    ctx.save();
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = Math.max(0.8, r * 0.045);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = Math.max(0.5, r * 0.02);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2); ctx.stroke();
    for (i = 0; i < 32; i++) {
      ang = (i / 32) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r * 0.86, cy + Math.sin(ang) * r * 0.86);
      ctx.lineTo(cx + Math.cos(ang) * r * 0.97, cy + Math.sin(ang) * r * 0.97);
      ctx.stroke();
    }
    rosette(ctx, cx, cy, r * 0.6, 12, 0.42, color, Math.max(0.05, alpha * 0.55), Math.max(0.5, r * 0.018));
    ctx.lineWidth = Math.max(0.5, r * 0.022);
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2); ctx.stroke();
    ctx.font = "italic 700 " + Math.max(9, r * 0.62) + "px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(color, Math.min(1, alpha + 0.08));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("RH", cx, cy + r * 0.03);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  var PANEL_COPY = {
    "cover":        ["Family cover, benefits and exclusions", "stated plainly, before you decide."],
    "documents":    ["Policy papers for each plan,", "listed clearly in one place."],
    "process":      ["Share, discuss, understand, decide", "\u2014 four steps, each explained."],
    "support":      ["Claim guidance from a named", "advisor, in plain language."]
  };

  var CLAUSES = [
    { title: "Parties",
      body: "This note records an enquiry made by the person named in the Schedule to Renoahbusinesshub, an insurance advisory office, to understand the insurance options that may suit their needs." },
    { title: "Options",
      body: "The advisor explains the options that may apply, including benefits, costs, exclusions and conditions, so the person can compare them before deciding whether to proceed." },
    { title: "Premiums",
      body: "Premium amounts, payment frequency and due dates are set by the insurer and stated in the policy documents. Please read them carefully before making any purchase." },
    { title: "Charges",
      body: "Charges, exclusions and waiting periods vary by product and insurer. Each applicable item is explained in plain words before the person decides to go ahead." },
    { title: "Acknowledgement",
      body: "Both parties confirm that this note is a general guide only. Actual benefits and eligibility depend on insurer terms, underwriting and the policy documents." }
  ];

  function rgba(c, a) { return "rgba(" + c + "," + a + ")"; }

  // Small seeded PRNG (mulberry32) — keeps the artwork identical every load.
  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      var t;
      a = (a + 0x6D2B79F5) >>> 0;
      t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /* ---- generic drawing helpers ------------------------------------- */

  // Letter-spaced text (drawn glyph by glyph so it works in every browser).
  function spaced(ctx, str, x, y, sp, align) {
    var i, w = 0, ws = [], cx, prev = ctx.textAlign;
    for (i = 0; i < str.length; i++) {
      ws[i] = ctx.measureText(str.charAt(i)).width;
      w += ws[i];
    }
    w += sp * (str.length - 1);
    cx = align === "center" ? x - w / 2 : (align === "right" ? x - w : x);
    ctx.textAlign = "left";
    for (i = 0; i < str.length; i++) {
      ctx.fillText(str.charAt(i), cx, y);
      cx += ws[i] + sp;
    }
    ctx.textAlign = prev;
    return w;
  }

  // Justified paragraph; the last line stays ragged. Returns last baseline.
  function justifyBlock(ctx, text, x, y, width, lh) {
    var words = text.split(" "), lines = [], line = [], i, test;
    for (i = 0; i < words.length; i++) {
      test = line.concat(words[i]).join(" ");
      if (line.length && ctx.measureText(test).width > width) {
        lines.push(line);
        line = [words[i]];
      } else {
        line.push(words[i]);
      }
    }
    lines.push(line);
    ctx.textAlign = "left";
    lines.forEach(function (ln, li) {
      var wordsW = 0, gap, cx = x;
      if (li === lines.length - 1 || ln.length < 2) {
        ctx.fillText(ln.join(" "), x, y + li * lh);
        return;
      }
      ln.forEach(function (wd) { wordsW += ctx.measureText(wd).width; });
      gap = (width - wordsW) / (ln.length - 1);
      ln.forEach(function (wd) {
        ctx.fillText(wd, cx, y + li * lh);
        cx += ctx.measureText(wd).width + gap;
      });
    });
    return y + (lines.length - 1) * lh;
  }

  function hline(ctx, x0, x1, y, color, alpha, lw) {
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }

  function diamond(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
  }

  function chamferPath(ctx, x, y, w, h, c) {
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
  }

  // Overlapping ellipses -> a guilloche-style rosette.
  function rosette(ctx, cx, cy, R, n, ratio, color, alpha, lw) {
    var i;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = lw;
    for (i = 0; i < n; i++) {
      ctx.rotate(Math.PI / n);
      ctx.beginPath();
      ctx.ellipse(0, 0, R, R * ratio, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Text set along a circle. top=true reads clockwise across the top
  // (baseline on radius r); top=false reads left-to-right across the
  // bottom with glyph tops facing the centre.
  function arcText(ctx, str, cx, cy, r, sp, top) {
    var i, ws = [], total = 0, ang, phi;
    for (i = 0; i < str.length; i++) {
      ws[i] = ctx.measureText(str.charAt(i)).width;
      total += ws[i] + sp;
    }
    total -= sp;
    ang = -(total / r) / 2;
    ctx.textAlign = "center";
    for (i = 0; i < str.length; i++) {
      phi = ang + (ws[i] / 2) / r;
      ctx.save();
      if (top) {
        ctx.translate(cx + r * Math.sin(phi), cy - r * Math.cos(phi));
        ctx.rotate(phi);
      } else {
        ctx.translate(cx + r * Math.sin(phi), cy + r * Math.cos(phi));
        ctx.rotate(-phi);
      }
      ctx.fillText(str.charAt(i), 0, 0);
      ctx.restore();
      ang += (ws[i] + sp) / r;
    }
  }

  /* ---- paper ------------------------------------------------------- */

  function paintPaperBase(ctx, rng, tone, density, w, h) {
    var W = w || DOC_W, H = h || DOC_H, i, x, y, r, a, g, len, ang, fibers, specks;

    ctx.fillStyle = tone;
    ctx.fillRect(0, 0, W, H);

    // soft, cloudy tonal variation across the sheet
    for (i = 0; i < 18; i++) {
      x = rng() * W;
      y = rng() * H;
      r = (0.18 + rng() * 0.32) * W;
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
      if (rng() > 0.5) {
        g.addColorStop(0, "rgba(130,155,181,0.04)");
        g.addColorStop(1, "rgba(130,155,181,0)");
      } else {
        g.addColorStop(0, "rgba(255,255,255,0.10)");
        g.addColorStop(1, "rgba(255,255,255,0)");
      }
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // short paper fibres
    fibers = Math.round(((W * H) / 900) * density);
    ctx.lineCap = "round";
    for (i = 0; i < fibers; i++) {
      x = rng() * W;
      y = rng() * H;
      len = 5 + rng() * 18;
      ang = rng() * Math.PI * 2;
      a = 0.025 + rng() * 0.05;
      ctx.strokeStyle = rng() > 0.45
        ? "rgba(71,85,105," + a.toFixed(3) + ")"
        : "rgba(255,255,255," + (a * 1.6).toFixed(3) + ")";
      ctx.lineWidth = 0.5 + rng() * 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(
        x + Math.cos(ang + 0.8) * len * 0.5, y + Math.sin(ang + 0.8) * len * 0.5,
        x + Math.cos(ang) * len, y + Math.sin(ang) * len
      );
      ctx.stroke();
    }

    // fine speckle grain
    specks = Math.round(((W * H) / 230) * density);
    for (i = 0; i < specks; i++) {
      a = rng() * 0.05;
      ctx.fillStyle = "rgba(111,116,115," + a.toFixed(3) + ")";
      ctx.fillRect(rng() * W, rng() * H, 1, 1);
    }

    // a few darker inclusions, like real rag paper
    for (i = 0; i < 26; i++) {
      ctx.fillStyle = "rgba(18,52,90," + (0.04 + rng() * 0.04).toFixed(3) + ")";
      ctx.beginPath();
      ctx.arc(rng() * W, rng() * H, 0.6 + rng() * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // gentle edge ageing
    g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.52);
    g.addColorStop(0, "rgba(18,52,90,0)");
    g.addColorStop(1, "rgba(18,52,90,0.06)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---- hand-written blue pen (signatures, entries, paraphs) -------- */

  function handwriting(x, y, w, h, rng, loops, tall) {
    var pts = [], n = 300, i, t, a, ang, k, f, lo, hi, u;
    var ph = rng() * 6.283, ph3 = rng() * 6.283;
    var kx = (w / (loops * 6.283)) * 1.25;   // partial loops -> cusps, like joined letters
    var letters = [];
    for (k = 0; k <= loops + 1; k++) letters.push(0.3 + rng() * 0.7);
    letters[0] = Math.max(letters[0], 0.55 + tall * 0.45);   // capital
    for (i = 0; i <= n; i++) {
      t = i / n;
      // uneven pace, so the loops are not evenly spaced
      ang = (t + 0.05 * Math.sin(t * 13 + ph3)) * loops * 6.283 + ph;
      f = t * loops;
      lo = Math.floor(f);
      hi = lo + 1;
      u = f - lo;
      u = u * u * (3 - 2 * u);
      a = letters[lo] + (letters[hi] - letters[lo]) * u;
      pts.push([
        x + t * w + Math.sin(ang) * kx + (1 - a) * h * 0.35,      // lean to the right
        y - h * a * (0.5 + 0.5 * Math.cos(ang))
      ]);
    }
    return pts;
  }

  function penStroke(ctx, pts, width, alpha) {
    var i, n = pts.length, t;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = rgba(C_PEN, alpha);
    for (i = 1; i < n; i++) {
      t = i / n;
      ctx.lineWidth = width * (0.55 + 0.6 * Math.sin(Math.PI * t));
      ctx.beginPath();
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }

  function signature(ctx, x, y, w, h, rng, loops) {
    var i, t, fl = [];
    penStroke(ctx, handwriting(x, y, w, h, rng, loops, 0.7), 2.0, 0.92);
    // underline flourish, swept back under the name
    for (i = 0; i <= 30; i++) {
      t = i / 30;
      fl.push([
        (1 - t) * (1 - t) * (x + w * 0.98) + 2 * (1 - t) * t * (x + w * 0.55) + t * t * (x + w * 0.06),
        (1 - t) * (1 - t) * (y - h * 0.02) + 2 * (1 - t) * t * (y + h * 0.34) + t * t * (y + h * 0.10)
      ]);
    }
    penStroke(ctx, fl, 1.4, 0.85);
  }

  function scribble(ctx, x, y, w, h, rng, loops) {
    penStroke(ctx, handwriting(x, y, w, h, rng, loops, 0.0), 1.4, 0.9);
  }

  /* ---- printed furniture ------------------------------------------- */

  function fieldLine(ctx, x0, x1, y, label) {
    var w;
    ctx.font = "600 9px " + FONT_BODY;
    ctx.fillStyle = rgba(C_GREY, 0.95);
    w = spaced(ctx, label, x0, y, 1.6, "left");
    hline(ctx, x0 + w + 8, x1, y + 2, C_INK_DEEP, 0.45, 0.9);
    return x0 + w + 8;
  }

  function drawPanel(ctx, cx, cy, w, h, index, label, copy) {
    var x = cx - w / 2, y = cy - h / 2;

    chamferPath(ctx, x, y, w, h, 12);
    ctx.fillStyle = rgba(C_INK_FADE, 0.05);
    ctx.fill();
    ctx.strokeStyle = rgba(C_INK, 0.62);
    ctx.lineWidth = 1.4;
    ctx.stroke();

    chamferPath(ctx, x + 6, y + 6, w - 12, h - 12, 8);
    ctx.strokeStyle = rgba(C_INK, 0.26);
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // section tag + hairline
    ctx.font = "600 10px " + FONT_BODY;
    ctx.fillStyle = rgba(C_INK, 0.8);
    spaced(ctx, "SECTION 0" + (index + 1), x + 22, y + 27, 1.8, "left");
    ctx.fillStyle = rgba(C_INK, 0.7);
    diamond(ctx, x + w - 26, y + 23, 3.2);
    hline(ctx, x + 20, x + w - 20, y + 36, C_INK, 0.24, 0.8);

    // hotspot label — sits on the raycast zone centre
    ctx.font = "600 23px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.96);
    spaced(ctx, label, cx, y + 81, 2.6, "center");

    // fine print beneath
    ctx.font = "italic 400 10.5px " + FONT_BODY;
    ctx.fillStyle = rgba(C_GREY, 0.92);
    ctx.textAlign = "center";
    ctx.fillText(copy[0], cx, y + 110);
    ctx.fillText(copy[1], cx, y + 125);
  }

  function drawWatermark(ctx, cx, cy) {
    ctx.save();
    rosette(ctx, cx, cy, 262, 26, 0.34, C_INK_FADE, 0.075, 0.9);
    rosette(ctx, cx, cy, 214, 19, 0.5, C_INK_FADE, 0.06, 0.8);
    ctx.strokeStyle = rgba(C_INK_FADE, 0.08);
    ctx.lineWidth = 1;
    [270, 232, 150, 96].forEach(function (r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    shieldFamilyEmblem(ctx, cx, cy, 1.0);
    ctx.restore();
  }

  /* MODIFICATION v3 — insurance emblem for the hero document.
     A shield containing a parent/parent/child group: "family protection".
     Drawn on the existing document texture (no extra scene or library). */
  function shieldFamilyEmblem(ctx, cx, cy, k) {
    var w = 150 * k, h = 178 * k, top = cy - h / 2;
    function person(x, y, r, bodyH) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - r * 1.5, y + r * 2 + bodyH);
      ctx.quadraticCurveTo(x - r * 1.5, y + r * 1.3, x, y + r * 1.3);
      ctx.quadraticCurveTo(x + r * 1.5, y + r * 1.3, x + r * 1.5, y + r * 2 + bodyH);
      ctx.closePath(); ctx.fill();
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.bezierCurveTo(cx + w * 0.30, top + h * 0.10, cx + w * 0.62, top + h * 0.10, cx + w * 0.62, top + h * 0.16);
    ctx.lineTo(cx + w * 0.62, top + h * 0.52);
    ctx.bezierCurveTo(cx + w * 0.62, top + h * 0.78, cx + w * 0.20, top + h * 0.92, cx, top + h);
    ctx.bezierCurveTo(cx - w * 0.20, top + h * 0.92, cx - w * 0.62, top + h * 0.78, cx - w * 0.62, top + h * 0.52);
    ctx.lineTo(cx - w * 0.62, top + h * 0.16);
    ctx.bezierCurveTo(cx - w * 0.62, top + h * 0.10, cx - w * 0.30, top + h * 0.10, cx, top);
    ctx.closePath();
    ctx.fillStyle = rgba(C_INK_FADE, 0.05); ctx.fill();
    ctx.strokeStyle = rgba(C_INK_FADE, 0.16); ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = rgba(C_INK_FADE, 0.14);
    person(cx - 28 * k, cy - 40 * k, 11 * k, 30 * k);
    person(cx + 28 * k, cy - 40 * k, 11 * k, 30 * k);
    person(cx, cy - 6 * k, 8 * k, 20 * k);
    ctx.restore();
  }

  // Faint dry-emboss impression (paired with the bump map). mode "ink"
  // draws its flat-light colour cue; mode "bump" draws raised relief.
  function embossSeal(ctx, cx, cy, r, mode) {
    var i, ang, k = r / 56; // original metrics were tuned for r=56 (Home page)
    ctx.save();
    ctx.lineCap = "round";
    if (mode === "bump") {
      ctx.shadowColor = "rgba(255,255,255,0.9)";
      ctx.shadowBlur = Math.max(1, 3 * k);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.fillStyle = "rgba(255,255,255,0.5)";
    }
    ctx.lineWidth = Math.max(0.6, 3 * k);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = Math.max(0.4, 1.6 * k);
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r - 9 * k), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, r - 26 * k), 0, Math.PI * 2); ctx.stroke();
    for (i = 0; i < 44; i++) {
      ang = (i / 44) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(ang) * (r - 17.5 * k), cy + Math.sin(ang) * (r - 17.5 * k), Math.max(0.5, 1.4 * k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = "italic 600 " + Math.max(10, Math.round(40 * k)) + "px " + FONT_DISPLAY;
    ctx.textAlign = "center";
    ctx.fillText("RH", cx, cy + 13 * k);
    if (mode === "ink") {
      // the shaded edge of the relief, offset opposite the highlight
      ctx.strokeStyle = "rgba(90,80,60,0.10)";
      ctx.lineWidth = Math.max(0.5, 2.2 * k);
      ctx.beginPath(); ctx.arc(cx + 1.6 * k, cy + 1.6 * k, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 1.6 * k, cy + 1.6 * k, Math.max(0.5, r - 26 * k), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  var EMBOSS = { x: 512, y: 1094, r: 56 };

  /* ---- the main sheet ---------------------------------------------- */

  function paintBondDocument(ctx, rng) {
    var W = DOC_W, X0 = 100, X1 = 924;
    var i, x, y, w, p, lastY;

    paintPaperBase(ctx, rng, PAPER_TONE, 1);
    drawWatermark(ctx, W / 2, 668);

    /* -- header: shared bond-note banner (brand, grade marks, seal,
       region line and reference) — same block every page uses -------- */
    paintCompactHeader(ctx, W, DOC_H, 1, rng, X0, X1, "Insurance Advisory Office", 9);

    /* -- title block ------------------------------------------------ */
    ctx.font = "600 42px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.95);
    spaced(ctx, "INSURANCE REVIEW SHEET", W / 2, 224, 5, "center");
    ctx.font = "italic 500 18.5px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_GREY, 0.95);
    ctx.textAlign = "center";
    ctx.fillText("Family protection \u00B7 Financial security \u00B7 Policy summary", W / 2, 250);

    hline(ctx, 300, 478, 269, C_INK, 0.5, 1);
    hline(ctx, 546, 724, 269, C_INK, 0.5, 1);
    hline(ctx, 300, 478, 272, C_INK, 0.22, 0.7);
    hline(ctx, 546, 724, 272, C_INK, 0.22, 0.7);
    ctx.fillStyle = rgba(C_INK, 0.8);
    diamond(ctx, W / 2, 270, 5.5);
    ctx.beginPath(); ctx.arc(W / 2 - 18, 270, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W / 2 + 18, 270, 1.8, 0, Math.PI * 2); ctx.fill();

    /* -- the four section panels (hotspot labels live here) -------- */
    HOTSPOTS.forEach(function (hs, idx) {
      var c = labelToTextureXY(hs.x, hs.y, DOC_W, DOC_H);
      drawPanel(ctx, c.x, c.y, 334, 150, idx, hs.label, PANEL_COPY[hs.id] || ["", ""]);
    });

    // small ornament in the gutter between the two panel columns
    [366, 958].forEach(function (cy) {
      hline(ctx, 490, 534, cy, C_INK, 0.28, 0.8);
      ctx.fillStyle = rgba(C_INK, 0.55);
      diamond(ctx, W / 2, cy, 3.4);
    });

    /* -- numbered clauses ------------------------------------------ */
    ctx.font = "600 12px " + FONT_BODY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.92);
    w = spaced(ctx, "TERMS OF THE FACILITY", X0, 498, 3.2, "left");
    hline(ctx, X0 + w + 16, X1, 494, C_INK, 0.32, 0.8);

    y = 530;
    for (i = 0; i < CLAUSES.length; i++) {
      ctx.font = "600 13px " + FONT_BODY;
      ctx.fillStyle = rgba(C_INK, 0.95);
      ctx.textAlign = "left";
      ctx.fillText((i + 1) + ".", X0 + 4, y);

      ctx.font = "600 10.5px " + FONT_BODY;
      ctx.fillStyle = rgba(C_INK_DEEP, 0.88);
      spaced(ctx, CLAUSES[i].title.toUpperCase(), X0 + 32, y, 2, "left");

      ctx.font = "400 13px " + FONT_BODY;
      ctx.fillStyle = rgba(C_TYPE, 0.84);
      lastY = justifyBlock(ctx, CLAUSES[i].body, X0 + 32, y + 20, X1 - X0 - 32, 19);

      if (i < CLAUSES.length - 1) {
        hline(ctx, X0 + 32, X1, lastY + 12, C_GREY, 0.14, 0.7);
      }
      y = lastY + 30;
    }

    // hand-written paraph initials in the right margin
    ctx.save();
    ctx.translate(947, 668); ctx.rotate(-0.25);
    scribble(ctx, -12, 0, 26, 17, rng, 3);
    ctx.restore();
    ctx.save();
    ctx.translate(947, 804); ctx.rotate(-0.2);
    scribble(ctx, -12, 0, 26, 17, rng, 3);
    ctx.restore();

    /* -- lower section panels are drawn above; signature block ---- */
    p = { y: 1140 };
    [[100, 340], [400, 624], [690, 924]].forEach(function (col) {
      hline(ctx, col[0], col[1], p.y, C_INK_DEEP, 0.62, 1.1);
    });
    ctx.font = "600 9.5px " + FONT_BODY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.9);
    spaced(ctx, "CLIENT", 100, 1157, 2.2, "left");
    spaced(ctx, "WITNESS", 400, 1157, 2.2, "left");
    spaced(ctx, "ADVISOR", 690, 1157, 2.2, "left");
    ctx.font = "italic 500 11.5px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_GREY, 0.95);
    ctx.textAlign = "left";
    ctx.fillText("Signature and date", 100, 1171);
    ctx.fillText("Name and signature", 400, 1171);
    ctx.fillText("For Renoahbusinesshub", 690, 1171);

    // blue-pen signatures
    signature(ctx, 116, 1128, 186, 50, rng, 8);
    signature(ctx, 424, 1130, 118, 30, rng, 6);
    signature(ctx, 716, 1130, 176, 46, rng, 7);
    // small hand-written date beside the client's line
    scribble(ctx, 262, 1134, 72, 12, rng, 4);

    // dry-emboss ring (relief comes from the bump map; this is the flat-light cue)
    embossSeal(ctx, EMBOSS.x, EMBOSS.y, EMBOSS.r, "ink");

    /* -- footer ---------------------------------------------------- */
    hline(ctx, X0, X1, 1187, C_INK_DEEP, 0.4, 0.9);
    ctx.font = "600 8.5px " + FONT_BODY;
    ctx.fillStyle = rgba(C_GREY, 0.95);
    spaced(ctx, "RENOAHBUSINESSHUB \u00B7 INSURANCE ADVISORY OFFICE", X0, 1203, 1.6, "left");
    spaced(ctx, "SPECIMEN LAYOUT \u2014 FOR ILLUSTRATION ONLY", X1, 1203, 1.6, "right");
    ctx.font = "italic 500 11px " + FONT_DISPLAY;
    ctx.textAlign = "center";
    ctx.fillText("Page 1 of 1", W / 2, 1203);
  }

  /* ---- bump (relief) map: paper tooth + embossed dry seal ---------- */

  function paintBondBump(ctx, rng) {
    var W = DOC_W, H = DOC_H, i, x, y, len, ang, a;
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, W, H);

    for (i = 0; i < 9000; i++) {
      a = 0.02 + rng() * 0.05;
      ctx.fillStyle = rng() > 0.5 ? "rgba(255,255,255," + a.toFixed(3) + ")" : "rgba(0,0,0," + a.toFixed(3) + ")";
      ctx.fillRect(rng() * W, rng() * H, 2, 2);
    }
    ctx.lineCap = "round";
    for (i = 0; i < 700; i++) {
      x = rng() * W; y = rng() * H;
      len = 8 + rng() * 22; ang = rng() * Math.PI * 2;
      a = 0.03 + rng() * 0.06;
      ctx.strokeStyle = rng() > 0.5 ? "rgba(255,255,255," + a.toFixed(3) + ")" : "rgba(0,0,0," + a.toFixed(3) + ")";
      ctx.lineWidth = 1.2 + rng() * 1.2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
    embossSeal(ctx, EMBOSS.x, EMBOSS.y, EMBOSS.r, "bump");
  }

  /* ---- printed border layer (its own plane, sits just above paper) - */

  function waveLine(ctx, horizontal, fixed, from, to, amp, wl, phase) {
    var s, off;
    ctx.beginPath();
    for (s = from; s <= to; s += 2) {
      off = fixed + amp * Math.sin(((s - from) / wl) * 6.2832 + phase);
      if (horizontal) {
        if (s === from) ctx.moveTo(s, off); else ctx.lineTo(s, off);
      } else {
        if (s === from) ctx.moveTo(off, s); else ctx.lineTo(off, s);
      }
    }
    ctx.stroke();
  }

  function paintBondBorder(ctx) {
    var W = DOC_W, H = DOC_H, c = 44, from = 76;
    ctx.clearRect(0, 0, W, H);

    ctx.strokeStyle = rgba(C_INK, 0.9);
    ctx.lineWidth = 5;
    ctx.strokeRect(24, 24, W - 48, H - 48);
    ctx.strokeStyle = rgba(C_INK, 0.6);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(33, 33, W - 66, H - 66);

    // interlaced guilloche band
    [
      [0, 6.5, 24, 1.1, 0.62],
      [Math.PI, 6.5, 24, 1.1, 0.62],
      [0, 3.2, 12, 0.7, 0.36]
    ].forEach(function (wv) {
      ctx.strokeStyle = rgba(C_INK, wv[4]);
      ctx.lineWidth = wv[3];
      waveLine(ctx, true, c, from, W - from, wv[1], wv[2], wv[0]);
      waveLine(ctx, true, H - c, from, W - from, wv[1], wv[2], wv[0]);
      waveLine(ctx, false, c, from, H - from, wv[1], wv[2], wv[0]);
      waveLine(ctx, false, W - c, from, H - from, wv[1], wv[2], wv[0]);
    });

    // inner frame rules
    ctx.strokeStyle = rgba(C_INK, 0.72);
    ctx.lineWidth = 1.6;
    ctx.strokeRect(57, 57, W - 114, H - 114);
    ctx.strokeStyle = rgba(C_INK, 0.36);
    ctx.lineWidth = 0.7;
    ctx.strokeRect(62, 62, W - 124, H - 124);

    // corner rosettes (masked disc first so the frame rules stop cleanly)
    [[c, c], [W - c, c], [c, H - c], [W - c, H - c]].forEach(function (pt) {
      ctx.fillStyle = "rgba(246,241,229,1)";
      ctx.beginPath(); ctx.arc(pt[0], pt[1], 25, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(C_INK, 0.85);
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(pt[0], pt[1], 24, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = rgba(C_INK, 0.5);
      ctx.beginPath(); ctx.arc(pt[0], pt[1], 19, 0, Math.PI * 2); ctx.stroke();
      rosette(ctx, pt[0], pt[1], 17, 9, 0.42, C_INK, 0.6, 0.8);
      ctx.fillStyle = rgba(C_INK, 0.85);
      ctx.beginPath(); ctx.arc(pt[0], pt[1], 2.2, 0, Math.PI * 2); ctx.fill();
    });
  }

  /* ---- ink-stamp seal (own mesh, animated by the stage system) ----- */

  function drawSealArt(ctx, alpha) {
    var col = "26,84,140", n = 84, i, ang, rr, cx = 256, cy = 256;

    ctx.strokeStyle = rgba(col, alpha);
    ctx.fillStyle = rgba(col, alpha);
    ctx.lineJoin = "miter";

    // serrated outer edge
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (i = 0; i < n * 2; i++) {
      ang = (i / (n * 2)) * Math.PI * 2;
      rr = i % 2 === 0 ? 246 : 238;
      if (i === 0) ctx.moveTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
      else ctx.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, 226, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 178, 0, Math.PI * 2); ctx.stroke();

    // lettering ring
    ctx.font = "600 28px " + FONT_DISPLAY;
    arcText(ctx, "RENOAHBUSINESSHUB", cx, cy, 192, 6, true);
    ctx.font = "600 23px " + FONT_DISPLAY;
    arcText(ctx, "DOCUMENTED CLEARLY", cx, cy, 214, 4.5, false);
    diamond(ctx, cx - 202, cy, 5);
    diamond(ctx, cx + 202, cy, 5);

    // inner rosette + disc
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 170, 0, Math.PI * 2); ctx.stroke();
    rosette(ctx, cx, cy, 164, 22, 0.46, col, alpha * 0.5, 0.8);
    // keep the centre clear so the monogram and lettering stay legible
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    ctx.beginPath(); ctx.arc(cx, cy, 108, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba(col, alpha);
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(cx, cy, 112, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.arc(cx, cy, 104, 0, Math.PI * 2); ctx.stroke();

    // monogram + band
    ctx.font = "italic 600 104px " + FONT_DISPLAY;
    ctx.textAlign = "center";
    ctx.fillText("RH", cx, cy + 20);
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx - 80, cy + 40); ctx.lineTo(cx + 80, cy + 40); ctx.stroke();
    ctx.font = "600 18px " + FONT_DISPLAY;
    spaced(ctx, "VERIFIED", cx, cy + 66, 5, "center");
    ctx.beginPath(); ctx.moveTo(cx - 62, cy + 76); ctx.lineTo(cx + 62, cy + 76); ctx.stroke();
  }

  function paintBondSeal(ctx, rng) {
    var i, x, y, r, g, S = 512;
    ctx.clearRect(0, 0, S, S);

    // a faint offset "second strike" first, then the main impression on top
    ctx.save();
    ctx.translate(2.4, 1.6);
    drawSealArt(ctx, 0.14);
    ctx.restore();
    drawSealArt(ctx, 0.9);

    // uneven pressure: knock speckles and soft blotches out of the ink
    ctx.globalCompositeOperation = "destination-out";
    for (i = 0; i < 1100; i++) {
      x = rng() * S; y = rng() * S; r = 0.5 + rng() * 1.7;
      ctx.fillStyle = "rgba(0,0,0," + (0.25 + rng() * 0.75).toFixed(2) + ")";
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (i = 0; i < 16; i++) {
      x = rng() * S; y = rng() * S; r = 18 + rng() * 34;
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(0,0,0,0.30)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---- back sheets (printed copies further down the stack) --------- */

  function paintGhostSheet(ctx, rng, tone, offset) {
    var W = DOC_W, H = DOC_H, y, len;
    paintPaperBase(ctx, rng, tone, 0.3);

    ctx.strokeStyle = rgba(C_INK, 0.34);
    ctx.lineWidth = 4;
    ctx.strokeRect(28, 28, W - 56, H - 56);
    ctx.strokeStyle = rgba(C_INK, 0.2);
    ctx.lineWidth = 1.2;
    ctx.strokeRect(44, 44, W - 88, H - 88);

    ctx.fillStyle = rgba(C_INK_DEEP, 0.26);
    ctx.fillRect(100, 108, 300, 9);
    ctx.fillStyle = rgba(C_GREY, 0.14);
    ctx.fillRect(100, 128, 190, 5);
    hline(ctx, 100, W - 100, 166, C_INK_DEEP, 0.3, 1.2);

    ctx.fillStyle = rgba(C_INK_DEEP, 0.22);
    ctx.fillRect(W / 2 - 230 + offset, 218, 460, 12);

    for (y = 300; y < H - 170; y += 25) {
      len = (W - 200) * (0.86 + rng() * 0.14);
      if (rng() > 0.86) len *= 0.45;
      ctx.fillStyle = rgba(C_GREY, 0.11);
      ctx.fillRect(100, y, len, 5);
    }
    hline(ctx, 100, 324, H - 150, C_INK_DEEP, 0.3, 1);
    hline(ctx, 700, W - 100, H - 150, C_INK_DEEP, 0.3, 1);
  }

  function createShadowTexture() {
    var c = makeCanvas(256, 320), ctx = c.getContext("2d");
    ctx.shadowColor = "rgba(58,52,40,0.5)";
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 1000;
    ctx.fillStyle = "#000";
    ctx.fillRect(30 - 1000, 36, 196, 247);
    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  /* ---- builds and owns every canvas/texture for the hero document -- */

  function createBondArt(quality, maxAniso) {
    var s = quality.docScale;
    var mainC = makeCanvas(DOC_W * s, DOC_H * s);
    // relief map is polish only: skipped entirely on the low-end tiers
    var useBump = s >= 0.75;
    var bumpC = useBump ? makeCanvas(512, 640) : null;
    var borderC = makeCanvas(DOC_W * s, DOC_H * s);
    var sealC = makeCanvas(512 * Math.max(0.5, s), 512 * Math.max(0.5, s));
    var backAC = makeCanvas(DOC_W * s * 0.5, DOC_H * s * 0.5);
    var backBC = makeCanvas(DOC_W * s * 0.5, DOC_H * s * 0.5);

    function begin(canvas, sx, sy) {
      var ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      return ctx;
    }

    var art = {};

    art.repaint = function () {
      paintBondDocument(begin(mainC, mainC.width / DOC_W, mainC.height / DOC_H), makeRng(7101));
      if (useBump) paintBondBump(begin(bumpC, bumpC.width / DOC_W, bumpC.height / DOC_H), makeRng(7102));
      paintBondBorder(begin(borderC, borderC.width / DOC_W, borderC.height / DOC_H));
      paintBondSeal(begin(sealC, sealC.width / 512, sealC.height / 512), makeRng(7103));
      paintGhostSheet(begin(backAC, backAC.width / DOC_W, backAC.height / DOC_H), makeRng(7104), "#FFFFFF", 0);
      paintGhostSheet(begin(backBC, backBC.width / DOC_W, backBC.height / DOC_H), makeRng(7105), "#F0F5FA", 60);
      [art.main, art.bump, art.border, art.seal, art.backA, art.backB].forEach(function (t) {
        if (t) t.needsUpdate = true;
      });
    };

    art.main = new THREE.CanvasTexture(mainC);
    art.bump = useBump ? new THREE.CanvasTexture(bumpC) : null;
    art.border = new THREE.CanvasTexture(borderC);
    art.seal = new THREE.CanvasTexture(sealC);
    art.backA = new THREE.CanvasTexture(backAC);
    art.backB = new THREE.CanvasTexture(backBC);
    art.shadow = createShadowTexture();
    [art.main, art.border, art.seal].forEach(function (t) { t.anisotropy = maxAniso; });

    art.repaint();
    return art;
  }

  /* ------------------------------------------------------------------
     Gentle paper curvature. One function shared by every layer that sits
     on the sheet (paper, border, seal, hotspot zones), so nothing ever
     slips beneath the surface: a shallow bow plus a soft lift at the
     top-right corner. Displaces z only.
     ------------------------------------------------------------------ */

  function paperBend(x, y) {
    var a = x / 1.15, b = y / 1.45;
    var bow = 0.012 * (1 - a * a) * (1 - b * b);
    var dx = 1 - a, dy = 1 - b;
    var c = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 0.85);
    return bow + 0.05 * c * c;
  }

  function bendGeometry(geo, ox, oy) {
    var pos = geo.attributes.position, i;
    for (i = 0; i < pos.count; i++) {
      pos.setZ(i, pos.getZ(i) + paperBend(pos.getX(i) + ox, pos.getY(i) + oy));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /* ------------------------------------------------------------------
     Scene builders
     ------------------------------------------------------------------ */

  function buildPaperGroup(sealSegments, art) {
    var group = new THREE.Group();
    var refs = {};

    // soft contact shadow, well behind the stack
    var shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 3.6),
      new THREE.MeshBasicMaterial({ map: art.shadow, transparent: true, depthWrite: false })
    );
    shadow.position.set(0.05, -0.12, -0.3);
    group.add(shadow);

    // two printed copies further down the stack
    var backB = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 2.9),
      new THREE.MeshStandardMaterial({ map: art.backB, roughness: 0.95, metalness: 0 })
    );
    backB.position.set(-0.07, -0.11, -0.18);
    backB.rotation.z = -0.03;
    group.add(backB);
    refs.backPaperFar = backB;

    var backPaper = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 2.9),
      new THREE.MeshStandardMaterial({ map: art.backA, roughness: 0.95, metalness: 0 })
    );
    backPaper.position.set(0.09, -0.07, -0.09);
    backPaper.rotation.z = 0.035;
    group.add(backPaper);
    refs.backPaper = backPaper;

    // the executed sheet: gently bowed, with paper-tooth relief
    var mainGeo = bendGeometry(new THREE.PlaneGeometry(2.3, 2.9, 24, 30), 0, 0);
    var mainMat = new THREE.MeshStandardMaterial({
      map: art.main, bumpMap: art.bump || null, bumpScale: 0.08,
      color: 0xffffff, roughness: 0.9, metalness: 0
    });
    var mainPaper = new THREE.Mesh(mainGeo, mainMat);
    group.add(mainPaper);
    refs.mainPaper = mainPaper;

    // printed border layer (same size as the sheet, just above it)
    var borderGeo = bendGeometry(new THREE.PlaneGeometry(2.3, 2.9, 24, 30), 0, 0);
    var borderMat = new THREE.MeshBasicMaterial({ map: art.border, transparent: true, depthWrite: false });
    // explicit order for the alpha layers: border, then seal, then hover cues
    // (see buildHotspots), so overlap never depends on camera angle
    var borderPlane = new THREE.Mesh(borderGeo, borderMat);
    borderPlane.position.z = 0.006;
    borderPlane.renderOrder = 1;
    group.add(borderPlane);
    refs.borderPlane = borderPlane;

    // ink-stamp seal, resting over the authorised-signatory corner
    var sealPos = { x: 0.714, y: -0.983 };
    var sealGeo = bendGeometry(new THREE.CircleGeometry(0.17, sealSegments), sealPos.x, sealPos.y);
    var sealMat = new THREE.MeshStandardMaterial({
      map: art.seal, transparent: true, roughness: 0.75, metalness: 0
    });
    var seal = new THREE.Mesh(sealGeo, sealMat);
    seal.position.set(sealPos.x, sealPos.y, 0.012);
    seal.rotation.z = -0.16;
    seal.renderOrder = 2;
    group.add(seal);
    refs.seal = seal;

    return { group: group, refs: refs };
  }

  // 4 thin "service" sheets, fanned out from a stacked resting position.
  function buildServicesStack() {
    var group = new THREE.Group();
    var count = 4;
    var sheets = [];
    var i, tex, geo, mat, mesh;
    for (i = 0; i < count; i++) {
      tex = createMiniSheetTexture(false);
      geo = new THREE.PlaneGeometry(0.62, 0.8);
      mat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.9, metalness: 0, transparent: true, opacity: 0
      });
      mesh = new THREE.Mesh(geo, mat);
      mesh.userData.restIndex = i;
      mesh.userData.hoverLift = 0;
      group.add(mesh);
      sheets.push(mesh);
    }
    // kept beyond the frame edge (as before the camera was pulled back)
    group.position.set(-1.95, -0.05, -0.3);
    group.rotation.y = 0.12;
    return { group: group, sheets: sheets };
  }

  // The "How It Works" 3D progression: application (one sheet),
  // verification (sheet + original mark), processing (aligned sheets).
  function buildProcessGroup() {
    var group = new THREE.Group();

    var appTex = createMiniSheetTexture(false);
    var appMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.9),
      new THREE.MeshStandardMaterial({ map: appTex, transparent: true, opacity: 0, roughness: 0.9 })
    );
    appMesh.position.set(0, 0, 0.05);
    group.add(appMesh);

    var verTex = createMiniSheetTexture(true);
    var verMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.9),
      new THREE.MeshStandardMaterial({ map: verTex, transparent: true, opacity: 0, roughness: 0.9 })
    );
    verMesh.position.set(0, 0, 0.06);
    group.add(verMesh);

    var procSheets = [];
    var i, m;
    for (i = 0; i < 3; i++) {
      m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.66, 0.86),
        new THREE.MeshStandardMaterial({
          map: createMiniSheetTexture(i === 2), transparent: true, opacity: 0, roughness: 0.9
        })
      );
      m.position.set(i * 0.09 - 0.09, -i * 0.05, 0.07 + i * 0.01);
      group.add(m);
      procSheets.push(m);
    }

    group.position.set(1.95, -0.15, -0.25);
    group.rotation.y = -0.14;

    return { group: group, appMesh: appMesh, verMesh: verMesh, procSheets: procSheets };
  }

  function buildHotspots(mainPaperMesh) {
    var group = new THREE.Group();
    var items = [];
    HOTSPOTS.forEach(function (hs) {
      var zoneGeo = bendGeometry(new THREE.PlaneGeometry(0.95, 0.5, 2, 2), hs.x, hs.y);
      // depthWrite off: an invisible-but-transparent plane must never
      // occlude the seal or ink that sits behind it.
      var zoneMat = new THREE.MeshBasicMaterial({
        color: FADED_BLUE, transparent: true, opacity: 0, depthWrite: false
      });
      var zone = new THREE.Mesh(zoneGeo, zoneMat);
      zone.position.set(hs.x, hs.y, 0.02);
      zone.userData.hotspot = hs;
      zone.renderOrder = 3;

      var underlineGeo = bendGeometry(new THREE.PlaneGeometry(0.5, 0.012, 8, 1), hs.x, hs.y - 0.04);
      var underlineMat = new THREE.MeshBasicMaterial({
        color: 0x286D96, transparent: true, opacity: 0, depthWrite: false
      });
      var underline = new THREE.Mesh(underlineGeo, underlineMat);
      underline.position.set(hs.x, hs.y - 0.04, 0.022);
      underline.scale.x = 0.001;
      underline.renderOrder = 4;

      group.add(zone);
      group.add(underline);
      items.push({ hs: hs, zone: zone, underline: underline, hover: 0 });
    });
    // hotspots live just in front of the main paper
    group.position.z = 0.0;
    return { group: group, items: items };
  }

  /* ------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------ */

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Triangular "tent" function: 1 at center, 0 at |x-center| >= width
  function tent(x, center, width) {
    var d = Math.abs(x - center);
    if (d >= width) return 0;
    return 1 - d / width;
  }

  function sampleStageField(progress, field) {
    var idx = clamp(Math.floor(progress), 0, STAGES.length - 2);
    var t = clamp(progress - idx, 0, 1);
    var a = STAGES[idx][field];
    var b = STAGES[idx + 1][field];
    if (typeof a === "number") return lerp(a, b, t);
    var out = {};
    Object.keys(a).forEach(function (k) { out[k] = lerp(a[k], b[k], t); });
    return out;
  }

  /* ------------------------------------------------------------------
     Public init
     ------------------------------------------------------------------ */

  function init(container, canvas, options) {
    if (typeof THREE === "undefined") {
      throw new Error("THREE is not available");
    }

    options = options || {};
    var reducedMotion = !!options.reducedMotion;
    var onHotspotClick = typeof options.onHotspotClick === "function" ? options.onHotspotClick : function () {};

    var tierName = qualityTier(window.innerWidth || 1024);
    var quality = QUALITY[tierName];

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, 1, 0.1, 10);
    var camBaseZ = 6.0;
    camera.position.set(0, 0, camBaseZ);

    // Light levels are balanced so the cream paper lands just under white:
    // the earlier 0.85 + 0.55 sum clipped the paper to pure white and
    // washed out every printed detail.
    scene.add(new THREE.AmbientLight(0xffffff, 0.74));
    var key = new THREE.DirectionalLight(0xfff8ea, 0.36);
    key.position.set(-1.4, 1.6, 2.2);
    scene.add(key);
    var rim = new THREE.DirectionalLight(FADED_BLUE, 0.35);
    rim.position.set(1.8, -0.6, -1.4);
    scene.add(rim);

    var maxAniso = 1;
    try { maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy() || 1, quality.aniso); } catch (e) { /* keep 1 */ }
    var art = createBondArt(quality, maxAniso);
    var built = buildPaperGroup(quality.sealSegments, art);
    var paperGroup = built.group;
    scene.add(paperGroup);

    var servicesStack = buildServicesStack();
    scene.add(servicesStack.group);

    var processBuilt = buildProcessGroup();
    scene.add(processBuilt.group);

    var hotspots = buildHotspots(built.refs.mainPaper);
    paperGroup.add(hotspots.group);

    /* ---- sizing / quality ---------------------------------------- */

    var isCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

    function pixelRatioCap() {
      var base = window.devicePixelRatio || 1;
      return Math.min(base, quality.pixelRatio, isCoarsePointer ? 1.6 : 2.2);
    }

    function resize() {
      var w = container.clientWidth || 1;
      var h = container.clientHeight || 1;
      camera.aspect = w / h;
      // Pull the camera back until the whole sheet (plus the stack behind
      // it and a little room to tilt) fits, whatever the container shape.
      var visH = Math.max(3.43, 2.75 / camera.aspect);
      camBaseZ = visH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatioCap());
      renderer.setSize(w, h, false);
      if (reducedMotion) renderOnce();
    }

    resize();

    var ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(container);
    } else {
      window.addEventListener("resize", resize);
    }

    // The artwork uses the site's display/body web fonts. If they finish
    // loading after the first paint, repaint once so the title, clauses
    // and seal lettering pick them up (falls back to Georgia otherwise).
    var destroyed = false;
    var fontsAlready = false;
    try {
      fontsAlready = !!(document.fonts && document.fonts.check &&
        document.fonts.check("400 42px 'Special Elite'") &&
        document.fonts.check("400 13px 'Courier Prime'"));
    } catch (e) { /* treat as not ready */ }
    if (!fontsAlready && document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load("400 42px 'Special Elite'"),
        document.fonts.load("italic 400 18px 'Courier Prime'"),
        document.fonts.load("400 13px 'Courier Prime'"),
        document.fonts.load("700 10px 'Courier Prime'")
      ]).then(function () {
        if (destroyed) return;
        art.repaint();
        if (reducedMotion) renderOnce();
      }).catch(function () { /* keep the fallback-font paint */ });
    }

    /* ---- pointer parallax (localized to the hero container) -------- */

    var target = { x: 0, y: 0 };
    var current = { x: 0, y: 0 };
    var raycaster = new THREE.Raycaster();
    var pointerNDC = new THREE.Vector2(2, 2); // start off-screen
    var hoveredId = null;

    function setFromClientPoint(clientX, clientY) {
      var rect = container.getBoundingClientRect();
      var nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      var ny = ((clientY - rect.top) / rect.height) * 2 - 1;
      var margin = 1.6;
      if (nx >= -margin && nx <= margin && ny >= -margin && ny <= margin) {
        target.x = clamp(nx, -1, 1);
        target.y = clamp(ny, -1, 1);
      }
      // NDC for raycasting only counts when inside the actual canvas rect
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      } else {
        pointerNDC.set(2, 2);
      }
    }

    function onPointerMove(e) { setFromClientPoint(e.clientX, e.clientY); }
    function onTouchMove(e) {
      if (!e.touches || !e.touches.length) return;
      setFromClientPoint(e.touches[0].clientX, e.touches[0].clientY);
    }
    function onPointerLeave() { target.x = 0; target.y = 0; pointerNDC.set(2, 2); }

    var hotspotsEnabled = true;

    function onClick() {
      if (!hotspotsEnabled || !hoveredId) return;
      var hs = HOTSPOTS.filter(function (h) { return h.id === hoveredId; })[0];
      if (hs) onHotspotClick(hs.target);
    }

    window.addEventListener("mousemove", onPointerMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("mouseleave", onPointerLeave);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onClick, { passive: true });

    /* ---- animation state -------------------------------------------- */

    var clock = new THREE.Clock();
    var rafId = null;
    var stageProgress = 0; // 0..(STAGES.length-1), fed by interactions.js

    function updateHotspotHover() {
      if (!hotspotsEnabled) {
        if (hoveredId) { hoveredId = null; }
        canvas.style.cursor = "";
        return;
      }
      raycaster.setFromCamera(pointerNDC, camera);
      var zones = hotspots.items.map(function (it) { return it.zone; });
      var hits = pointerNDC.x <= 1 ? raycaster.intersectObjects(zones) : [];
      var hitId = hits.length ? hits[0].object.userData.hotspot.id : null;
      hoveredId = hitId;
      canvas.style.cursor = hitId ? "pointer" : "";

      hotspots.items.forEach(function (it) {
        var isHover = it.hs.id === hitId;
        it.hover += ((isHover ? 1 : 0) - it.hover) * 0.18;
        it.zone.material.opacity = it.hover * 0.10;
        it.zone.position.z = 0.02 + it.hover * 0.03;
        it.underline.material.opacity = it.hover * 0.8;
        it.underline.scale.x = 0.001 + it.hover * 0.999;
      });
    }

    function updateServicesStack(env) {
      var spread = env * quality.motionScale;
      servicesStack.sheets.forEach(function (mesh, i) {
        var restZ = i * 0.03;
        var spreadZ = i * 0.16;
        mesh.position.z = lerp(restZ, spreadZ, spread);
        mesh.position.y = lerp(0, i * 0.05, spread) - 0.05;
        mesh.rotation.z = lerp(0, (i - 1.5) * 0.03, spread);
        mesh.material.opacity = clamp(env * 1.3, 0, 0.95);
      });
    }

    function updateProcessGroup(env, subProgress) {
      // subProgress: 0..1 across the "how" stage only, used to move the
      // emphasis between the three original process visuals.
      var wApp = tent(subProgress, 0.0, 0.55);
      var wVer = tent(subProgress, 0.5, 0.55);
      var wProc = tent(subProgress, 1.0, 0.55);

      processBuilt.appMesh.material.opacity = clamp(env * wApp, 0, 0.95);
      processBuilt.verMesh.material.opacity = clamp(env * wVer, 0, 0.95);
      processBuilt.procSheets.forEach(function (m) {
        m.material.opacity = clamp(env * wProc, 0, 0.95);
      });
    }

    function frame() {
      rafId = requestAnimationFrame(frame);
      var t = clock.getElapsedTime();

      current.x += (target.x - current.x) * 0.06;
      current.y += (target.y - current.y) * 0.06;

      var rot = sampleStageField(stageProgress, "rot");
      var pos = sampleStageField(stageProgress, "pos");
      var cam = sampleStageField(stageProgress, "cam");
      var sealEnv = sampleStageField(stageProgress, "seal");
      var servicesEnv = sampleStageField(stageProgress, "services");
      var processEnv = sampleStageField(stageProgress, "process");

      var ms = quality.motionScale;

      paperGroup.rotation.y = rot.y + current.x * 0.16 * ms;
      paperGroup.rotation.x = rot.x + current.y * 0.10 * ms;
      paperGroup.position.x = pos.x + Math.cos(t * 0.4) * 0.012 * ms;
      paperGroup.position.y = pos.y + Math.sin(t * 0.55) * 0.035 * ms;
      paperGroup.position.z = pos.z;

      camera.position.x = cam.x;
      camera.position.y = cam.y;
      camera.position.z = camBaseZ;
      camera.lookAt(0, 0, 0);

      // A stamped impression doesn't spin: it keeps its hand-stamped tilt
      // and only gains/loses emphasis with the scroll stage.
      built.refs.seal.scale.setScalar(lerp(0.9, 1.08, clamp(sealEnv, 0, 1)));
      built.refs.seal.material.opacity = clamp(0.55 + sealEnv * 0.45, 0, 1);

      // key light drifts a little with the pointer so the paper grain and
      // the embossed seal catch the light as the sheet tilts
      key.position.x = -1.4 + current.x * 0.9 * ms;
      key.position.y = 1.6 - current.y * 0.5 * ms;

      updateServicesStack(clamp(servicesEnv, 0, 1));

      var howIdx = 3; // index of the "how" stage in STAGES
      var subProgress = clamp(stageProgress - howIdx, 0, 1);
      updateProcessGroup(clamp(processEnv, 0, 1), subProgress);

      updateHotspotHover();

      renderer.render(scene, camera);
    }

    function renderOnce() {
      updateHotspotHover();
      renderer.render(scene, camera);
    }

    if (reducedMotion) {
      renderOnce();
    } else {
      frame();
    }

    /* ---- public controller ------------------------------------------ */

    return {
      // continuous 0..(STAGES.length-1) scroll-storytelling position
      setStageProgress: function (p) {
        stageProgress = clamp(p, 0, STAGES.length - 1);
        if (reducedMotion) renderOnce();
      },
      // legacy Part 2 fine tilt, kept for compatibility (small, additive)
      setScrollProgress: function () {},
      setHotspotsEnabled: function (enabled) {
        hotspotsEnabled = !!enabled;
        if (reducedMotion) renderOnce();
      },
      destroy: function () {
        destroyed = true;
        if (rafId) cancelAnimationFrame(rafId);
        if (ro) ro.disconnect();
        window.removeEventListener("resize", resize);
        window.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("mouseleave", onPointerLeave);
        canvas.removeEventListener("click", onClick);
        canvas.removeEventListener("touchend", onClick);
        [art.main, art.bump, art.border, art.seal, art.backA, art.backB, art.shadow].forEach(function (t) { if (t) t.dispose(); });
        renderer.dispose();
      }
    };
  }

  /* ==================================================================
     PART 4 — About page: small decorative floating-document visual.
     Reuses drawGrain/clamp/lerp/qualityTier/QUALITY from above. Two
     paper layers only, slower and calmer than the Home hero, with the
     labels ABOUT / VALUES / TRUST printed onto the front sheet.
     ================================================================== */

  /* ------------------------------------------------------------------
     PART 7b — shared "compact bond-paper" helpers.

     The Home document (paintBondDocument, above) is laid out in a fixed
     1024x1280 logical space. These helpers let every OTHER page's
     documents — About, Services/FAQ/Testimonials sheets, Contact —
     borrow the exact same visual language (border, guilloche corners,
     security micro-print, brand mark, ref/date fields, numbered
     sections, footer) at whatever canvas size they need, by scaling
     every original coordinate by s = w / DOC_W. Same fictional marks,
     same ink colours, same paper — just a smaller sheet.
     ------------------------------------------------------------------ */

  function drawWatermarkScaled(ctx, cx, cy, scale) {
    ctx.save();
    rosette(ctx, cx, cy, 262 * scale, 26, 0.34, C_INK_FADE, 0.075, Math.max(0.5, 0.9 * scale));
    rosette(ctx, cx, cy, 214 * scale, 19, 0.5, C_INK_FADE, 0.06, Math.max(0.5, 0.8 * scale));
    ctx.strokeStyle = rgba(C_INK_FADE, 0.08);
    ctx.lineWidth = Math.max(0.5, 1 * scale);
    [270, 232, 150, 96].forEach(function (r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * scale, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.font = "italic 600 " + Math.max(18, Math.round(150 * scale)) + "px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_INK_FADE, 0.055);
    ctx.textAlign = "center";
    ctx.fillText("RH", cx, cy + 46 * scale);
    ctx.restore();
  }

  // Outer + inner rule, interlaced guilloche wave band, inner frame
  // rules and four corner rosettes — the same border language as the
  // Home document, scaled down to fit any w x h canvas.
  function paintOrnateBorder(ctx, w, h, s) {
    var c = 44 * s, from = 76 * s;

    ctx.strokeStyle = rgba(C_INK, 0.9);
    ctx.lineWidth = Math.max(1.2, 5 * s);
    ctx.strokeRect(24 * s, 24 * s, w - 48 * s, h - 48 * s);
    ctx.strokeStyle = rgba(C_INK, 0.6);
    ctx.lineWidth = Math.max(0.5, 1.2 * s);
    ctx.strokeRect(33 * s, 33 * s, w - 66 * s, h - 66 * s);

    [
      [0, 6.5 * s, 24 * s, Math.max(0.5, 1.1 * s), 0.62],
      [Math.PI, 6.5 * s, 24 * s, Math.max(0.5, 1.1 * s), 0.62],
      [0, 3.2 * s, 12 * s, Math.max(0.35, 0.7 * s), 0.36]
    ].forEach(function (wv) {
      ctx.strokeStyle = rgba(C_INK, wv[4]);
      ctx.lineWidth = wv[3];
      waveLine(ctx, true, c, from, w - from, wv[1], wv[2], wv[0]);
      waveLine(ctx, true, h - c, from, w - from, wv[1], wv[2], wv[0]);
      waveLine(ctx, false, c, from, h - from, wv[1], wv[2], wv[0]);
      waveLine(ctx, false, w - c, from, h - from, wv[1], wv[2], wv[0]);
    });

    ctx.strokeStyle = rgba(C_INK, 0.72);
    ctx.lineWidth = Math.max(0.5, 1.6 * s);
    ctx.strokeRect(57 * s, 57 * s, w - 114 * s, h - 114 * s);
    ctx.strokeStyle = rgba(C_INK, 0.36);
    ctx.lineWidth = Math.max(0.35, 0.7 * s);
    ctx.strokeRect(62 * s, 62 * s, w - 124 * s, h - 124 * s);

    [[c, c], [w - c, c], [c, h - c], [w - c, h - c]].forEach(function (pt) {
      var R = 25 * s;
      ctx.fillStyle = "rgba(246,241,229,1)";
      ctx.beginPath(); ctx.arc(pt[0], pt[1], R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = rgba(C_INK, 0.85);
      ctx.lineWidth = Math.max(0.5, 1.3 * s);
      ctx.beginPath(); ctx.arc(pt[0], pt[1], R * 0.96, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = Math.max(0.35, 0.8 * s);
      ctx.strokeStyle = rgba(C_INK, 0.5);
      ctx.beginPath(); ctx.arc(pt[0], pt[1], R * 0.76, 0, Math.PI * 2); ctx.stroke();
      rosette(ctx, pt[0], pt[1], R * 0.68, 9, 0.42, C_INK, 0.6, Math.max(0.35, 0.8 * s));
      ctx.fillStyle = rgba(C_INK, 0.85);
      ctx.beginPath(); ctx.arc(pt[0], pt[1], Math.max(0.9, 2.2 * s), 0, Math.PI * 2); ctx.fill();
    });

    return { c: c, from: from };
  }

  // Repeating fictional micro-print band, clipped to one thin strip —
  // reads as a security feature at a glance, illegible up close (as
  // real micro-print is), never claiming to be an official mark.
  function microPrintBand(ctx, x0, x1, y, bandH, text, s) {
    ctx.font = "600 " + Math.max(5, 6.5 * s) + "px " + FONT_BODY;
    ctx.fillStyle = rgba(C_INK_FADE, 0.75);
    ctx.textAlign = "left";
    var unit = text + " \u00B7 ", str = "", cx = x0;
    while (ctx.measureText(str).width < x1 - x0) { str += unit; }
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y, x1 - x0, bandH); ctx.clip();
    ctx.fillText(str, cx, y + bandH * 0.78);
    ctx.restore();
  }

  // The shared bond-note header, in the visual language of a printed
  // bond / banknote letterhead: a solid printed blue panel carrying a
  // central original medallion flanked by a pair of fictional "grade"
  // marks (the note-style denomination pairing, reimagined as a
  // document class rather than a currency value), a bold caption strip
  // below it, and a region/reference line in a second printed ink —
  // then the hairline + security micro-print band every page shares.
  // Every page (Home, About, Services, FAQ, Testimonials, Contact)
  // calls this same function, so the letterhead is identical everywhere.
  function paintCompactHeader(ctx, w, h, s, rng, X0, X1, officeLine, refLoops) {
    var cx = (X0 + X1) / 2;
    var y0 = 66 * s, bannerH = 58 * s, y1 = y0 + bannerH;
    var r = 6 * s;

    ctx.save();
    chamferPath(ctx, X0, y0, X1 - X0, bannerH, r);
    ctx.clip();

    var grad = ctx.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, "rgb(76,138,172)");
    grad.addColorStop(0.55, "rgb(38,98,136)");
    grad.addColorStop(1, "rgb(19,68,100)");
    ctx.fillStyle = grad;
    ctx.fillRect(X0, y0, X1 - X0, bannerH);

    // faint guilloche wash inside the panel, then the banner rules
    rosette(ctx, cx, y0 + bannerH / 2, bannerH * 0.92, 15, 0.5, C_CREAM, 0.07, Math.max(0.4, 0.8 * s));
    rosette(ctx, X0 + 78 * s, y0 + bannerH / 2, bannerH * 0.5, 10, 0.5, C_CREAM, 0.09, Math.max(0.3, 0.6 * s));
    rosette(ctx, X1 - 78 * s, y0 + bannerH / 2, bannerH * 0.5, 10, 0.5, C_CREAM, 0.09, Math.max(0.3, 0.6 * s));
    ctx.restore();

    ctx.strokeStyle = rgba(C_CREAM, 0.85);
    ctx.lineWidth = Math.max(0.6, 1.5 * s);
    chamferPath(ctx, X0, y0, X1 - X0, bannerH, r);
    ctx.stroke();
    ctx.strokeStyle = rgba(C_CREAM, 0.32);
    ctx.lineWidth = Math.max(0.35, 0.8 * s);
    chamferPath(ctx, X0 + 4 * s, y0 + 4 * s, X1 - X0 - 8 * s, bannerH - 8 * s, Math.max(1, r - 2 * s));
    ctx.stroke();

    // fictional "grade" marks, flanking the medallion the way a note's
    // denomination is printed either side of its central emblem
    ctx.textAlign = "center";
    [X0 + 80 * s, X1 - 80 * s].forEach(function (gx) {
      ctx.font = "600 " + Math.max(5.5, 7.5 * s) + "px " + FONT_BODY;
      ctx.fillStyle = rgba(C_CREAM, 0.8);
      spaced(ctx, "SERIES", gx, y0 + 21 * s, Math.max(0.5, 1.3 * s), "center");
      ctx.font = "italic 700 " + Math.max(13, 21 * s) + "px " + FONT_DISPLAY;
      ctx.fillStyle = "rgb(247,242,231)";
      ctx.fillText("Grade A", gx, y0 + 43 * s);
    });

    printedMedallion(ctx, cx, y0 + bannerH / 2, bannerH * 0.42, C_CREAM, 0.92);

    // bold caption strip beneath the panel — the printed "class" line
    var capY = y1 + 17 * s;
    ctx.font = "600 " + Math.max(8, 12.5 * s) + "px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.92);
    ctx.textAlign = "center";
    spaced(ctx, "RENOAHBUSINESSHUB \u00B7 ADVISORY COPY", cx, capY, Math.max(0.7, 2.2 * s), "center");

    // region / office line (left) + fictional serial (right), in a
    // second printed ink so the line reads distinctly, the way a real
    // bond's place-of-issue and serial are set apart from the rest
    var rowY = capY + 17 * s;
    ctx.font = "600 " + Math.max(6.5, 9 * s) + "px " + FONT_BODY;
    ctx.fillStyle = rgba(C_ACCENT, 0.85);
    ctx.textAlign = "left";
    spaced(ctx, (officeLine || "INSURANCE ADVISORY OFFICE").toUpperCase(), X0, rowY, Math.max(0.35, 1 * s), "left");

    var lblX = X1 - 168 * s;
    spaced(ctx, "SL. NO.", lblX, rowY, Math.max(0.35, 1 * s), "left");
    scribble(ctx, lblX + 50 * s, rowY - 9 * s, 118 * s, 13 * s, rng, refLoops || 7);

    hline(ctx, X0, X1, rowY + 12 * s, C_INK_DEEP, 0.65, Math.max(0.5, 1.4 * s));
    hline(ctx, X0, X1, rowY + 17 * s, C_INK_DEEP, 0.3, Math.max(0.35, 0.7 * s));

    microPrintBand(ctx, X0, X1, rowY + 20 * s, 11 * s, "RENOAHBUSINESSHUB \u00B7 DOCUMENTED CLEARLY", s);
  }

  // Centred display title + italic subtitle, flanked by two short
  // rules and a diamond, at logical y (pre-scale, same units as the
  // Home document so titles line up with the rest of the layout).
  function paintTitleBlock(ctx, w, s, title, subtitle, yLogical) {
    var y = yLogical * s;
    ctx.font = "600 " + Math.max(15, 40 * s) + "px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.95);
    ctx.textAlign = "center";
    spaced(ctx, title, w / 2, y, Math.max(1, 4.6 * s), "center");
    ctx.font = "italic 500 " + Math.max(8, 17 * s) + "px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_GREY, 0.95);
    ctx.fillText(subtitle, w / 2, y + 25 * s);

    var dy = y + 44 * s;
    hline(ctx, w * 0.29, w * 0.467, dy, C_INK, 0.5, Math.max(0.4, 1 * s));
    hline(ctx, w * 0.533, w * 0.707, dy, C_INK, 0.5, Math.max(0.4, 1 * s));
    hline(ctx, w * 0.29, w * 0.467, dy + 3 * s, C_INK, 0.22, Math.max(0.3, 0.7 * s));
    hline(ctx, w * 0.533, w * 0.707, dy + 3 * s, C_INK, 0.22, Math.max(0.3, 0.7 * s));
    ctx.fillStyle = rgba(C_INK, 0.8);
    diamond(ctx, w / 2, dy, Math.max(1.5, 5.5 * s));
    return dy;
  }

  // Fine-print footer rule, left/right micro captions.
  function paintFooter(ctx, w, h, s, X0, X1, rightLabel) {
    var yLine = h - 93 * s, yText = h - 77 * s;
    hline(ctx, X0, X1, yLine, C_INK_DEEP, 0.4, Math.max(0.4, 0.9 * s));
    ctx.font = "600 " + Math.max(5.5, 8.5 * s) + "px " + FONT_BODY;
    ctx.fillStyle = rgba(C_GREY, 0.95);
    spaced(ctx, "RENOAHBUSINESSHUB \u00B7 INSURANCE ADVISORY OFFICE", X0, yText, Math.max(0.3, 1.6 * s), "left");
    spaced(ctx, rightLabel || "SPECIMEN \u2014 FOR ILLUSTRATION ONLY", X1, yText, Math.max(0.3, 1.6 * s), "right");
  }

  // A ready-made ink-stamp impression (same artwork family as the Home
  // document's seal, imperfect ink included) rendered once on its own
  // small canvas, so any compact texture can stamp it at any size.
  function stampInk(ctx, cx, cy, r, rng, tilt) {
    var stampCanvas = makeCanvas(512, 512);
    paintBondSeal(stampCanvas.getContext("2d"), rng);
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.translate(cx, cy);
    ctx.rotate(tilt || 0);
    ctx.drawImage(stampCanvas, -r, -r, r * 2, r * 2);
    ctx.restore();
  }

  // A soft vignette along the sheet's edges, so the paper reads as a
  // slightly lifted, physically thick object rather than a flat card.
  function paintEdgeShadow(ctx, w, h) {
    var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.46, w / 2, h / 2, Math.hypot(w, h) * 0.54);
    g.addColorStop(0, "rgba(40,32,20,0)");
    g.addColorStop(1, "rgba(40,32,20,0.14)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function createAboutPaperTexture() {
    var w = 560, h = 736, s = w / DOC_W;
    var c = makeCanvas(w, h);
    var ctx = c.getContext("2d");
    var rng = makeRng(0xA6017);
    var X0 = 100 * s, X1 = w - 100 * s;

    paintPaperBase(ctx, rng, PAPER_TONE, 1, w, h);
    drawWatermarkScaled(ctx, w / 2, h * 0.44, 0.62 * s);
    paintOrnateBorder(ctx, w, h, s);

    paintCompactHeader(ctx, w, h, s, rng, X0, X1, "Insurance Advisory Office", 8);

    paintTitleBlock(ctx, w, s, "ABOUT RENOAHBUSINESSHUB", "Advisor profile and guiding principles", 224);

    var CLAUSES_ABOUT = [
      { title: "Who We Are",
        body: "Renoahbusinesshub is an insurance advisory office that helps clients understand the insurance options available to them, from first enquiry to final decision." },
      { title: "What We Value",
        body: "Every term is written in plain words, every charge is explained before you decide, and every client is treated with the same patience and courtesy." },
      { title: "Why We're Trusted",
        body: "Clients return to us because we explain before we process, keeping the paperwork clear and the timeline honest at every stage of the enquiry." }
    ];

    var y = 322 * s;
    ctx.font = "600 " + Math.max(8, 12 * s) + "px " + FONT_BODY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.92);
    var wtag = spaced(ctx, "OUR PRINCIPLES", X0, y, Math.max(0.8, 3 * s), "left");
    hline(ctx, X0 + wtag + 16 * s, X1, y - 4 * s, C_INK, 0.32, Math.max(0.4, 0.8 * s));
    y += 34 * s;

    CLAUSES_ABOUT.forEach(function (cl, i) {
      ctx.font = "600 " + Math.max(9, 13 * s) + "px " + FONT_BODY;
      ctx.fillStyle = rgba(C_INK, 0.95);
      ctx.textAlign = "left";
      ctx.fillText((i + 1) + ".", X0 + 3 * s, y);

      ctx.font = "600 " + Math.max(7, 10.5 * s) + "px " + FONT_BODY;
      ctx.fillStyle = rgba(C_INK_DEEP, 0.88);
      spaced(ctx, cl.title.toUpperCase(), X0 + 26 * s, y, Math.max(0.6, 2 * s), "left");

      ctx.font = "400 " + Math.max(8, 12.5 * s) + "px " + FONT_BODY;
      ctx.fillStyle = rgba(C_TYPE, 0.86);
      var lastY = justifyBlock(ctx, cl.body, X0 + 26 * s, y + 19 * s, X1 - X0 - 26 * s, 17 * s);
      if (i < CLAUSES_ABOUT.length - 1) {
        hline(ctx, X0 + 26 * s, X1, lastY + 11 * s, C_GREY, 0.14, Math.max(0.35, 0.7 * s));
      }
      y = lastY + 30 * s;
    });

    // signature / attestation block
    var sigY = 636 * s;
    hline(ctx, X0, X0 + 220 * s, sigY, C_INK_DEEP, 0.62, Math.max(0.5, 1.1 * s));
    ctx.font = "600 " + Math.max(6.5, 9.5 * s) + "px " + FONT_BODY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.9);
    spaced(ctx, "ADVISOR", X0, sigY + 15 * s, Math.max(0.5, 2 * s), "left");
    ctx.font = "italic 500 " + Math.max(7, 11 * s) + "px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_GREY, 0.95);
    ctx.textAlign = "left";
    ctx.fillText("For Renoahbusinesshub", X0, sigY + 27 * s);
    signature(ctx, X0 + 8 * s, sigY - 12 * s, 170 * s, 42 * s, rng, 7);

    stampInk(ctx, w - 96 * s, sigY - 20 * s, 46 * s, rng, -0.08);

    paintFooter(ctx, w, h, s, X0, X1, "PROFILE \u2014 FOR ILLUSTRATION ONLY");
    paintEdgeShadow(ctx, w, h);

    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function initAbout(container, canvas, options) {
    if (typeof THREE === "undefined") {
      throw new Error("THREE is not available");
    }
    options = options || {};
    var reducedMotion = !!options.reducedMotion;

    var tierName = qualityTier(window.innerWidth || 1024);
    var quality = QUALITY[tierName];

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
    camera.position.set(0, 0, 4.0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    var key = new THREE.DirectionalLight(0xfff8ea, 0.45);
    key.position.set(-1.2, 1.4, 2.0);
    scene.add(key);

    var group = new THREE.Group();

    var backGeo = new THREE.PlaneGeometry(2.1, 2.75);
    var backMat = new THREE.MeshStandardMaterial({
      color: PAPER_SECONDARY, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.55
    });
    var backPaper = new THREE.Mesh(backGeo, backMat);
    backPaper.position.set(0.16, -0.14, -0.18);
    backPaper.rotation.z = 0.06;
    group.add(backPaper);

    var frontTex = createAboutPaperTexture();
    var frontGeo = new THREE.PlaneGeometry(1.9, 2.5);
    var frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.88, metalness: 0 });
    var frontPaper = new THREE.Mesh(frontGeo, frontMat);
    group.add(frontPaper);

    var baseRotX = -0.05, baseRotY = 0.08;
    group.rotation.x = baseRotX;
    group.rotation.y = baseRotY;
    scene.add(group);

    var isCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

    function pixelRatioCap() {
      var base = window.devicePixelRatio || 1;
      return Math.min(base, quality.pixelRatio, isCoarsePointer ? 1.6 : 2.2);
    }

    function resize() {
      var w = container.clientWidth || 1;
      var h = container.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatioCap());
      renderer.setSize(w, h, false);
      if (reducedMotion) renderOnce();
    }
    resize();

    var ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(container);
    } else {
      window.addEventListener("resize", resize);
    }

    var target = { x: 0, y: 0 };
    var current = { x: 0, y: 0 };
    var scrollTilt = 0;

    function setFromClientPoint(clientX, clientY) {
      var rect = container.getBoundingClientRect();
      var nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      var ny = ((clientY - rect.top) / rect.height) * 2 - 1;
      var margin = 1.6;
      if (nx < -margin || nx > margin || ny < -margin || ny > margin) return;
      target.x = clamp(nx, -1, 1);
      target.y = clamp(ny, -1, 1);
    }
    function onPointerMove(e) { setFromClientPoint(e.clientX, e.clientY); }
    function onTouchMove(e) {
      if (!e.touches || !e.touches.length) return;
      setFromClientPoint(e.touches[0].clientX, e.touches[0].clientY);
    }
    function onPointerLeave() { target.x = 0; target.y = 0; }

    if (!reducedMotion) {
      window.addEventListener("mousemove", onPointerMove, { passive: true });
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("mouseleave", onPointerLeave);
    }

    var clock = new THREE.Clock();
    var rafId = null;
    var ms = quality.motionScale * 0.7; // slower/calmer than the Home hero

    function frame() {
      rafId = requestAnimationFrame(frame);
      var t = clock.getElapsedTime();

      current.x += (target.x - current.x) * 0.035; // slower damping than Home
      current.y += (target.y - current.y) * 0.035;

      group.rotation.y = baseRotY + current.x * 0.11 * ms;
      group.rotation.x = baseRotX + current.y * 0.07 * ms;
      group.position.y = Math.sin(t * 0.35) * 0.02 * ms;
      group.position.z = scrollTilt * 0.12;

      renderer.render(scene, camera);
    }

    function renderOnce() { renderer.render(scene, camera); }

    if (reducedMotion) {
      renderOnce();
    } else {
      frame();
    }

    return {
      // p in roughly [-1, 1]: how centered the About hero is in view;
      // used only for a very small depth shift, per the brief.
      setScrollProgress: function (p) {
        scrollTilt = clamp(p, -1, 1);
        if (reducedMotion) renderOnce();
      },
      destroy: function () {
        if (rafId) cancelAnimationFrame(rafId);
        if (ro) ro.disconnect();
        window.removeEventListener("resize", resize);
        window.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("mouseleave", onPointerLeave);
        renderer.dispose();
      }
    };
  }

  /* ==================================================================
     PART 4 — Services page: interactive 3D service-document stack.
     Four labelled sheets; hover/tap brings one forward, click/tap
     selects it (calling options.onSelect), and interactions.js can
     also drive the same selection from scroll position via
     controller.setActiveIndex(). Reuses createMiniSheetTexture-style
     drawing via a small local label variant.
     ================================================================== */

  var SERVICE_ITEMS = [
    { number: "01", label: "LIFE INSURANCE" },
    { number: "02", label: "HEALTH INSURANCE" },
    { number: "03", label: "MOTOR INSURANCE" },
    { number: "04", label: "BUSINESS INSURANCE" }
  ];

  // Deterministic seed per card, so each labelled sheet (Services,
  // FAQ categories, Testimonial statements) keeps the same "printed"
  // detail across repaints instead of re-rolling its grain each time.
  function seedFromItem(item) {
    var str = (item && (item.number + "|" + item.label)) || "sheet";
    var i, h = 0x811C9DC5;
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function createServiceSheetTexture(item) {
    var w = 320, h = 406, s = w / DOC_W;
    var c = makeCanvas(w, h);
    var ctx = c.getContext("2d");
    var rng = makeRng(seedFromItem(item));
    var X0 = 96 * s, X1 = w - 96 * s;

    paintPaperBase(ctx, rng, PAPER_TONE, 0.85, w, h);
    drawWatermarkScaled(ctx, w / 2, h * 0.5, 0.36 * s);
    paintOrnateBorder(ctx, w, h, s);

    // compact header: a slim printed-blue banner (same letterhead
    // language as the full bond header, scaled down for the card),
    // a fictional schedule ref in the second printed ink, then the
    // hairline + micro-print band shared by every document
    var by0 = 78 * s, bh = 42 * s, by1 = by0 + bh, br = 4 * s;
    var bgrad = ctx.createLinearGradient(0, by0, 0, by1);
    bgrad.addColorStop(0, "rgb(76,138,172)");
    bgrad.addColorStop(1, "rgb(21,72,104)");
    ctx.save();
    chamferPath(ctx, X0, by0, X1 - X0, bh, br);
    ctx.fillStyle = bgrad;
    ctx.fill();
    rosette(ctx, (X0 + X1) / 2, by0 + bh / 2, bh * 0.85, 12, 0.5, C_CREAM, 0.08, Math.max(0.35, 0.6 * s));
    ctx.restore();
    ctx.strokeStyle = rgba(C_CREAM, 0.75);
    ctx.lineWidth = Math.max(0.5, 1.1 * s);
    chamferPath(ctx, X0, by0, X1 - X0, bh, br);
    ctx.stroke();

    var monoX = X0 + 22 * s, monoY = by0 + bh / 2, monoR = 14 * s;
    printedMedallion(ctx, monoX, monoY, monoR, C_CREAM, 0.92);

    ctx.font = "600 " + Math.max(7, 13 * s) + "px " + FONT_DISPLAY;
    ctx.fillStyle = "rgb(247,242,231)";
    ctx.textAlign = "left";
    spaced(ctx, "RENOAHBUSINESSHUB", monoX + monoR + 12 * s, monoY - 3 * s, Math.max(0.4, 1.5 * s), "left");
    ctx.font = "600 " + Math.max(6, 8.5 * s) + "px " + FONT_BODY;
    ctx.fillStyle = rgba(C_CREAM, 0.85);
    spaced(ctx, "SERIES \u00B7 GRADE A", monoX + monoR + 12 * s, monoY + 12 * s, Math.max(0.3, 1 * s), "left");

    var capY = by1 + 15 * s;
    ctx.font = "600 " + Math.max(6, 8.5 * s) + "px " + FONT_BODY;
    ctx.fillStyle = rgba(C_ACCENT, 0.85);
    ctx.textAlign = "left";
    spaced(ctx, "SCH. REF LF-" + (item.number || "00") + "/S", X0, capY, Math.max(0.3, 1 * s), "left");

    hline(ctx, X0, X1, capY + 8 * s, C_INK_DEEP, 0.6, Math.max(0.45, 1.1 * s));
    hline(ctx, X0, X1, capY + 12 * s, C_INK_DEEP, 0.28, Math.max(0.32, 0.6 * s));
    microPrintBand(ctx, X0, X1, capY + 15 * s, 10 * s, "RENOAHBUSINESSHUB \u00B7 SCHEDULE", s);

    // clause-style numeral + label
    ctx.font = "600 " + Math.max(20, 46 * s) + "px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_INK, 0.85);
    ctx.textAlign = "left";
    ctx.fillText(item.number || "01", X0, 270 * s);

    ctx.font = "600 " + Math.max(11, 21 * s) + "px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.95);
    wrapText(ctx, item.label || "", X0 + 62 * s, 250 * s, X1 - (X0 + 62 * s), 25 * s);

    hline(ctx, X0, X1, 316 * s, C_GREY, 0.22, Math.max(0.35, 0.8 * s));

    // ruled writing lines, like an entry schedule below the heading
    var ly;
    for (ly = 356 * s; ly < 980 * s; ly += 34 * s) {
      hline(ctx, X0, X1, ly, C_GREY, 0.15, Math.max(0.3, 0.7 * s));
    }

    // hand-written paraph + small ink seal in the lower corner
    ctx.save();
    ctx.translate(X1 - 34 * s, 1040 * s); ctx.rotate(-0.22);
    scribble(ctx, -14 * s, 0, 30 * s, 15 * s, rng, 3);
    ctx.restore();
    stampInk(ctx, X1 - 50 * s, 1090 * s, 56 * s, rng, 0.06);

    paintFooter(ctx, w, h, s, X0, X1, "SCHEDULE \u2014 SPECIMEN");
    paintEdgeShadow(ctx, w, h);

    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    var words = text.split(" ");
    var line = "";
    var cy = y;
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i] + " ";
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cy);
        line = words[i] + " ";
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, cy);
  }

  /* ------------------------------------------------------------------
     Generic labelled paper stack. Used by the Services page (4 service
     sheets), and reused as-is for the FAQ category stack and the
     Testimonials sheet stack (Part 5) via options.items — same hover/
     click-to-forward behaviour, same paper material and texture
     drawing, just a different label set and item count.
     ------------------------------------------------------------------ */

  function initPaperStack(container, canvas, options) {
    if (typeof THREE === "undefined") {
      throw new Error("THREE is not available");
    }
    options = options || {};
    var reducedMotion = !!options.reducedMotion;
    var onSelect = typeof options.onSelect === "function" ? options.onSelect : function () {};
    var items = options.items && options.items.length ? options.items : SERVICE_ITEMS;
    var mid = (items.length - 1) / 2;

    var tierName = qualityTier(window.innerWidth || 1024);
    var quality = QUALITY[tierName];
    var ms = quality.motionScale;

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
    camera.position.set(0, 0, 4.4);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    var key = new THREE.DirectionalLight(0xfff8ea, 0.5);
    key.position.set(-1.2, 1.5, 2.2);
    scene.add(key);
    var rim = new THREE.DirectionalLight(FADED_BLUE, 0.3);
    rim.position.set(1.6, -0.5, -1.2);
    scene.add(rim);

    var group = new THREE.Group();
    var sheets = items.map(function (item, i) {
      var tex = createServiceSheetTexture(item);
      var geo = new THREE.PlaneGeometry(1.5, 1.9);
      var mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0 });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((i - mid) * 0.05, -(i - mid) * 0.03, -i * 0.05);
      mesh.rotation.z = (i - mid) * 0.012;
      mesh.userData.index = i;
      mesh.userData.baseZ = -i * 0.05;
      mesh.userData.baseX = (i - mid) * 0.05;
      mesh.userData.baseY = -(i - mid) * 0.03;
      mesh.userData.baseRotZ = (i - mid) * 0.012;
      group.add(mesh);
      return mesh;
    });
    scene.add(group);

    var isCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

    function pixelRatioCap() {
      var base = window.devicePixelRatio || 1;
      return Math.min(base, quality.pixelRatio, isCoarsePointer ? 1.6 : 2.2);
    }

    function resize() {
      var w = container.clientWidth || 1;
      var h = container.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatioCap());
      renderer.setSize(w, h, false);
      if (reducedMotion) renderOnce();
    }
    resize();

    var ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(container);
    } else {
      window.addEventListener("resize", resize);
    }

    var raycaster = new THREE.Raycaster();
    var pointerNDC = new THREE.Vector2(2, 2);
    var hoveredIndex = -1;
    var activeIndex = -1; // driven externally (scroll) or by click/tap
    var spreadTarget = 0;
    var spreadCurrent = 0;

    function setPointerFromClient(clientX, clientY) {
      var rect = container.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
        spreadTarget = 1;
      } else {
        pointerNDC.set(2, 2);
        spreadTarget = 0;
      }
    }

    function pickIndexAt(clientX, clientY) {
      var rect = container.getBoundingClientRect();
      var ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -(((clientY - rect.top) / rect.height) * 2 - 1)
      );
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObjects(sheets);
      return hits.length ? hits[0].object.userData.index : -1;
    }

    function onMouseMove(e) { setPointerFromClient(e.clientX, e.clientY); if (reducedMotion) renderOnce(); }
    function onMouseLeave() { pointerNDC.set(2, 2); spreadTarget = 0; if (reducedMotion) renderOnce(); }
    function onClick(e) {
      var idx = pickIndexAt(e.clientX, e.clientY);
      if (idx >= 0) { activeIndex = idx; onSelect(idx); if (reducedMotion) renderOnce(); }
    }
    function onTouchEnd(e) {
      var t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      var idx = pickIndexAt(t.clientX, t.clientY);
      if (idx >= 0) { activeIndex = idx; onSelect(idx); if (reducedMotion) renderOnce(); }
    }

    canvas.addEventListener("mousemove", onMouseMove, { passive: true });
    canvas.addEventListener("mouseleave", onMouseLeave, { passive: true });
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });

    var clock = new THREE.Clock();
    var rafId = null;

    function updateHover() {
      if (pointerNDC.x > 1) { hoveredIndex = -1; canvas.style.cursor = ""; return; }
      raycaster.setFromCamera(pointerNDC, camera);
      var hits = raycaster.intersectObjects(sheets);
      hoveredIndex = hits.length ? hits[0].object.userData.index : -1;
      canvas.style.cursor = hoveredIndex >= 0 ? "pointer" : "";
    }

    function frame() {
      rafId = requestAnimationFrame(frame);
      var t = clock.getElapsedTime();

      updateHover();
      spreadCurrent += (spreadTarget - spreadCurrent) * 0.08;

      sheets.forEach(function (mesh) {
        var i = mesh.userData.index;
        var isForward = i === hoveredIndex || i === activeIndex;
        var lift = isForward ? 1 : 0;
        var targetZ = mesh.userData.baseZ + spreadCurrent * i * 0.05 * ms + lift * 0.28 * ms;
        var targetRotZ = mesh.userData.baseRotZ + (isForward ? (i - mid) * -0.02 : 0);
        mesh.position.z += (targetZ - mesh.position.z) * 0.15;
        mesh.position.x += (mesh.userData.baseX - mesh.position.x) * 0.15;
        mesh.position.y += (mesh.userData.baseY + (isForward ? 0.04 * ms : 0) - mesh.position.y) * 0.15;
        mesh.rotation.z += (targetRotZ - mesh.rotation.z) * 0.15;
        mesh.rotation.y += ((isForward ? 0.06 * ms : 0) - mesh.rotation.y) * 0.15;
      });

      group.rotation.y = Math.sin(t * 0.25) * 0.02 * ms;

      renderer.render(scene, camera);
    }

    function renderOnce() { renderer.render(scene, camera); }

    if (reducedMotion) {
      renderOnce();
    } else {
      frame();
    }

    return {
      // Lets interactions.js bring a sheet forward as its matching
      // service section scrolls into view, without needing hover.
      setActiveIndex: function (i) {
        activeIndex = (typeof i === "number") ? i : -1;
        if (reducedMotion) renderOnce();
      },
      destroy: function () {
        if (rafId) cancelAnimationFrame(rafId);
        if (ro) ro.disconnect();
        window.removeEventListener("resize", resize);
        canvas.removeEventListener("mousemove", onMouseMove);
        canvas.removeEventListener("mouseleave", onMouseLeave);
        canvas.removeEventListener("click", onClick);
        canvas.removeEventListener("touchend", onTouchEnd);
        renderer.dispose();
      }
    };
  }

  // Back-compat wrapper: Services page keeps calling initServiceStack,
  // which is now just initPaperStack with its original 4-item label set.
  function initServiceStack(container, canvas, options) {
    options = options || {};
    if (!options.items) options.items = SERVICE_ITEMS;
    return initPaperStack(container, canvas, options);
  }

  /* ==================================================================
     PART 5 — Contact page: single floating enquiry document, built on
     the same damped pointer-tilt behaviour as initAbout, plus a
     setFocus() control so interactions.js can nudge the document very
     slightly as the person moves between form fields. Kept as its own
     function so About's initAbout is never touched.
     ================================================================== */

  var CONTACT_FOCUS = {
    name:      { z: 0.10, rotY: 0.00, rotX: 0.00 },
    "insurance-type": { z: 0.03, rotY: 0.05, rotX: 0.00 },
    message:   { z: 0.02, rotY: 0.00, rotX: 0.035 },
    none:      { z: 0.00, rotY: 0.00, rotX: 0.00 }
  };

  function createContactDocTexture() {
    var w = 560, h = 736, s = w / DOC_W;
    var c = makeCanvas(w, h);
    var ctx = c.getContext("2d");
    var rng = makeRng(0xC0117A);
    var X0 = 100 * s, X1 = w - 100 * s;

    paintPaperBase(ctx, rng, PAPER_TONE, 1, w, h);
    drawWatermarkScaled(ctx, w / 2, h * 0.46, 0.6 * s);
    paintOrnateBorder(ctx, w, h, s);

    paintCompactHeader(ctx, w, h, s, rng, X0, X1, "Enquiry Desk", 6);

    paintTitleBlock(ctx, w, s, "INSURANCE ENQUIRY SHEET", "For completion by the client", 224);

    var FIELDS = ["Full name", "Phone / email", "Insurance type required", "Preferred call time", "City / notes"];
    var y = 326 * s;
    ctx.font = "600 " + Math.max(8, 12 * s) + "px " + FONT_BODY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.92);
    var wtag = spaced(ctx, "APPLICANT DETAILS", X0, y, Math.max(0.8, 3 * s), "left");
    hline(ctx, X0 + wtag + 16 * s, X1, y - 4 * s, C_INK, 0.32, Math.max(0.4, 0.8 * s));
    y += 40 * s;

    FIELDS.forEach(function (label, i) {
      var lx = fieldLine(ctx, X0, X1, y, label.toUpperCase());
      if (i < FIELDS.length - 1) {
        scribble(ctx, lx + 6 * s, y - 3 * s, X1 - lx - 14 * s, 13 * s, rng, 4);
      }
      y += 46 * s;
    });

    // a generous ruled block for the free-text message field, filling
    // the space down to the signature block
    ctx.font = "600 " + Math.max(7, 10.5 * s) + "px " + FONT_BODY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.7);
    spaced(ctx, "MESSAGE", X0, y + 6 * s, Math.max(0.5, 1.8 * s), "left");
    var ly;
    for (ly = y + 30 * s; ly < 900 * s; ly += 32 * s) {
      hline(ctx, X0, X1, ly, C_GREY, 0.16, Math.max(0.35, 0.7 * s));
    }

    // signature block
    var sigY = 980 * s;
    hline(ctx, X0, X0 + 230 * s, sigY, C_INK_DEEP, 0.62, Math.max(0.5, 1.1 * s));
    ctx.font = "600 " + Math.max(6.5, 9.5 * s) + "px " + FONT_BODY;
    ctx.fillStyle = rgba(C_INK_DEEP, 0.9);
    spaced(ctx, "APPLICANT'S SIGNATURE", X0, sigY + 15 * s, Math.max(0.5, 2 * s), "left");
    ctx.font = "italic 500 " + Math.max(7, 11 * s) + "px " + FONT_DISPLAY;
    ctx.fillStyle = rgba(C_GREY, 0.95);
    ctx.textAlign = "left";
    ctx.fillText("Signature and date", X0, sigY + 27 * s);
    signature(ctx, X0 + 8 * s, sigY - 12 * s, 176 * s, 42 * s, rng, 7);

    stampInk(ctx, w - 96 * s, sigY - 18 * s, 48 * s, rng, -0.05);

    paintFooter(ctx, w, h, s, X0, X1, "ENQUIRY \u2014 FOR ILLUSTRATION ONLY");
    paintEdgeShadow(ctx, w, h);

    var tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  function initContactDoc(container, canvas, options) {
    if (typeof THREE === "undefined") {
      throw new Error("THREE is not available");
    }
    options = options || {};
    var reducedMotion = !!options.reducedMotion;

    var tierName = qualityTier(window.innerWidth || 1024);
    var quality = QUALITY[tierName];

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 10);
    camera.position.set(0, 0, 4.0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    var key = new THREE.DirectionalLight(0xfff8ea, 0.45);
    key.position.set(-1.2, 1.4, 2.0);
    scene.add(key);

    var group = new THREE.Group();

    var backGeo = new THREE.PlaneGeometry(2.1, 2.75);
    var backMat = new THREE.MeshStandardMaterial({
      color: PAPER_SECONDARY, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.55
    });
    var backPaper = new THREE.Mesh(backGeo, backMat);
    backPaper.position.set(0.16, -0.14, -0.18);
    backPaper.rotation.z = 0.06;
    group.add(backPaper);

    var frontTex = createContactDocTexture();
    var frontGeo = new THREE.PlaneGeometry(1.9, 2.5);
    var frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.88, metalness: 0 });
    var frontPaper = new THREE.Mesh(frontGeo, frontMat);
    group.add(frontPaper);

    var baseRotX = -0.05, baseRotY = 0.08;
    group.rotation.x = baseRotX;
    group.rotation.y = baseRotY;
    scene.add(group);

    var isCoarsePointer = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

    function pixelRatioCap() {
      var base = window.devicePixelRatio || 1;
      return Math.min(base, quality.pixelRatio, isCoarsePointer ? 1.6 : 2.2);
    }

    function resize() {
      var w = container.clientWidth || 1;
      var h = container.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatioCap());
      renderer.setSize(w, h, false);
      if (reducedMotion) renderOnce();
    }
    resize();

    var ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(container);
    } else {
      window.addEventListener("resize", resize);
    }

    var target = { x: 0, y: 0 };
    var current = { x: 0, y: 0 };
    var focusTarget = CONTACT_FOCUS.none;
    var focusCurrent = { z: 0, rotY: 0, rotX: 0 };

    function setFromClientPoint(clientX, clientY) {
      var rect = container.getBoundingClientRect();
      var nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      var ny = ((clientY - rect.top) / rect.height) * 2 - 1;
      var margin = 1.6;
      if (nx < -margin || nx > margin || ny < -margin || ny > margin) return;
      target.x = clamp(nx, -1, 1);
      target.y = clamp(ny, -1, 1);
    }
    function onPointerMove(e) { setFromClientPoint(e.clientX, e.clientY); }
    function onTouchMove(e) {
      if (!e.touches || !e.touches.length) return;
      setFromClientPoint(e.touches[0].clientX, e.touches[0].clientY);
    }
    function onPointerLeave() { target.x = 0; target.y = 0; }

    if (!reducedMotion) {
      window.addEventListener("mousemove", onPointerMove, { passive: true });
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("mouseleave", onPointerLeave);
    }

    var clock = new THREE.Clock();
    var rafId = null;
    var ms = quality.motionScale * 0.7;

    function frame() {
      rafId = requestAnimationFrame(frame);
      var t = clock.getElapsedTime();

      current.x += (target.x - current.x) * 0.035;
      current.y += (target.y - current.y) * 0.035;
      focusCurrent.z += (focusTarget.z - focusCurrent.z) * 0.08;
      focusCurrent.rotY += (focusTarget.rotY - focusCurrent.rotY) * 0.08;
      focusCurrent.rotX += (focusTarget.rotX - focusCurrent.rotX) * 0.08;

      group.rotation.y = baseRotY + current.x * 0.11 * ms + focusCurrent.rotY;
      group.rotation.x = baseRotX + current.y * 0.07 * ms + focusCurrent.rotX;
      group.position.y = Math.sin(t * 0.35) * 0.02 * ms;
      group.position.z = focusCurrent.z;

      renderer.render(scene, camera);
    }

    function renderOnce() { renderer.render(scene, camera); }

    if (reducedMotion) {
      renderOnce();
    } else {
      frame();
    }

    return {
      // Called by interactions.js on field focus/blur — key must match
      // CONTACT_FOCUS above ("name", "insurance-type", "message", "none").
      setFocus: function (key) {
        focusTarget = CONTACT_FOCUS[key] || CONTACT_FOCUS.none;
        if (reducedMotion) renderOnce();
      },
      destroy: function () {
        if (rafId) cancelAnimationFrame(rafId);
        if (ro) ro.disconnect();
        window.removeEventListener("resize", resize);
        window.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("mouseleave", onPointerLeave);
        renderer.dispose();
      }
    };
  }

  window.BondSite.ThreeScene = {
    init: init,
    initAbout: initAbout,
    initServiceStack: initServiceStack,
    initPaperStack: initPaperStack,
    initContactDoc: initContactDoc
  };
})();
