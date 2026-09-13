"use strict";
// ============================================================
// VIGHNAHARTA — levels.js
// Levels are described in TILE coordinates with a tiny builder DSL.
// game.js instantiates entities from these descriptors.
// ============================================================

const ROWS = 26;                       // default world height in tiles
const T = t => t * TILE;

class LevelBuilder {
  constructor(theme, opts = {}) {
    this.theme = theme;
    this.width = opts.width || 200;
    this.rows = opts.rows || ROWS;
    this.groundRow = opts.groundRow || 20;
    this.solids = [];        // {x,y,w,h,kind} px
    this.ents = [];          // descriptors
    this.spawn = { x: T(4), y: T(this.groundRow - 2) };
    this.bossArena = null;
    this.name = opts.name || '';
    this.subtitle = opts.subtitle || '';
    this.quest = opts.quest || '';
  }
  // ---- terrain ----
  ground(x, w, kind, rowOff = 0) { // solid earth from groundRow down
    const ty = this.groundRow + rowOff;
    this.solids.push({ x: T(x), y: T(ty), w: T(w), h: T(this.rows - ty), kind: kind || 'ground' });
    return this;
  }
  block(x, y, w, h, kind) { this.solids.push({ x: T(x), y: T(y), w: T(w), h: T(h), kind: kind || 'stone' }); return this; }
  plat(x, y, w, kind) { this.solids.push({ x: T(x), y: T(y), w: T(w), h: 10, kind: kind || 'plat' }); return this; }
  beam(x, y, w) { this.solids.push({ x: T(x), y: T(y), w: T(w), h: 6, kind: 'beam' }); return this; }
  wall(x, y, h, kind) { this.block(x, y, 1, h, kind); return this; }
  water(x, w) { this.ents.push({ type: 'water', x: T(x), y: T(this.groundRow + 1), w: T(w), h: 400 }); return this; }
  mud(x, w) { this.solids.push({ x: T(x), y: T(this.groundRow), w: T(w), h: T(this.rows - this.groundRow), kind: 'mud', slow: true }); return this; }
  pit(x, w, depth) { // carve ground; optional depth tiles of floor (shallow gutter/well), else void
    this.ents.push({ type: 'pit', x: T(x), w: T(w), depth });
    return this;
  }
  // ---- entities ----
  breakable(x, y, kind, w = 2, h = 2) { this.ents.push({ type: 'breakable', x: T(x), y: T(y), w: T(w), h: T(h), kind }); return this; }
  pushBlock(x, y) { this.ents.push({ type: 'pushblock', x: T(x), y: T(y) }); return this; }
  hanger(x, y, slotX, slotY) { this.ents.push({ type: 'hanger', x: T(x), y: T(y), slotX: T(slotX), slotY: T(slotY) }); return this; }
  modak(x, y) { this.ents.push({ type: 'modak', x: T(x) + 16, y: T(y) }); return this; }
  flower(x, y) { this.ents.push({ type: 'flower', x: T(x) + 16, y: T(y) }); return this; }
  trail(x, y, n, dx = 2, dy = 0) { for (let i = 0; i < n; i++) this.modak(x + i * dx, y + i * dy); return this; }
  npc(x, name, lines, kind, floorRow) { this.ents.push({ type: 'npc', x: T(x), y: T(floorRow || this.groundRow), name, lines, kind: kind || 'villager' }); return this; }
  bell(x, y) { this.ents.push({ type: 'bell', x: T(x) + 16, y: T(y) }); return this; }
  lamp(x, floorRow) { this.ents.push({ type: 'lamp', x: T(x) + 16, y: T(floorRow || this.groundRow), lit: false }); return this; }
  flag(x, y) { this.ents.push({ type: 'flag', x: T(x) + 16, y: T(y), raised: false }); return this; }
  tool(x, kind) { this.ents.push({ type: 'tool', x: T(x) + 16, y: T(this.groundRow - 1), kind }); return this; }
  ring(x, y) { this.ents.push({ type: 'ring', x: T(x) + 16, y: T(y) }); return this; }
  switchAt(x, y, gateId) { this.ents.push({ type: 'switch', x: T(x) + 16, y: T(y), gateId }); return this; }
  gate(x, gateId, h = 4) { this.ents.push({ type: 'gate', id: gateId, x: T(x), y: T(this.groundRow - h), w: T(2), h: T(h), open: false }); return this; }
  guard(x, x2, boss, floorRow) { this.ents.push({ type: 'guard', x: T(x), y: T(floorRow || this.groundRow), x2: T(x2), boss }); return this; }
  fog(x, y, w, h) { this.ents.push({ type: 'fog', x: T(x), y: T(y), w: T(w), h: T(h) }); return this; }
  boss(type, x, arenaW, floorRow) {
    this.bossArena = { x: T(x), w: T(arenaW), type, x2: T(x + arenaW), floorRow: floorRow || null };
    return this;
  }
  exit(x, floorRow) { this.ents.push({ type: 'exit', x: T(x) + 16, y: T(floorRow || this.groundRow) }); return this; }
  sign(x, text) { this.ents.push({ type: 'sign', x: T(x) + 16, y: T(this.groundRow), text }); return this; }
}

