"use strict";
// ============================================================
// VIGHNAHARTA — art.js
// 100% procedural art: characters, tiles, parallax, props, FX.
// All drawing happens in virtual 1280x720 space; the game world
// uses 32px tiles.
// ============================================================

const TILE = 32;
const Art = {};

// ---------- helpers ----------
Art.hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; h = h ^ (h >> 16); return (h >>> 0) / 4294967295; };
Art.px = (n) => Math.round(n);          // pixel snap
Art.shade = (hex, f) => {               // shade/tint a '#rrggbb' color by factor f
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * f, 0, 255), g = clamp(((n >> 8) & 255) * f, 0, 255), b = clamp((n & 255) * f, 0, 255);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
};

// ---------- PALETTE (warm earth tones + temple motifs) ----------
const PAL = {
  dirt: '#8a5a33', dirtDk: '#6b4526', dirtLt: '#a3703f',
  stone: '#8f7f6a', stoneDk: '#6e6152', stoneLt: '#b3a48d',
  brick: '#a5502e', brickDk: '#7c3a20',
  wood: '#9c6b3f', woodDk: '#6e4a2a',
  sand: '#d9b077', sandLt: '#ecd3a3',
  sky: '#2c1a10', // replaced per level
  gold: '#f2c14e', saffron: '#ff9933', marigold: '#f5a623',
  tulsi: '#7fb069', leaf: '#4f7942', leafDk: '#3a5a32',
  skin: '#e8b98a', white: '#fdf6e3', cream: '#f3e5c0',
  ink: '#2a1a12', mist: '#b8b0a0',
};

// ============================================================
// CHARACTERS
// ============================================================