// ============================================================
// THEMES
// ============================================================
const THEMES = [
  { name: 'Shrine Hub', skyTop: '#3a2418', skyMid: '#6b3d20', skyLow: '#a35c2a', sun: '#ffdf8a', sunGlow: 'rgba(255,200,110,0.35)', farSil: '#4a2c18', midSil: '#3a2012', nearSil: '#241408', accent: '#ff9933' },
  { name: 'Market Lane', skyTop: '#7a4a28', skyMid: '#c47f3a', skyLow: '#e8b060', sun: '#ffe9a8', sunGlow: 'rgba(255,220,140,0.4)', farSil: '#8a5a33', midSil: '#5f3d22', nearSil: '#3a2412', accent: '#ff9933' },
  { name: 'Temple Steps', skyTop: '#2c3a52', skyMid: '#5a5a7a', skyLow: '#c98a5a', sun: '#ffd8a0', sunGlow: 'rgba(255,190,120,0.4)', farSil: '#3d4a63', midSil: '#2a3348', nearSil: '#1a2130', accent: '#f2c14e' },
  { name: 'Riverbank & Bridge', skyTop: '#5a7a8a', skyMid: '#8fb5a8', skyLow: '#e0d0a0', sun: '#fff2c8', sunGlow: 'rgba(255,250,200,0.4)', farSil: '#6a8a70', midSil: '#4a6a50', nearSil: '#2e4a35', accent: '#7fb069' },
  { name: 'Inner Courtyard', skyTop: '#2a1a35', skyMid: '#4a2a4a', skyLow: '#8a4a3a', sun: '#ff9a60', sunGlow: 'rgba(255,140,80,0.35)', farSil: '#3a2440', midSil: '#281830', nearSil: '#170e1e', accent: '#c9a0dc' },
  { name: 'Main Shrine Path', skyTop: '#141020', skyMid: '#2c1f3a', skyLow: '#5a3a4a', sun: '#f2e0c0', sunGlow: 'rgba(240,220,180,0.3)', farSil: '#241a30', midSil: '#181024', nearSil: '#0e0a16', accent: '#b0a0ff' },
];

// ============================================================
// LEVEL 0 — SHRINE HUB
// ============================================================
function buildHub() {
  const b = new LevelBuilder(THEMES[0], { width: 60, name: 'Shrine Hub', subtitle: 'Rest. Reflect. Return stronger.', quest: 'Choose a path. Obstacles await.' });
  b.ground(0, 60);
  b.ents.push({ type: 'shrine', x: T(8) + 16, y: T(20) });
  b.lamp(12); b.lamp(14); b.bell(16, 14);
  b.flag(6, 20);
  for (let i = 1; i <= 5; i++) {
    b.ents.push({ type: 'portal', x: T(20 + (i - 1) * 8) + 16, y: T(20), level: i, name: THEMES[i].name });
  }
  b.npc(46, 'Temple Priest', [
    'The village waits, Vighnaharta.',
    'Each demon you calm brightens every street.',
  ], 'priest');
  b.modak(30, 17); b.modak(32, 17);
  b.sign(10, 'Walk to a glowing arch — press F to enter');
  return b;
}

// ============================================================
// LEVEL 1 — MARKET LANE (tutorial: move, jump, axe, charged, noose)
// ============================================================
function buildLevel1() {
  const b = new LevelBuilder(THEMES[1], {
    width: 215, name: 'Market Lane', subtitle: 'Where ignorance blocks the stalls',
    quest: 'Clear the market. Humble the captain.',
  });
  // --- A: start & first jump ---
  b.ground(0, 46);
  b.npc(10, 'Paati', [
    'They say a remover of obstacles has come...',
    'The lane is blocked ahead. Please, little elephant.',
  ]);
  b.sign(6, 'Move — A / D. Jump — SPACE');
  b.block(16, 19, 1, 1, 'wood');                       // crate to hop
  b.trail(18, 18, 3);
  // --- B: rising steps + double-jump wall ---
  b.block(24, 19, 3, 1, 'stone');
  b.block(28, 18, 3, 2, 'stone');
  b.block(33, 15, 1, 5, 'stone');                       // 5-tile wall → double jump
  b.sign(29, 'Press JUMP again in the air');
  b.trail(33, 13, 1);
  b.ground(34, 12);
  b.pit(38, 2, 3);                                      // shallow gutter (climbable)
  // --- C: axe pickup & first barriers ---
  b.tool(44, 'axe');
  b.sign(43, 'Take the Parashu — tap J to slash');
  b.ground(46, 40);
  b.breakable(48, 20, 'wood', 2, 2);                    // cart
  b.trail(50, 18, 2);
  b.breakable(53, 20, 'wood', 2, 3);                    // crate stack
  b.block(56, 17, 1, 3, 'stone');                       // ledge
  b.breakable(57, 16, 'bush', 2, 1);
  b.trail(57, 14, 2);
  // --- D: combo stations + guard ---
  b.breakable(62, 20, 'wood', 1, 2);
  b.breakable(66, 20, 'wood', 2, 2);
  b.breakable(70, 20, 'stone', 2, 2);                   // needs charged smash
  b.sign(68, 'HOLD J — charged smash breaks stone');
  b.guard(74, 80);
  b.trail(72, 18, 3);
  // --- E: wall-slide shaft + flower cache ---
  b.sign(83, 'Hold toward a wall to slide — jump off it');
  b.wall(84, 10, 6, 'stone');                           // left wall (walk under)
  b.wall(88, 6, 14, 'stone');                           // right wall (blocks street)
  b.plat(85, 9, 3, 'platStone');
  b.block(85, 5, 5, 1, 'platStone');                    // top ledge 85..90
  b.flower(86, 3); b.flower(87, 3);
  b.breakable(89, 5, 'stone', 1, 2);                    // charged: cache guard
  b.flower(90, 3); b.modak(90, 4);
  b.breakable(92, 20, 'stone', 1, 6);                   // cracked wall — charged opens street
  // --- F: vendor rescue ---
  b.breakable(96, 20, 'wood', 2, 2);
  b.breakable(99, 20, 'stone', 2, 2);
  b.npc(102, 'Vendor', [
    'The captain sealed the lane, shouting he is the town.',
    'His name is Ego. His armor is his pride.',
  ]);
  b.ring(108, 8);                                       // ring tease
  b.trail(105, 18, 2);
  b.ground(86, 27);                                     // 86..113
  // --- G: noose pickup, switch gate, ring well ---
  b.tool(112, 'noose');
  b.sign(111, 'The Pasha! Throw with K — HOLD to pull');
  b.ground(113, 34);
  b.switchAt(118, 13, 'gate1');
  b.wall(119, 9, 5, 'stone');
  b.gate(121, 'gate1', 4);
  b.pit(126, 4, 5);                                     // well with ring
  b.ring(128, 15);
  b.sign(124, 'Latch the ring, then JUMP to swing');
  b.trail(131, 18, 2);
  // --- H: boss arena ---
  b.ground(147, 68);
  b.boss('ego', 152, 30);
  b.exit(198);
  b.lamp(150); b.lamp(196);
  return b;
}