// Ganesha (player). cx = center x, footY = bottom of feet. h ~ 74px tall.
// pose: {body:lean -1..1, armSwing, legSwing, trunkWave, squash, airborne, crouch, axe:0|1|2, aim}
Art.drawGanesha = function (c, cx, footY, pose, t, aura) {
  const s = pose.scale || 1;
  const dir = pose.dir || 1;
  c.save();
  c.translate(Art.px(cx), Art.px(footY));
  c.scale(dir * s, s);
  const squash = pose.squash || 0;          // +1 stretched, -1 squashed
  const bob = Math.sin(t * 2.2) * (pose.idle ? 1.5 : 0);
  const H = 74, W = 46;
  const bodyY = -H + squash * -6 + bob;
  c.rotate((pose.lean || 0) * 0.08);

  // --- legs (dhoti) ---
  const legA = pose.legSwing || 0;
  c.strokeStyle = PAL.saffron; c.lineWidth = 9; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-4, -26); c.lineTo(-4 + legA * 10, -4 + Math.abs(legA) * 2); c.stroke();
  c.beginPath(); c.moveTo(4, -26); c.lineTo(4 - legA * 10, -4 + Math.abs(legA) * 2); c.stroke();
  // anklets
  c.fillStyle = PAL.gold;
  c.fillRect(-8 + legA * 10, -5, 7, 3); c.fillRect(1 - legA * 10, -7, 7, 3);

  // --- body: dhoti robe ---
  const grad = c.createLinearGradient(0, bodyY, 0, -20);
  grad.addColorStop(0, '#e8891d'); grad.addColorStop(1, '#f7b32b');
  c.fillStyle = grad;
  c.beginPath();
  c.ellipse(0, bodyY + 22, 21, 20, 0, 0, Math.PI * 2);
  c.fill();
  // dhoti fold
  c.fillStyle = '#c96a10';
  c.beginPath(); c.moveTo(-12, bodyY + 30); c.quadraticCurveTo(0, bodyY + 40, 12, bodyY + 30); c.lineTo(10, bodyY + 16); c.lineTo(-10, bodyY + 16); c.closePath(); c.fill();
  // sacred thread (yajnopavita)
  c.strokeStyle = PAL.white; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-12, bodyY + 8); c.quadraticCurveTo(0, bodyY + 26, 14, bodyY + 12); c.stroke();

  // --- arms ---
  c.strokeStyle = PAL.skin; c.lineWidth = 7; c.lineCap = 'round';
  const armSw = pose.armSwing || 0;
  // back arm
  c.beginPath(); c.moveTo(-12, bodyY + 6); c.lineTo(-12 - armSw * 8, bodyY + 20 + Math.abs(armSw) * 3); c.stroke();
  // front arm (holds axe if present)
  const ax = pose.axeAng;
  if (ax !== undefined) {
    c.beginPath(); c.moveTo(10, bodyY + 6);
    const hx = 10 + Math.cos(ax) * 20, hy = bodyY + 6 + Math.sin(ax) * 20;
    c.lineTo(hx, hy); c.stroke();
    // axe
    c.save(); c.translate(hx, hy); c.rotate(ax + (dir < 0 ? Math.PI - ax - ax : 0));
    c.strokeStyle = PAL.woodDk; c.lineWidth = 4;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(16, 0); c.stroke();
    c.fillStyle = '#cfd6dd'; c.strokeStyle = '#8f98a0'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(14, -2); c.quadraticCurveTo(30, -12, 34, 0); c.quadraticCurveTo(30, 12, 14, 2); c.closePath(); c.fill(); c.stroke();
    c.restore();
  } else {
    c.beginPath(); c.moveTo(10, bodyY + 6); c.lineTo(10 + armSw * 8, bodyY + 20 + Math.abs(armSw) * 3); c.stroke();
  }

  // --- head ---
  c.fillStyle = PAL.skin;
  c.beginPath(); c.ellipse(2, bodyY - 12, 15, 14, 0, 0, Math.PI * 2); c.fill();
  // ears (big)
  c.beginPath(); c.ellipse(-11, bodyY - 12, 4.5, 8, -0.3, 0, Math.PI * 2); c.fill();
  // trunk — the signature. Waves with time & pose.
  const tw = pose.trunkWave || 0;
  c.strokeStyle = PAL.skin; c.lineWidth = 8; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(10, bodyY - 10);
  c.quadraticCurveTo(24, bodyY - 6 + tw * 4, 26, bodyY + 4 + tw * 10);
  c.quadraticCurveTo(27, bodyY + 10 + tw * 12, 22, bodyY + 12 + tw * 12);
  c.stroke();
  // tusk (right side, small broken tusk on left)
  c.fillStyle = PAL.white;
  c.beginPath(); c.moveTo(14, bodyY - 4); c.quadraticCurveTo(20, bodyY - 2, 21, bodyY + 2); c.quadraticCurveTo(16, bodyY + 2, 14, bodyY - 1); c.closePath(); c.fill();
  // broken tusk (left)
  c.beginPath(); c.moveTo(-6, bodyY - 2); c.lineTo(-10, bodyY + 3); c.lineTo(-5, bodyY + 2); c.closePath(); c.fill();
  // eyes
  c.fillStyle = PAL.ink;
  c.beginPath(); c.arc(8, bodyY - 15, 1.8, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(-2, bodyY - 15, 1.8, 0, Math.PI * 2); c.fill();
  // tilak
  c.fillStyle = '#c0392b'; c.fillRect(1, bodyY - 22, 3, 5);
  // crown (small mukut)
  c.fillStyle = PAL.gold;
  c.beginPath(); c.moveTo(-9, bodyY - 24); c.lineTo(-6, bodyY - 33); c.lineTo(-2, bodyY - 26);
  c.lineTo(2, bodyY - 34); c.lineTo(6, bodyY - 26); c.lineTo(9, bodyY - 33); c.lineTo(11, bodyY - 24); c.closePath(); c.fill();
  // halo
  c.save();
  c.globalAlpha = 0.35 + Math.sin(t * 3) * 0.08;
  const hg = c.createRadialGradient(0, bodyY - 14, 4, 0, bodyY - 14, 26);
  hg.addColorStop(0, 'rgba(255,220,120,0.9)'); hg.addColorStop(1, 'rgba(255,220,120,0)');
  c.fillStyle = hg;
  c.beginPath(); c.arc(0, bodyY - 14, 26, 0, Math.PI * 2); c.fill();
  c.restore();

  // --- blessing shield aura ---
  if (aura) {
    c.save();
    c.globalAlpha = 0.3 + Math.sin(t * 5) * 0.1;
    c.strokeStyle = PAL.gold; c.lineWidth = 2.5;
    c.beginPath(); c.ellipse(0, -H / 2, 30, H / 2 + 6, 0, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
  c.restore();
};

// Villager NPC. Simple robed figure; hue varies.
Art.drawVillager = function (c, cx, footY, t, opt = {}) {
  const dir = opt.dir || 1;
  c.save(); c.translate(Art.px(cx), Art.px(footY)); c.scale(dir, 1);
  const bob = Math.sin(t * 2 + (opt.seed || 0)) * 1.2;
  const robe = opt.robe || '#7a6aa8', robeDk = Art.shade(robe, 0.75);
  // legs
  c.strokeStyle = '#5a4632'; c.lineWidth = 6; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-3, -20); c.lineTo(-3, -2); c.stroke();
  c.beginPath(); c.moveTo(3, -20); c.lineTo(3, -2); c.stroke();
  // robe
  c.fillStyle = robe;
  c.beginPath(); c.moveTo(-9, -44 + bob); c.quadraticCurveTo(-13, -20, -11, -18);
  c.lineTo(11, -18); c.quadraticCurveTo(13, -20, 9, -44 + bob); c.closePath(); c.fill();
  c.fillStyle = robeDk; c.fillRect(-11, -22, 22, 4);
  // arms
  c.strokeStyle = PAL.skin; c.lineWidth = 5;
  if (opt.cheer) {
    c.beginPath(); c.moveTo(-8, -40 + bob); c.lineTo(-14, -54 + bob); c.stroke();
    c.beginPath(); c.moveTo(8, -40 + bob); c.lineTo(14, -54 + bob); c.stroke();
  } else {
    c.beginPath(); c.moveTo(-8, -40 + bob); c.lineTo(-9, -26); c.stroke();
    c.beginPath(); c.moveTo(8, -40 + bob); c.lineTo(9, -26); c.stroke();
  }
  // head + hair bun
  c.fillStyle = PAL.skin;
  c.beginPath(); c.arc(0, -50 + bob, 8, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#2a1a12';
  c.beginPath(); c.arc(0, -56 + bob, 5, Math.PI, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(0, -59 + bob, 3, 0, Math.PI * 2); c.fill();
  // eyes (worried or hopeful)
  c.fillStyle = PAL.ink;
  if (opt.hope) {
    c.beginPath(); c.arc(2, -51 + bob, 1.4, 0, Math.PI * 2); c.fill();
  } else {
    c.fillRect(0, -52 + bob, 4, 1.6); c.fillRect(6, -52 + bob, 4, 1.6);
  }
  c.restore();
};

// Arrogant guard — big silhouette, shield + spear, dark uniform.
Art.drawGuard = function (c, cx, footY, t, opt = {}) {
  const dir = opt.dir || 1;
  const boss = opt.boss;
  const S = boss ? 1.7 : 1.15;
  c.save(); c.translate(Art.px(cx), Art.px(footY)); c.scale(dir * S, S);
  const bob = Math.sin(t * 3 + (opt.seed || 0)) * 1.5;
  // legs
  c.strokeStyle = '#3a2a20'; c.lineWidth = 8; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-4, -26); c.lineTo(-6, -2); c.stroke();
  c.beginPath(); c.moveTo(4, -26); c.lineTo(6, -2); c.stroke();
  // torso armor
  c.fillStyle = boss ? '#7c6a3a' : '#4a5560';
  c.beginPath(); c.moveTo(-12, -52 + bob); c.lineTo(12, -52 + bob);
  c.quadraticCurveTo(15, -34, 12, -22); c.lineTo(-12, -22); c.quadraticCurveTo(-15, -34, -12, -52 + bob); c.closePath(); c.fill();
  // gold trim for boss
  if (boss) {
    c.strokeStyle = PAL.gold; c.lineWidth = 2;
    c.strokeRect(-11, -50 + bob, 22, 26);
    // orbiting armor plates drawn by boss code
  }
  // shoulder pads
  c.fillStyle = boss ? PAL.gold : '#39424c';
  c.beginPath(); c.ellipse(-12, -50 + bob, 6, 5, 0, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(12, -50 + bob, 6, 5, 0, 0, Math.PI * 2); c.fill();
  // arms + spear/shield
  c.strokeStyle = PAL.skin; c.lineWidth = 5.5;
  c.beginPath(); c.moveTo(-11, -46 + bob); c.lineTo(-15, -30); c.stroke();
  // shield (front arm)
  c.fillStyle = boss ? '#c9a23f' : '#6a7480';
  c.beginPath(); c.ellipse(16, -36, 7, 13, 0, 0, Math.PI * 2); c.fill();
  if (boss) { c.strokeStyle = '#8a6d1f'; c.lineWidth = 2; c.stroke(); }
  // spear behind
  c.strokeStyle = PAL.woodDk; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-16, 0); c.lineTo(-20, -66 + bob); c.stroke();
  c.fillStyle = '#b8bec4';
  c.beginPath(); c.moveTo(-20, -66 + bob); c.lineTo(-24, -58 + bob); c.lineTo(-16, -58 + bob); c.closePath(); c.fill();
  // head: helmet with plume
  c.fillStyle = boss ? '#8a7440' : '#525c66';
  c.beginPath(); c.arc(0, -60 + bob, 9, 0, Math.PI * 2); c.fill();
  c.fillRect(-9, -60 + bob, 18, 4);
  // face slit
  c.fillStyle = '#1a1410';
  c.fillRect(2, -62 + bob, 6, 3);
  // plume
  c.strokeStyle = boss ? '#d94f2b' : '#7a3a2a'; c.lineWidth = 4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, -69 + bob); c.quadraticCurveTo(4, -76 + bob, 9, -74 + bob); c.stroke();
  c.restore();
};

// ---- Boss painters (each draws unique silhouette) ----
// Ego: armored captain — reuse guard at 1.7x with plates (drawn by boss code)

// Greed: hunched merchant spirit with a money-bag belly and coin aura
Art.drawGreed = function (c, cx, footY, t, opt = {}) {
  c.save(); c.translate(Art.px(cx), Art.px(footY));
  const bob = Math.sin(t * 2.5) * 3;
  const flash = opt.flash;
  // shadow
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath(); c.ellipse(0, -2, 34, 7, 0, 0, Math.PI * 2); c.fill();
  // tail/coat
  c.fillStyle = flash ? '#fff' : '#5c4a78';
  c.beginPath(); c.moveTo(-18, -20); c.quadraticCurveTo(-26, -50, -14, -64 + bob);
  c.lineTo(14, -64 + bob); c.quadraticCurveTo(26, -50, 18, -20); c.closePath(); c.fill();
  // bag belly
  c.fillStyle = flash ? '#fff' : '#c9a23f';
  c.beginPath(); c.ellipse(0, -34 + bob, 22, 18, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#8a6d1f'; c.lineWidth = 2; c.stroke();
  // tie at neck
  c.strokeStyle = '#8a6d1f'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-8, -60 + bob); c.quadraticCurveTo(0, -50 + bob, 8, -60 + bob); c.stroke();
  // arms clutching bag
  c.strokeStyle = '#4a3a60'; c.lineWidth = 6; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-14, -56 + bob); c.quadraticCurveTo(-24, -44 + bob, -12, -36 + bob); c.stroke();
  c.beginPath(); c.moveTo(14, -56 + bob); c.quadraticCurveTo(24, -44 + bob, 12, -36 + bob); c.stroke();
  // head: turban + greedy squint
  c.fillStyle = flash ? '#fff' : '#e8b98a';
  c.beginPath(); c.arc(0, -76 + bob, 11, 0, Math.PI * 2); c.fill();
  c.fillStyle = flash ? '#fff' : '#b03030';
  c.beginPath(); c.ellipse(0, -82 + bob, 13, 6, 0, Math.PI, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(0, -88 + bob, 4, 4, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1a1410';
  c.fillRect(3, -77 + bob, 5, 2); c.fillRect(-8, -77 + bob, 5, 2);
  // grin with gold tooth
  c.strokeStyle = '#1a1410'; c.lineWidth = 1.5;
  c.beginPath(); c.arc(2, -71 + bob, 5, 0.2, Math.PI - 0.2); c.stroke();
  c.fillStyle = PAL.gold; c.fillRect(4, -72 + bob, 3, 2);
  // coin aura
  if (!flash) for (let i = 0; i < 5; i++) {
    const a = t * 1.5 + i * Math.PI * 2 / 5;
    c.fillStyle = PAL.gold;
    c.beginPath(); c.arc(Math.cos(a) * 34, -46 + Math.sin(a) * 14, 4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#8a6d1f'; c.lineWidth = 1; c.stroke();
  }
  c.restore();
};

// Anger: flood-guardian — hulking water elemental with magma-red core
Art.drawAnger = function (c, cx, footY, t, opt = {}) {
  c.save(); c.translate(Art.px(cx), Art.px(footY));
  const surge = Math.sin(t * 4) * 4;
  const flash = opt.flash;
  // splashy body
  const g = c.createLinearGradient(0, -90, 0, 0);
  g.addColorStop(0, flash ? '#fff' : '#3a6ea5'); g.addColorStop(1, flash ? '#fff' : '#1d3a5f');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(-30, 0);
  c.quadraticCurveTo(-38, -30 - surge, -22, -52 - surge);
  c.quadraticCurveTo(-10, -70 - surge * 1.5, 2, -66 - surge);
  c.quadraticCurveTo(20, -58 - surge, 26, -34 - surge);
  c.quadraticCurveTo(34, -16, 30, 0);
  c.closePath(); c.fill();
  // white foam caps
  c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(-24, -50 - surge); c.quadraticCurveTo(-8, -66 - surge * 1.5, 8, -58 - surge); c.stroke();
  c.beginPath(); c.moveTo(20, -30 - surge); c.quadraticCurveTo(28, -22, 24, -12); c.stroke();
  // magma-red core (weakness target)
  const pulse = 0.6 + Math.sin(t * 6) * 0.25;
  const cg = c.createRadialGradient(0, -40 - surge, 2, 0, -40 - surge, 16);
  cg.addColorStop(0, `rgba(255,120,60,${pulse})`); cg.addColorStop(1, 'rgba(255,120,60,0)');
  c.fillStyle = cg;
  c.beginPath(); c.arc(0, -40 - surge, 16, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ff6a33';
  c.beginPath(); c.arc(0, -40 - surge, 6, 0, Math.PI * 2); c.fill();
  // furious eyes
  c.fillStyle = '#ffd23f';
  c.beginPath(); c.moveTo(-12, -58 - surge); c.lineTo(-4, -54 - surge); c.lineTo(-12, -52 - surge); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(12, -58 - surge); c.lineTo(4, -54 - surge); c.lineTo(12, -52 - surge); c.closePath(); c.fill();
  // spray particles at base
  for (let i = 0; i < 6; i++) {
    const x = Math.sin(t * 8 + i * 2) * 26;
    c.fillStyle = 'rgba(120,180,230,0.5)';
    c.beginPath(); c.arc(x, -4 - Math.abs(Math.cos(t * 6 + i)) * 8, 2.5, 0, Math.PI * 2); c.fill();
  }
  c.restore();
};

// Attachment: clinging shadow blob with tendril arms
Art.drawAttachment = function (c, cx, footY, t, opt = {}) {
  c.save(); c.translate(Art.px(cx), Art.px(footY));
  const wobble = Math.sin(t * 3) * 3, wobble2 = Math.cos(t * 2.3) * 2;
  const flash = opt.flash;
  c.fillStyle = flash ? '#fff' : 'rgba(40,25,45,0.92)';
  c.beginPath();
  c.moveTo(-26, 0);
  c.quadraticCurveTo(-34, -26 + wobble, -16, -44 + wobble);
  c.quadraticCurveTo(0, -58 + wobble2, 16, -44 + wobble);
  c.quadraticCurveTo(34, -26 + wobble2, 26, 0);
  c.closePath(); c.fill();
  // tendrils reaching out
  c.strokeStyle = flash ? '#fff' : 'rgba(40,25,45,0.8)'; c.lineWidth = 5; c.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const ph = t * 2.2 + i * 2;
    c.beginPath();
    c.moveTo(-20 + i * 20, -30);
    c.quadraticCurveTo(-30 + i * 24 + Math.sin(ph) * 10, -18, -36 + i * 30 + Math.sin(ph) * 14, -4);
    c.stroke();
  }
  // hollow eyes — sorrowful
  c.fillStyle = '#c9a0dc';
  c.beginPath(); c.ellipse(-9, -40 + wobble, 4, 5.5, 0.2, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(9, -40 + wobble, 4, 5.5, -0.2, 0, Math.PI * 2); c.fill();
  // tear glints
  c.fillStyle = 'rgba(201,160,220,0.5)';
  c.beginPath(); c.arc(-9, -32 + wobble + (t * 8 % 10), 1.5, 0, Math.PI * 2); c.fill();
  // chains it clings with
  c.strokeStyle = 'rgba(180,170,190,0.6)'; c.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const x = -18 + i * 12;
    c.beginPath(); c.moveTo(x, -14);
    for (let j = 1; j <= 3; j++) c.lineTo(x + Math.sin(t * 3 + i + j) * 3, -14 + j * 5);
    c.stroke();
  }
  c.restore();
};

// Ignorance: formless fog-beast — layered translucent fog with hollow core
Art.drawIgnorance = function (c, cx, footY, t, opt = {}) {
  c.save(); c.translate(Art.px(cx), Art.px(footY));
  // three fog layers
  for (let L = 0; L < 3; L++) {
    const r = 46 - L * 12, sp = 1.6 - L * 0.4;
    c.fillStyle = `rgba(90,80,95,${0.30 - L * 0.07})`;
    c.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.35) {
      const wob = Math.sin(a * 3 + t * sp * 2) * 10 + Math.sin(a * 5 - t * sp) * 6;
      const x = Math.cos(a) * (r + wob), y = -40 + Math.sin(a) * (r * 0.8 + wob);
      a === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.closePath(); c.fill();
  }
  // hollow core (revealed by blessing breath = weak point)
  const revealed = opt.coreRevealed;
  if (revealed) {
    const pulse = 0.5 + Math.sin(t * 5) * 0.3;
    const cg = c.createRadialGradient(0, -40, 2, 0, -40, 18);
    cg.addColorStop(0, `rgba(255,235,160,${pulse})`); cg.addColorStop(1, 'rgba(255,235,160,0)');
    c.fillStyle = cg;
    c.beginPath(); c.arc(0, -40, 18, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff3c4';
    c.beginPath(); c.arc(0, -40, 6, 0, Math.PI * 2); c.fill();
  }
  // drowsy eyes (closed) unless revealed, then shocked open
  c.strokeStyle = revealed ? '#fff3c4' : 'rgba(30,25,35,0.8)'; c.lineWidth = 2.5;
  if (revealed) {
    c.fillStyle = '#1e1923';
    c.beginPath(); c.arc(-10, -44, 3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(10, -44, 3, 0, Math.PI * 2); c.fill();
  } else {
    c.beginPath(); c.arc(-10, -44, 4, 0.2, Math.PI - 0.2); c.stroke();
    c.beginPath(); c.arc(10, -44, 4, 0.2, Math.PI - 0.2); c.stroke();
  }
  c.restore();
};

// ============================================================
// TILES & TERRAIN
// ============================================================
// Terrain draw: cached offscreen canvas per (type,color) combo is overkill
// for 5 levels; direct draw with deterministic hash detail is fast enough.
Art.drawTerrain = function (c, x, y, w, h, kind, seedX) {
  const hx = seedX || 0;
  if (kind === 'ground' || kind === 'plat') {
    c.fillStyle = PAL.dirt; c.fillRect(x, y, w, h);
    // top grass/gravel lip
    c.fillStyle = PAL.dirtLt; c.fillRect(x, y, w, 5);
    // deterministic speckle
    c.fillStyle = PAL.dirtDk;
    for (let sx = 0; sx < w; sx += 14) {
      for (let sy = 8; sy < h; sy += 12) {
        const r = Art.hash(x + sx + hx, y + sy);
        if (r > 0.72) c.fillRect(x + sx + (r * 8 | 0), y + sy, 3, 2);
      }
    }
    // stones
    for (let sx = 6; sx < w; sx += 26) {
      const r = Art.hash(x + sx * 3 + hx, y + h);
      if (r > 0.6) {
        c.fillStyle = PAL.stoneDk;
        c.beginPath(); c.ellipse(x + sx, y + Math.min(h * 0.6, 18), 4, 3, 0, 0, Math.PI * 2); c.fill();
      }
    }
  } else if (kind === 'stone' || kind === 'platStone') {
    c.fillStyle = PAL.stone; c.fillRect(x, y, w, h);
    c.fillStyle = PAL.stoneDk; c.fillRect(x, y + h - 4, w, 4);
    c.strokeStyle = 'rgba(0,0,0,0.15)'; c.lineWidth = 1;
    for (let sy = 0; sy < h; sy += 16) {
      c.beginPath(); c.moveTo(x, y + sy); c.lineTo(x + w, y + sy); c.stroke();
      const off = (sy / 16) % 2 === 0 ? 0 : 16;
      for (let sx = off; sx < w; sx += 32) {
        c.beginPath(); c.moveTo(x + sx, y + sy); c.lineTo(x + sx, y + Math.min(sy + 16, h)); c.stroke();
      }
    }
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x, y, w, 2);
  } else if (kind === 'wood') {
    c.fillStyle = PAL.wood; c.fillRect(x, y, w, h);
    c.strokeStyle = PAL.woodDk; c.lineWidth = 2;
    for (let sx = 0; sx < w; sx += 22) { c.beginPath(); c.moveTo(x + sx, y); c.lineTo(x + sx, y + h); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x, y + h - 3, w, 3);
  } else if (kind === 'beam') { // narrow wooden beam
    c.fillStyle = PAL.wood; c.fillRect(x, y, w, 6);
    c.fillStyle = PAL.woodDk; c.fillRect(x, y + 4, w, 2);
    for (let sx = 4; sx < w; sx += 24) { c.fillRect(x + sx, y + 1, 2, 3); }
  } else if (kind === 'mud') {
    c.fillStyle = '#5f4526'; c.fillRect(x, y, w, h);
    c.fillStyle = '#4a3619';
    for (let sx = 0; sx < w; sx += 18) {
      const r = Art.hash(x + sx + hx, y);
      c.beginPath(); c.ellipse(x + sx + 8, y + 6 + r * 4, 7, 3, 0, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x, y, w, 3);
  }
};

// decorative temple arch / gopuram silhouette in background
Art.drawGopuram = function (c, x, baseY, w, h, alpha) {
  c.save(); c.globalAlpha = alpha || 1;
  c.fillStyle = '#3d2817';
  // stacked trapezoid tiers
  let ty = baseY, tw = w;
  const tiers = 5;
  for (let i = 0; i < tiers; i++) {
    const th = h / tiers;
    c.fillRect(x - tw / 2, ty - th, tw, th);
    ty -= th; tw *= 0.72;
  }
  // cap + kalasha
  c.beginPath(); c.arc(x, ty, tw * 0.5, Math.PI, Math.PI * 2); c.fill();
  c.fillRect(x - 2, ty - 14, 4, 10);
  c.fillStyle = PAL.gold; c.beginPath(); c.arc(x, ty - 16, 3, 0, Math.PI * 2); c.fill();
  c.restore();
};

// ============================================================
// PROPS
// ============================================================

Art.drawBell = function (c, x, y, t, rung) {
  c.save(); c.translate(x, y);
  c.strokeStyle = PAL.woodDk; c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, -14); c.lineTo(0, -6); c.stroke();
  const swing = rung > 0 ? Math.sin(t * 22) * 0.35 * Math.min(1, rung) : 0;
  c.rotate(swing);
  c.fillStyle = PAL.gold;
  c.beginPath(); c.moveTo(-8, 10); c.quadraticCurveTo(-9, -4, 0, -6); c.quadraticCurveTo(9, -4, 8, 10); c.closePath(); c.fill();
  c.fillStyle = '#8a6d1f'; c.fillRect(-8, 8, 16, 3);
  c.fillStyle = '#6e5a20'; c.beginPath(); c.arc(0, 14, 3, 0, Math.PI * 2); c.fill();
  c.restore();
};

Art.drawLamp = function (c, x, y, t, lit) {
  c.save(); c.translate(x, y);
  c.fillStyle = '#7a4a20';
  c.beginPath(); c.moveTo(-9, 0); c.quadraticCurveTo(0, 6, 9, 0); c.quadraticCurveTo(0, -3, -9, 0); c.closePath(); c.fill();
  if (lit) {
    const fl = 0.8 + Math.sin(t * 9) * 0.2;
    const g = c.createRadialGradient(0, -6, 1, 0, -6, 14 * fl);
    g.addColorStop(0, 'rgba(255,240,180,0.95)'); g.addColorStop(0.4, 'rgba(255,170,60,0.6)'); g.addColorStop(1, 'rgba(255,120,30,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, -6, 14 * fl, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffdf8a';
    c.beginPath(); c.moveTo(0, -12); c.quadraticCurveTo(3.5, -6, 0, -2); c.quadraticCurveTo(-3.5, -6, 0, -12); c.fill();
  } else {
    c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(0, -2, 2.5, 0, Math.PI * 2); c.fill();
  }
  c.restore();
};

Art.drawFlag = function (c, x, y, t, raised) {
  c.save(); c.translate(x, y);
  c.strokeStyle = '#6e4a2a'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -44); c.stroke();
  if (raised) {
    const flap = Math.sin(t * 5) * 3;
    c.fillStyle = PAL.saffron;
    c.beginPath(); c.moveTo(0, -42); c.quadraticCurveTo(16, -40 + flap, 30, -42 + flap);
    c.lineTo(30, -26 + flap); c.quadraticCurveTo(16, -24 + flap, 0, -26); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.beginPath(); c.arc(15, -34 + flap, 3, 0, Math.PI * 2); c.fill();
  } else {
    c.strokeStyle = '#8a7a60'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(2, -40); c.lineTo(14, -34); c.stroke();
  }
  c.restore();
};

Art.drawShrineProp = function (c, x, y, t, glow) {
  c.save(); c.translate(x, y);
  c.fillStyle = PAL.stone; c.fillRect(-16, -34, 32, 34);
  c.fillStyle = PAL.stoneDk; c.fillRect(-16, -6, 32, 6);
  c.fillStyle = PAL.stoneLt; c.fillRect(-20, -40, 40, 8);
  // niche with idol silhouette
  c.fillStyle = '#3a2a1a';
  c.beginPath(); c.moveTo(-7, -8); c.lineTo(-7, -26); c.arc(0, -26, 7, Math.PI, 0); c.lineTo(7, -8); c.closePath(); c.fill();
  c.fillStyle = glow ? PAL.gold : '#6e5a40';
  c.beginPath(); c.arc(0, -18, 4, 0, Math.PI * 2); c.fill();
  c.fillRect(-2, -14, 4, 6);
  if (glow) {
    const g = c.createRadialGradient(0, -18, 2, 0, -18, 30);
    g.addColorStop(0, 'rgba(255,220,130,0.5)'); g.addColorStop(1, 'rgba(255,220,130,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, -18, 30, 0, Math.PI * 2); c.fill();
  }
  c.restore();
};

// gate: barrier that opens when conditions met
Art.drawGate = function (c, x, y, w, h, openT) {
  // openT 0 closed → 1 fully open (slabs slide apart / fade)
  c.save();
  const slid = openT * (h * 0.8);
  c.fillStyle = '#6e4a2a';
  c.fillRect(x + 2, y - slid, w - 4, h - slid * 0.2);
  c.strokeStyle = '#4a3018'; c.lineWidth = 2;
  for (let i = 0; i < 4; i++) { c.strokeRect(x + 4, y - slid + 6 + i * (h - slid * 0.2) / 5, w - 8, (h - slid * 0.2) / 5 - 4); }
  // gold emblem
  c.fillStyle = PAL.gold;
  c.beginPath(); c.arc(x + w / 2, y - slid + h * 0.3, 6, 0, Math.PI * 2); c.fill();
  c.restore();
};

// pickup icons
Art.drawModak = function (c, x, y, t) {
  const bob = Math.sin(t * 3 + x * 0.05) * 3;
  c.save(); c.translate(x, y + bob);
  const g = c.createRadialGradient(0, 0, 1, 0, 0, 12);
  g.addColorStop(0, 'rgba(255,230,160,0.35)'); g.addColorStop(1, 'rgba(255,230,160,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 12, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f7e3b0';
  c.beginPath(); c.moveTo(0, -8); c.quadraticCurveTo(8, -2, 5, 6); c.lineTo(-5, 6); c.quadraticCurveTo(-8, -2, 0, -8); c.closePath(); c.fill();
  c.fillStyle = '#d9b070';
  c.beginPath(); c.moveTo(0, -8); c.lineTo(3, -2); c.lineTo(-3, -2); c.closePath(); c.fill();
  c.restore();
};

Art.drawFlower = function (c, x, y, t) {
  const bob = Math.sin(t * 3 + x * 0.05) * 3, rot = t * 0.8;
  c.save(); c.translate(x, y + bob); c.rotate(rot);
  c.fillStyle = '#ff8a5c';
  for (let i = 0; i < 5; i++) {
    c.rotate(Math.PI * 2 / 5);
    c.beginPath(); c.ellipse(5, 0, 5, 2.6, 0, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(0, 0, 2.6, 0, Math.PI * 2); c.fill();
  c.restore();
};

// tool pickup: floating axe / noose / trunk relic with glow
Art.drawToolPickup = function (c, x, y, t, kind) {
  const bob = Math.sin(t * 2.5) * 4;
  c.save(); c.translate(x, y + bob);
  const g = c.createRadialGradient(0, 0, 2, 0, 0, 26);
  g.addColorStop(0, 'rgba(255,225,140,0.55)'); g.addColorStop(1, 'rgba(255,225,140,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 26, 0, Math.PI * 2); c.fill();
  if (kind === 'axe') {
    c.rotate(-0.7 + Math.sin(t * 2) * 0.1);
    c.strokeStyle = PAL.woodDk; c.lineWidth = 4;
    c.beginPath(); c.moveTo(-10, 12); c.lineTo(8, -8); c.stroke();
    c.fillStyle = '#d7dde3';
    c.beginPath(); c.moveTo(6, -6); c.quadraticCurveTo(22, -16, 24, -2); c.quadraticCurveTo(18, 6, 8, 2); c.closePath(); c.fill();
  } else if (kind === 'noose') {
    c.strokeStyle = '#e8dcc0'; c.lineWidth = 3;
    c.beginPath(); c.arc(0, -2, 8, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(6, 4); c.quadraticCurveTo(12, 10, 10, 16); c.stroke();
  } else {
    c.strokeStyle = PAL.skin; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-6, 8); c.quadraticCurveTo(8, 6, 10, -8); c.stroke();
  }
  c.restore();
};

// fog cloud (ignorance) — drawn in world with alpha
Art.drawFog = function (c, x, y, t, seed) {
  c.save(); c.translate(x, y);
  for (let L = 0; L < 3; L++) {
    const r = 44 + L * 10, sp = (L % 2 ? -1 : 1) * (0.3 + L * 0.12);
    c.fillStyle = `rgba(148,138,150,${0.34 - L * 0.08})`;
    c.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.5) {
      const wob = Math.sin(a * 3 + t * sp * 3 + seed) * 9;
      const px = Math.cos(a) * (r + wob), py = Math.sin(a) * (r * 0.72 + wob);
      a === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
    }
    c.closePath(); c.fill();
  }
  c.restore();
};

// water surface (river level)
Art.drawWater = function (c, x, y, w, t) {
  c.fillStyle = 'rgba(58,110,165,0.82)';
  c.fillRect(x, y, w, 300);
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const yy = y + 6 + i * 14;
    c.beginPath();
    for (let sx = 0; sx <= w; sx += 24) {
      const wave = Math.sin((sx + x) * 0.03 + t * 2 + i * 1.7) * 3;
      sx === 0 ? c.moveTo(x + sx, yy + wave) : c.lineTo(x + sx, yy + wave);
    }
    c.stroke();
  }
};

// ============================================================
// PARALLAX BACKGROUNDS (per level, procedurally painted once)
// ============================================================
// Each level gets 3 layers pre-rendered to offscreen canvases at load.
Art.makeParallax = function (levelTheme) {
  const layers = [];
  for (let L = 0; L < 3; L++) {
    const cv = document.createElement('canvas');
    cv.width = 1600; cv.height = 480;
    const c = cv.getContext('2d');
    const t = levelTheme;
    // --- sky gradient for far layer ---
    if (L === 0) {
      const g = c.createLinearGradient(0, 0, 0, 480);
      g.addColorStop(0, t.skyTop); g.addColorStop(0.6, t.skyMid); g.addColorStop(1, t.skyLow);
      c.fillStyle = g; c.fillRect(0, 0, 1600, 480);
      // sun/moon disc
      c.fillStyle = t.sun;
      c.beginPath(); c.arc(1250, 120, 42, 0, Math.PI * 2); c.fill();
      const sg = c.createRadialGradient(1250, 120, 10, 1250, 120, 130);
      sg.addColorStop(0, t.sunGlow); sg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sg; c.beginPath(); c.arc(1250, 120, 130, 0, Math.PI * 2); c.fill();
      // birds
      c.strokeStyle = 'rgba(40,25,15,0.5)'; c.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const bx = 200 + i * 180 + Art.hash(i, 7) * 60, by = 90 + Art.hash(i, 3) * 90;
        c.beginPath(); c.moveTo(bx - 7, by); c.quadraticCurveTo(bx, by - 5, bx + 0, by);
        c.quadraticCurveTo(bx, by - 5, bx + 7, by); c.stroke();
      }
    }
    // --- distant silhouettes ---
    if (L <= 1) {
      const alpha = L === 0 ? 0.55 : 0.8;
      const col = L === 0 ? t.farSil : t.midSil;
      c.fillStyle = col; c.globalAlpha = alpha;
      // gopurams
      Art.drawGopuram(c, 300 + L * 120, 470, 150 - L * 30, 300 + L * 40, 1);
      Art.drawGopuram(c, 1100 - L * 90, 470, 110, 210 + L * 30, 1);
      // rooftops
      for (let i = 0; i < 12; i++) {
        const rx = (i * 137 + L * 53) % 1560, rw = 60 + Art.hash(i, L) * 60, rh = 40 + Art.hash(i, L + 9) * 70;
        c.fillRect(rx, 470 - rh, rw, rh);
        // sloped roof
        c.beginPath(); c.moveTo(rx - 6, 470 - rh); c.lineTo(rx + rw / 2, 470 - rh - 18 - Art.hash(i, L) * 10); c.lineTo(rx + rw + 6, 470 - rh); c.closePath(); c.fill();
      }
      c.globalAlpha = 1;
    }
    // --- near layer: foliage + market stall hints ---
    if (L === 2) {
      c.fillStyle = t.nearSil;
      for (let i = 0; i < 16; i++) {
        const px = (i * 103) % 1600, ph = 60 + Art.hash(i, 11) * 90;
        // palm-ish fronds
        c.fillRect(px, 480 - ph * 0.4, 5, ph * 0.4);
        for (let f = 0; f < 5; f++) {
          const fa = -Math.PI / 2 + (f - 2) * 0.45;
          c.beginPath(); c.moveTo(px + 2, 480 - ph * 0.4);
          c.quadraticCurveTo(px + 2 + Math.cos(fa) * 30, 480 - ph * 0.4 + Math.sin(fa) * 30 - 8, px + 2 + Math.cos(fa) * 52, 480 - ph * 0.4 + Math.sin(fa) * 52);
          c.lineWidth = 5; c.strokeStyle = t.nearSil; c.stroke();
        }
      }
      // hanging cloth lines
      c.strokeStyle = 'rgba(60,40,25,0.6)'; c.lineWidth = 2;
      c.fillStyle = t.accent;
      for (let i = 0; i < 7; i++) {
        const cx0 = (i * 240) % 1600;
        c.beginPath(); c.moveTo(cx0, 300); c.quadraticCurveTo(cx0 + 60, 330, cx0 + 120, 300); c.stroke();
        c.globalAlpha = 0.5;
        for (let k = 0; k < 4; k++) {
          const fx = cx0 + 14 + k * 26, fy = 308 + Math.sin(k) * 4;
          c.fillRect(fx, fy, 14, 18);
        }
        c.globalAlpha = 1;
      }
    }
    layers.push(cv);
  }
  return layers;
};

// ============================================================
// PARTICLES
// ============================================================
const Particles = {
  list: [],
  spawn(x, y, opt = {}) {
    this.list.push({
      x, y,
      vx: opt.vx || 0, vy: opt.vy || 0,
      g: opt.g !== undefined ? opt.g : 300,
      life: opt.life || 0.6, t: 0,
      size: opt.size || 4, shrink: opt.shrink !== undefined ? opt.shrink : true,
      color: opt.color || '#ffd23f', glow: opt.glow !== false,
      kind: opt.kind || 'circle',   // circle | petal | spark | ring | text
      text: opt.text, drag: opt.drag || 0.9,
    });
  },
  burst(x, y, n, opt = {}) {
    for (let i = 0; i < n; i++) {
      const a = opt.angle !== undefined ? opt.angle + rnd(-0.6, 0.6) : rnd(0, Math.PI * 2);
      const sp = rnd(opt.spMin || 40, opt.spMax || 180);
      this.spawn(x, y, Object.assign({}, opt, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 0),
      }));
    }
  },
  ring(x, y, color = '#ffd23f') {
    this.spawn(x, y, { kind: 'ring', life: 0.4, size: 8, color, g: 0, vx: 0, vy: 0 });
  },
  text(x, y, str, color = '#fff') {
    this.spawn(x, y, { kind: 'text', text: str, life: 0.9, vx: 0, vy: -50, g: 0, color, size: 15 });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.t >= p.life) { this.list.splice(i, 1); continue; }
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  },
  draw(c, cam) {
    for (const p of this.list) {
      const k = 1 - p.t / p.life;
      const x = p.x - cam.x, y = p.y - cam.y;
      c.save();
      if (p.kind === 'ring') {
        c.globalAlpha = k * 0.8;
        c.strokeStyle = p.color; c.lineWidth = 3;
        c.beginPath(); c.arc(x, y, p.size + (1 - k) * 40, 0, Math.PI * 2); c.stroke();
      } else if (p.kind === 'text') {
        c.globalAlpha = k;
        c.font = 'bold ' + p.size + 'px Georgia'; c.textAlign = 'center';
        c.fillStyle = p.color;
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 3;
        c.strokeText(p.text, x, y); c.fillText(p.text, x, y);
      } else if (p.kind === 'petal') {
        c.globalAlpha = k;
        c.translate(x, y); c.rotate(p.t * 6);
        c.fillStyle = p.color;
        c.beginPath(); c.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2); c.fill();
      } else if (p.kind === 'spark') {
        c.globalAlpha = k;
        c.strokeStyle = p.color; c.lineWidth = 2;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - p.vx * 0.03, y - p.vy * 0.03); c.stroke();
      } else {
        c.globalAlpha = k * 0.9;
        if (p.glow) { c.shadowColor = p.color; c.shadowBlur = 8; }
        c.fillStyle = p.color;
        c.beginPath(); c.arc(x, y, p.shrink ? p.size * k : p.size, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
  },
};