// ============================================================
// LEVEL 2 — TEMPLE STEPS (noose + verticality)
// ============================================================
function buildLevel2() {
  const b = new LevelBuilder(THEMES[2], {
    width: 100, rows: 42, groundRow: 38, name: 'Temple Steps', subtitle: 'The climb to the hoarded lamp',
    quest: 'Climb the temple. Break Greed\u2019s grip.',
  });
  b.ground(0, 100);
  b.npc(8, 'Lampkeeper', [
    'The merchant spirit hoards our lamp oil.',
    'The shrine above sits dark. Will you climb?',
  ]);
  b.bell(12, 34);
  b.lamp(50);
  // lower stair with switch gate
  b.sign(16, 'Pull the switch — throw K, then HOLD');
  b.switchAt(18, 34, 'l2g1');
  b.wall(19, 34, 4, 'stone');
  b.gate(21, 'l2g1', 4);
  // first ring swing over a well
  b.pit(26, 5, 3);
  b.ring(28, 33);
  // hanging platform → pull down into bridge slot
  b.pit(38, 6, 3);
  b.hanger(36, 26, 40, 37);
  b.sign(34, 'A hanging platform! Pull it — make a bridge');
  b.trail(45, 36, 2);
  b.modak(41, 30);
  // vertical shaft: wall-slide + plats + ring
  b.wall(52, 14, 24, 'stone');
  b.wall(56, 18, 20, 'stone');
  b.plat(53, 35, 3, 'platStone');
  b.plat(53, 31, 3, 'platStone');
  b.plat(53, 26, 2, 'platStone');
  b.modak(54, 28);
  b.plat(53, 21, 3, 'platStone');
  b.modak(54, 23);
  b.plat(53, 17, 3, 'platStone');
  b.ring(54, 17);
  b.plat(57, 13, 3, 'platStone');
  // upper gallery (row 12 floor, x60..98)
  b.block(60, 12, 38, 2, 'stone');
  b.guard(64, 70, false, 12);
  b.breakable(68, 12, 'wood', 2, 2);
  b.flower(69, 11);
  b.flag(72, 12);
  b.npc(78, 'Young Devotee', [
    'I hid my doll from him. He wants everything.',
    'Show him that giving is wealth.',
  ], 'villager', 12);
  b.lamp(90, 12);
  // boss on the upper plateau
  b.boss('greed', 84, 14, 12);
  b.exit(96, 12);
  return b;
}

// ============================================================
// LEVEL 3 — RIVERBANK & BRIDGE (trunk, water, fog)
// ============================================================
function buildLevel3() {
  const b = new LevelBuilder(THEMES[3], {
    width: 230, name: 'Riverbank & Bridge', subtitle: 'Push back the flood of temper',
    quest: 'Reach the far bank. Cool the river\u2019s rage.',
  });
  b.ground(0, 40);
  b.npc(8, 'Ferryman', [
    'The river guardian rages; the bridge is broken.',
    'A strong breath can move what hands cannot.',
  ]);
  b.tool(12, 'trunk');
  b.sign(11, 'The Trunk! Tap E to blast — push things');
  // river crossing: blast blocks into the water as stepping stones
  b.water(20, 12);
  b.pit(20, 12);                                        // deep channel
  b.ground(24, 4);                                      // island
  b.pushBlock(17, 20);
  b.sign(15, 'Blast the block into the river — a stepping stone');
  b.pushBlock(27, 20);
  b.ground(32, 48);                                     // 32..80
  b.ground(80, 30);                                     // 80..110
  b.fog(84, 14, 8, 6);
  b.sign(81, 'HOLD E — blessing breath clears ignorance');
  b.breakable(88, 20, 'bush', 3, 2);
  b.trail(90, 18, 2);
  b.lamp(85);
  // muddy stretch + thorns + guard
  b.ground(110, 40);                                    // 110..150
  b.mud(112, 8);
  b.breakable(118, 20, 'wood', 2, 2);
  b.guard(122, 128);
  b.pit(133, 3, 5);
  b.ring(134, 15);
  b.trail(138, 18, 3);
  b.npc(142, 'Washerwoman', [
    'My sari blew onto the shrine roof when he roared.',
    'If the river calms, I can fetch it.',
  ]);
  // broken bridge section — hangars become the bridge
  b.pit(146, 8);
  b.water(146, 8);
  b.hanger(147, 15, 150, 19);
  b.hanger(151, 15, 154, 19);
  b.ground(154, 26);                                    // 154..180
  b.fog(158, 14, 6, 6);
  b.modak(162, 16);
  b.switchAt(166, 14, 'l3g1');
  b.wall(167, 14, 6, 'stone');
  b.gate(169, 'l3g1', 4);
  // boss: Anger at the far bank
  b.ground(180, 50);
  b.boss('anger', 186, 30);
  b.exit(212);
  b.lamp(183); b.lamp(210);
  return b;
}

// ============================================================
// LEVEL 4 — INNER COURTYARD (stealth-lite, guards, attachment)
// ============================================================
function buildLevel4() {
  const b = new LevelBuilder(THEMES[4], {
    width: 210, name: 'Inner Courtyard', subtitle: 'Where guards mistake pride for duty',
    quest: 'Cross the courtyard unseen. Loosen what clings.',
  });
  b.ground(0, 50);
  b.npc(8, 'Weaver', [
    'Guards patrol with lanterns. Step into their gaze and they shove.',
    'Dash through shadow, little one.',
  ]);
  b.sign(11, 'Sneak behind guards — or dash past their gaze');
  b.guard(20, 28);
  b.block(24, 17, 1, 3, 'stone');                       // hop-over block
  b.trail(26, 16, 2);
  b.guard(34, 42);
  b.breakable(38, 20, 'wood', 2, 2);
  b.breakable(44, 20, 'stone', 1, 8);                   // cracked wall → upper route
  // upper route with beams over wells
  b.block(45, 11, 6, 1, 'platStone');
  b.beam(51, 11, 6);
  b.beam(57, 11, 6);
  b.block(63, 11, 4, 1, 'platStone');
  b.modak(53, 10); b.modak(59, 10);
  b.ground(69, 51);                                     // 69..120
  b.ring(72, 12);
  b.switchAt(76, 13, 'l4g1');
  b.wall(77, 13, 7, 'stone');
  b.gate(79, 'l4g1', 4);
  b.guard(84, 92);
  b.breakable(88, 20, 'stone', 2, 2);
  b.fog(94, 14, 7, 6);
  b.npc(97, 'Watchman\u2019s Daughter', [
    'My father guards a gate no one attacks.',
    'Duty became fear. He cannot stop watching.',
  ]);
  b.trail(100, 18, 2);
  b.mud(104, 6);
  b.guard(112, 120);
  b.flag(108, 20);
  b.lamp(116);
  // boss: Attachment
  b.ground(120, 90);                                    // 120..210
  b.boss('attachment', 136, 30);
  b.exit(200);
  b.lamp(133); b.lamp(198);
  return b;
}

// ============================================================
// LEVEL 5 — MAIN SHRINE PATH (gauntlet + Ignorance)
// ============================================================
function buildLevel5() {
  const b = new LevelBuilder(THEMES[5], {
    width: 240, name: 'Main Shrine Path', subtitle: 'The last road to the sanctum',
    quest: 'Walk the gauntlet. Reveal what hides.',
  });
  b.ground(0, 46);
  b.npc(8, 'Head Priest', [
    'The fog at the sanctum is not weather.',
    'It is forgetting. Light it away.',
  ]);
  b.sign(12, 'All three tools, one path. Bless your strength.');
  // gauntlet 1: axe
  b.breakable(18, 20, 'wood', 2, 2);
  b.breakable(22, 20, 'stone', 2, 2);
  b.guard(26, 32);
  b.trail(28, 18, 2);
  // gauntlet 2: noose
  b.pit(36, 6, 3);
  b.ring(38, 15);
  b.switchAt(42, 14, 'l5g1');
  b.wall(43, 14, 6, 'stone');
  b.gate(44, 'l5g1', 4);
  b.pit(46, 6);                                         // void gap
  b.hanger(48, 14, 48, 19);                             // pull down to bridge the gap
  b.ground(52, 24);                                     // 52..76
  // gauntlet 3: trunk + water + fog
  b.water(64, 8);
  b.pit(64, 8);
  b.pushBlock(61, 20);
  b.ground(72, 22);                                     // 72..94
  b.fog(78, 14, 6, 6);
  b.ground(94, 30);                                     // 94..124
  b.breakable(104, 20, 'bush', 3, 2);
  b.mud(108, 6);
  b.trail(112, 18, 3);
  b.npc(116, 'Lost Child', [
    'I forgot which house is mine in the fog.',
    'Will the shrine still remember my name?',
  ]);
  // final mixed climb
  b.wall(124, 10, 6, 'stone');                          // walk under
  b.wall(128, 8, 12, 'stone');                          // blocks street
  b.plat(125, 16, 3, 'platStone');
  b.plat(125, 11, 2, 'platStone');
  b.modak(126, 14);
  b.beam(131, 8, 6);
  b.ground(137, 103);                                   // 137..240
  b.guard(142, 150);
  b.switchAt(156, 13, 'l5g2');
  b.wall(157, 13, 7, 'stone');
  b.gate(159, 'l5g2', 4);
  b.fog(164, 14, 6, 6);
  b.lamp(146); b.lamp(168);
  // boss: Ignorance
  b.boss('ignorance', 180, 34);
  b.exit(226);
  return b;
}

// ============================================================
const LEVEL_BUILDERS = [buildHub, buildLevel1, buildLevel2, buildLevel3, buildLevel4, buildLevel5];
const BOSS_META = {
  ego: { name: 'EGO', title: 'the Boastful Captain', hp: 14, weakness: 'noose', card: 'ARROGANCE — REMOVED', hint: 'Armor plates sweep low. Pull them off with the noose!' },
  greed: { name: 'GREED', title: 'the Hoarding Spirit', hp: 16, weakness: 'axe', card: 'GREED — RELEASED', hint: 'His pots crack to the charged smash. Pull the hoard loose!' },
  anger: { name: 'ANGER', title: 'the Flood Guardian', hp: 16, weakness: 'trunk', hint: 'His tide can be pushed back. Blast it with the trunk!', card: 'ANGER — COOLED' },
  attachment: { name: 'ATTACHMENT', title: 'the Clinging Shadow', hp: 14, weakness: 'dash', hint: 'It clings and slows you. Dash to shed it, then strike!', card: 'ATTACHMENT — LOOSENED' },
  ignorance: { name: 'IGNORANCE', title: 'the Formless Fog', hp: 18, weakness: 'trunk', hint: 'Blessing breath reveals its core. Strike the light!', card: 'IGNORANCE — ILLUMINATED' },
};
