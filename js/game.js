"use strict";
// ============================================================
// VIGHNAHARTA — game.js
// Orchestrator: states, level lifecycle, HUD, screens, main loop.
// ============================================================

const Game = {
  state: 'title',           // title|intro|playing|dialog|blessing|shop|paused|levelend|victory|controls
  save: null,
  levelId: 1,
  level: null,
  player: null,
  cam: { x: 0, y: 0 },
  shake: 0, hitStop: 0, time: 0, levelTime: 0,
  fogCleared: 0,
  spawnQueue: [],
  dialog: null, blessing: null, shop: null,
  menuIdx: 0, pauseIdx: 0, shopIdx: 0, blessIdx: 0,
  card: null,               // {big, sub, t}
  toast: null, toastT: 0,
  bossCard: 0, transition: 0, transitionCb: null,
  modakPop: 0, flowerPop: 0,
  deathT: 0, introT: 0, endT: 0,
  controlsFrom: 'title',
  titleT: 0,
  prevPlaying: 'playing',

  // ---------------- boot ----------------
  init() {
    this.save = Save.load();
    // mouse-vs-keys aim flag
    canvas.addEventListener('mousemove', () => { Input.mouse.usingMouse = true; });
    window.addEventListener('keydown', () => { Input.mouse.usingMouse = false; });
    // touch buttons (virtual 1280x720 coords)
    Input.touch.buttons = [
      { x: 1150, y: 600, r: 56, action: 'jump', label: 'JUMP' },
      { x: 1020, y: 664, r: 36, action: 'dash', label: 'DASH' },
      { x: 905, y: 590, r: 42, action: 'axe', label: 'AXE' },
      { x: 1010, y: 522, r: 34, action: 'noose', label: 'NOOSE' },
      { x: 925, y: 480, r: 34, action: 'trunk', label: 'TRUNK' },
      { x: 640, y: 560, r: 38, action: 'interact', label: 'USE', dynamic: true },
    ];
    requestAnimationFrame(ts => this.frame(ts));
  },

  frame(ts) {
    if (!this._last) this._last = ts;
    let dt = Math.min((ts - this._last) / 1000, 0.05);
    this._last = ts;
    Input._frame();
    this.time += dt;
    // hit-stop: freeze world, keep rendering
    let sdt = dt;
    if (this.hitStop > 0) { this.hitStop -= dt; sdt = 0; }
    this.update(sdt, dt);
    this.render();
    Input._clear();   // consume one-frame edge inputs after update reads them
    requestAnimationFrame(t => this.frame(t));
  },

  // ---------------- level lifecycle ----------------
  startLevel(id, skipIntro) {
    this.levelId = id;
    this.instantiateLevel(id);
    this.player = new Player(this.level.spawn.x, this.level.spawn.y);
    this.player.hasAxe = this.player.hasNoose = this.player.hasTrunk = true;
    this.cam.x = clamp(this.player.cx - VW / 2, 0, this.level.width - VW);
    this.cam.y = clamp(this.player.cy - VH / 2, 0, Math.max(0, this.level.rows * TILE - VH));
    this.levelTime = 0; this.fogCleared = 0;
    this.spawnQueue.length = 0;
    Audio2.bossMode = false; Audio2.intensity = id === 0 ? 0 : 1;
    this.state = skipIntro || id === 0 ? 'playing' : 'intro';
    this.introT = 0;
  },

  instantiateLevel(id) {
    const b = LEVEL_BUILDERS[id]();
    const lvl = {
      id, theme: b.theme, name: b.name, subtitle: b.subtitle, quest: b.quest,
      width: T(b.width), rows: b.rows, groundRow: b.groundRow,
      spawn: b.spawn,
      builder: b,
      solids: [], breakables: [], pushblocks: [], hangers: [], pickups: [],
      npcs: [], bells: [], lamps: [], flags: [], rings: [], switches: [],
      gates: [], guards: [], fogs: [], waters: [], signs: [], portals: [],
      shrines: [], exits: [], tools: [],
      boss: null, bossArena: b.bossArena, bossSpawned: false,
      parallax: Art.makeParallax(b.theme),
      brighten: 0, brightening: false,
      checkpoint: { x: b.spawn.x, y: b.spawn.y },
      pitRanges: [],
    };
    // subtract pits from ground/mud solids
    const pits = b.ents.filter(e => e.type === 'pit');
    for (const s of b.solids) {
      if (s.kind === 'ground' || s.kind === 'mud') {
        let segs = [{ x: s.x, w: s.w }];
        for (const p of pits) {
          const next = [];
          for (const seg of segs) {
            const pEnd = p.x + p.w, sEnd = seg.x + seg.w;
            if (pEnd <= seg.x || p.x >= sEnd) { next.push(seg); continue; }
            if (p.x > seg.x) next.push({ x: seg.x, w: p.x - seg.x });
            if (pEnd < sEnd) next.push({ x: pEnd, w: sEnd - pEnd });
          }
          segs = next;
        }
        for (const seg of segs) if (seg.w > 2) lvl.solids.push({ x: seg.x, y: s.y, w: seg.w, h: s.h, kind: s.kind, slow: s.slow });
      } else lvl.solids.push({ x: s.x, y: s.y, w: s.w, h: s.h, kind: s.kind });
    }
    // world boundary walls
    lvl.solids.push({ x: -40, y: -T(10), w: 40, h: lvl.rows * TILE + T(10), kind: 'stone' });
    lvl.solids.push({ x: lvl.width, y: -T(10), w: 40, h: lvl.rows * TILE + T(10), kind: 'stone' });
    // entities
    const CLS = { breakable: Breakable, pushblock: PushBlock, hanger: Hanger, npc: NPC, bell: Bell, lamp: Lamp, flag: Flag, ring: Ring, switch: Switch, gate: Gate, guard: Guard, fog: Fog, water: Water, sign: Sign, portal: Portal, shrine: Shrine, exit: ExitDoor };
    for (const e of b.ents) {
      if (e.type === 'pit') continue;
      if (e.type === 'modak' || e.type === 'flower') { lvl.pickups.push(new Pickup(e)); continue; }
      if (e.type === 'tool') { lvl.tools.push(e); continue; }
      const C = CLS[e.type];
      if (C) lvl[({ breakable: 'breakables', pushblock: 'pushblocks', hanger: 'hangers', npc: 'npcs', bell: 'bells', lamp: 'lamps', flag: 'flags', ring: 'rings', switch: 'switches', gate: 'gates', guard: 'guards', fog: 'fogs', water: 'waters', sign: 'signs', portal: 'portals', shrine: 'shrines', exit: 'exits' })[e.type]].push(new C(e));
    }
    // hub: pre-lit lamps, all tools owned
    if (id === 0) { lvl.lamps.forEach(l => l.lit = true); }
    this.level = lvl;
  },

  spawnBoss() {
    const lvl = this.level, arena = lvl.bossArena;
    const d = { type: arena.type, x: arena.x + arena.w * 0.6, y: lvl.groundRow * TILE };
    lvl.boss = new (BOSS_CLASSES[arena.type])(d);
    lvl.bossSpawned = true;
    // arena walls
    lvl.solids.push({ x: arena.x - 8, y: lvl.groundRow * TILE - T(14), w: 8, h: T(14), kind: 'stone', arenaWall: true });
    lvl.solids.push({ x: arena.x + arena.w, y: lvl.groundRow * TILE - T(14), w: 8, h: T(14), kind: 'stone', arenaWall: true });
    Audio2.conch();
    Audio2.bossMode = true;
    this.bossCard = 2.6;
    Game.shake = 5;
  },

  onBossDefeated() {
    const lvl = this.level;
    lvl.brightening = true;
    Audio2.bossMode = false; Audio2.intensity = 0;
    // remove arena walls
    lvl.solids = lvl.solids.filter(s => !s.arenaWall);
    this.save.defeated.push(lvl.id);
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(lvl.id + 1, 5));
    this.save.modaks += 15; this.save.flowers += 4;
    this.modakPop = 1;
    Save.write();
    const meta = lvl.boss.meta;
    this.card = { big: meta.card, sub: lvl.boss.meta.name + ' returns to light. The village brightens.', t: 0 };
    Particles.burst(this.player.cx, this.player.cy - 60, 26, { color: '#ffd23f', spMax: 260, life: 1.2, size: 4, kind: 'petal' });
  },

  completeLevel() {
    const id = this.levelId;
    Save.write();
    this.transition = 1;
    this.transitionCb = () => {
      if (id === 5) { this.state = 'victory'; this.endT = 0; }
      else this.startLevel(0);
    };
  },

  respawn() {
    const p = this.player, cp = this.level.checkpoint;
    p.body.x = cp.x - p.body.w / 2; p.body.y = cp.y - p.body.h;
    p.body.vx = 0; p.body.vy = 0;
    p.health = p.maxHealth; p.stamina = p.maxStamina;
    p.dead = false; p.deathT = 0; p.hurtT = 1.2; p.shield = 0;
    p.detachNoose && p.detachNoose();
    p.attachedBy = null;
    if (this.level.boss && !this.level.boss.dead) {
      // reset boss position & hp partially (merciful)
      const bo = this.level.boss;
      bo.x = bo.arena.x + bo.arena.w * 0.6; bo.vy = 0;
      bo.hp = Math.min(bo.maxHp, bo.hp + Math.ceil(bo.maxHp * 0.25));
      bo.setState('idle');
      bo.waves && (bo.waves.length = 0);
      bo.coins && (bo.coins.length = 0);
      bo.puffs && (bo.puffs.length = 0);
    }
    this.cam.x = clamp(p.cx - VW / 2, 0, this.level.width - VW);
  },

  setCheckpoint(x, y) { this.level.checkpoint = { x, y }; },

  gainModak() { this.save.modaks++; this.modakPop = 1; },
  gainFlower(n = 1) { this.save.flowers += n; this.flowerPop = 1; },

  // ---------------- interaction ----------------
  nearestInteractable() {
    const p = this.player, lvl = this.level;
    if (!p || p.dead) return null;
    let best = null, bd = 90 * 90;
    const consider = (list) => {
      for (const o of list) {
        const ox = o.x + (o.w ? o.w / 2 : 0), oy = o.y + (o.h ? o.h / 2 : 0);
        const d = dist2(p.cx, p.cy, o.type === 'npc' || o.type === 'shrine' || o.type === 'portal' ? o.x : ox, o.type === 'npc' ? o.y - 30 : oy);
        if (d < bd) { bd = d; best = o; }
      }
    };
    consider(lvl.npcs); consider(lvl.bells); consider(lvl.lamps); consider(lvl.flags); consider(lvl.shrines);
    if (lvl.id === 0) consider(lvl.portals);
    return best;
  },

  openDialog(npc) {
    this.dialog = { npc, idx: 0, chars: 0 };
    this.prevPlaying = this.state === 'paused' ? 'playing' : this.state;
    this.state = 'dialog';
    Audio2.play('menu');
  },
  advanceDialog() {
    const d = this.dialog;
    if (!d) return;
    const full = d.npc.lines[d.idx];
    if (d.chars < full.length) { d.chars = full.length; return; }
    d.idx++;
    d.chars = 0;
    if (d.idx >= d.npc.lines.length) {
      const npc = d.npc;
      this.dialog = null;
      if (!npc.rescued) {
        npc.rescued = true;
        this.save.rescues[this.levelId + ':' + npc.name] = true;
        this.save.modaks += 2;
        Save.write();
        Particles.burst(npc.x, npc.y - 50, 14, { color: '#ffe9a8', spMax: 120, life: 0.8 });
        Audio2.play('bless');
        this.blessing = { npc, idx: 0 };
        this.state = 'blessing';
      } else {
        this.state = 'playing';
      }
    }
    Audio2.play('uiclick');
  },

  chooseBlessing(kind) {
    const p = this.player;
    if (kind === 0) {
      p.shield = Math.min(p.shield + 1, 2);
      Particles.text(p.cx, p.body.y - 30, '+blessing shield', '#ffe9a8');
      Audio2.play('shield');
    } else {
      p.maxStamina += 20; p.stamina = p.maxStamina;
      Particles.text(p.cx, p.body.y - 30, '+20 stamina', '#ffe9a8');
      Audio2.play('bless');
    }
    this.blessing = null;
    this.state = 'playing';
  },

  openShrineShop() { this.shop = { rows: this.shopRows() }; this.shopIdx = 0; this.state = 'shop'; Audio2.play('menu'); },
  shopRows() {
    const up = this.save.up;
    return [
      { name: 'Heart of Devotion', desc: '+1 max health', cost: 10, cur: 'modaks', key: 'heart', max: 2, lvl: up.heart },
      { name: 'Breath of Endurance', desc: '+25 max stamina', cost: 10, cur: 'modaks', key: 'stamina', max: 2, lvl: up.stamina },
      { name: 'Longer Pasha', desc: '+80 noose range', cost: 15, cur: 'modaks', key: 'noose', max: 2, lvl: up.noose },
      { name: 'Gentle Breath', desc: 'Trunk blast −30% stamina', cost: 15, cur: 'modaks', key: 'trunk', max: 2, lvl: up.trunk },
      { name: 'Petal Aura', desc: 'Divine petal trail', cost: 8, cur: 'flowers', key: 'aura', max: 1, lvl: up.aura },
    ];
  },
  buyShopRow() {
    const rows = this.shopRows();
    const r = rows[this.shopIdx];
    if (!r) return;
    if (r.lvl >= r.max) { Audio2.play('uiclick'); return; }
    if (this.save[r.cur] < r.cost) { Audio2.play('uiclick'); Particles.text(this.player.cx, this.player.body.y - 40, 'not enough ' + r.cur, '#cfc7b8'); return; }
    this.save[r.cur] -= r.cost;
    this.save.up[r.key]++;
    Save.write();
    Audio2.play('shield');
    const p = this.player;
    if (r.key === 'heart') { p.maxHealth = 3 + this.save.up.heart; p.health = p.maxHealth; }
    if (r.key === 'stamina') { p.maxStamina = 100 + this.save.up.stamina * 25; p.stamina = p.maxStamina; }
    if (r.key === 'noose') p.nooseRange = 300 + this.save.up.noose * 80;
    if (r.key === 'aura') p.aura = true;
    this.shop.rows = this.shopRows();
    Particles.burst(p.cx, p.cy, 16, { color: '#ffd23f', spMax: 160 });
  },

  // ---------------- MAIN UPDATE ----------------
  update(dt, rawDt) {
    this.shake = Math.max(0, this.shake - rawDt * 26);
    this.modakPop = Math.max(0, this.modakPop - rawDt * 3);
    this.flowerPop = Math.max(0, this.flowerPop - rawDt * 3);
    this.toastT = Math.max(0, this.toastT - rawDt);
    this.bossCard = Math.max(0, this.bossCard - rawDt);
    if (this.transition > 0) {
      this.transition -= rawDt * 1.6;
      if (this.transition <= 0.5 && this.transitionCb) { const cb = this.transitionCb; this.transitionCb = null; cb(); }
      return;
    }
    Particles.update(dt || rawDt * 0.2);

    switch (this.state) {
      case 'title': this.updateTitle(rawDt); break;
      case 'intro': this.introT += rawDt; if (this.introT > 2.6 || Input.actionPressed('confirm') || Input.actionPressed('jump') || Input.actionPressed('interact') || this.tapOrClick()) this.state = 'playing'; break;
      case 'playing': this.updatePlaying(dt, rawDt); break;
      case 'dialog': this.updateDialog(rawDt); break;
      case 'blessing': this.updateBlessing(rawDt); break;
      case 'shop': this.updateShop(rawDt); break;
      case 'paused': this.updatePaused(rawDt); break;
      case 'levelend': this.updateLevelEnd(rawDt); break;
      case 'victory': this.endT += rawDt; if ((this.endT > 1 && (Input.actionPressed('confirm') || Input.actionPressed('jump'))) || this.tapOrClick()) this.startLevel(0); break;
      case 'controls': if (Input.actionPressed('pause') || Input.actionPressed('confirm') || Input.actionPressed('interact') || this.tapOrClick()) { this.state = this.controlsFrom === 'paused' ? 'paused' : 'title'; } break;
    }
    // music
    Audio2.updateMusic(rawDt);
  },

  tapOrClick() {
    if (Input.tap && !Input.tap.used) { Input.tap.used = true; return true; }
    return false;
  },

  updateTitle(dt) {
    this.titleT += dt;
    const go = Input.actionPressed('confirm') || Input.actionPressed('jump') || Input.actionPressed('axe') || Input.actionPressed('interact') || Input.actionPressed('pause');
    if (go || this.tapOrClick()) {
      Audio2.unlock();
      Audio2.play('conch');
      this.startLevel(0);
    }
    if (Input.actionPressed('pause')) { this.controlsFrom = 'title'; this.state = 'controls'; }
  },

  updatePlaying(dt, rawDt) {
    const lvl = this.level, p = this.player;
    this.levelTime += rawDt;
    // pause
    if (Input.actionPressed('pause')) { this.pauseIdx = 0; this.state = 'paused'; Audio2.play('uiclick'); return; }

    // tool pickups
    for (let i = lvl.tools.length - 1; i >= 0; i--) {
      const tl = lvl.tools[i];
      if (dist2(p.cx, p.cy, tl.x, tl.y) < 46 * 46) {
        lvl.tools.splice(i, 1);
        if (tl.kind === 'axe') p.hasAxe = true;
        if (tl.kind === 'noose') p.hasNoose = true;
        if (tl.kind === 'trunk') p.hasTrunk = true;
        Audio2.play('shield'); Audio2.play('ringping');
        this.toast = { icon: tl.kind, text: tl.kind === 'axe' ? 'PARASHU — the Axe! Tap J to slash, HOLD to charge' : tl.kind === 'noose' ? 'PASHA — the Noose! Throw with K, HOLD to pull' : 'THE TRUNK! Tap E to blast, HOLD for blessing breath' };
        this.toastT = 4;
        Particles.burst(tl.x, tl.y, 20, { color: '#ffe9a8', spMax: 200 });
        Game.shake = 3;
      }
    }

    // solids list this frame
    const solids = [];
    for (const s of lvl.solids) if (s.active !== false) solids.push(s);
    for (const g of lvl.gates) if (g.solidRef.active) solids.push(g.solidRef);
    for (const br of lvl.breakables) if (br.alive) solids.push(br);
    for (const pb of lvl.pushblocks) if (pb.alive && !pb.inWater) solids.push(pb);
    for (const h of lvl.hangers) if (h.state === 'bridged') solids.push({ x: h.x, y: h.y, w: h.w, h: h.h });

    // player
    p.update(dt, solids);

    // interactions
    const near = this.nearestInteractable();
    this.nearInteract = near;
    if (near && (Input.actionPressed('interact') || this.touchPressed('interact'))) near.interact();

    // boss trigger
    if (!lvl.boss && lvl.bossArena && !lvl.bossSpawned && p.cx > lvl.bossArena.x - 240) this.spawnBoss();

    // update entities
    for (const br of lvl.breakables) br.update(dt);
    for (const pb of lvl.pushblocks) pb.update(dt, solids, lvl.waters);
    for (const h of lvl.hangers) h.update(dt);
    for (const pk of lvl.pickups) pk.update(dt, p, solids);
    for (const n of lvl.npcs) n.update(dt);
    for (const be of lvl.bells) be.update(dt);
    for (const g of lvl.guards) g.update(dt, p, solids);
    for (const f of lvl.fogs) f.update(dt);
    for (const s of lvl.switches) s.update(dt);
    for (const g of lvl.gates) g.update(dt);
    if (lvl.boss) lvl.boss.update(dt, solids);
    // prune collected pickups
    lvl.pickups = lvl.pickups.filter(pk => !pk.collected);
    // spawn queue
    while (this.spawnQueue.length) {
      const s = this.spawnQueue.shift();
      lvl.pickups.push(new Pickup(s));
    }

    // hazards: water & void
    for (const w of lvl.waters) {
      if (p.body.y + p.body.h > w.y + 14 && p.cx > w.x && p.cx < w.x + w.w && !p.dead) {
        Particles.burst(p.cx, w.y, 16, { color: '#9cc4e0', spMax: 220, up: 80 });
        Audio2.play('shatter');
        p.health--; p.hurtT = 1.2; Audio2.play('hurt');
        if (p.health <= 0) { p.dead = true; p.deathT = 0; }
        else this.respawn();
      }
    }
    if (p.body.y > lvl.rows * TILE + 80 && !p.dead) {
      p.health--; p.hurtT = 1.2; Audio2.play('hurt');
      Particles.text(p.cx, lvl.groundRow * TILE - 40, 'careful!', '#cfc7b8');
      if (p.health <= 0) { p.dead = true; p.deathT = 0; }
      else this.respawn();
    }
    // mud slow handled in player? apply friction effect: if standing in mud reduce speed target
    // (simplified: check ground kind)
    if (p.body.onGround) {
      const gs = onGroundAt(p.body, solids);
      if (gs && gs.slow) p.body.vx *= Math.pow(0.02, rawDt);
    }

    // death handling
    if (p.dead) {
      this.deathT += rawDt;
      if (this.deathT > 1.6) { this.deathT = 0; this.respawn(); }
    }

    // exit
    for (const ex of lvl.exits) {
      if (Math.abs(p.cx - ex.x) < 34 && Math.abs((p.body.y + p.body.h) - ex.y) < 70) {
        const bossAlive = lvl.boss && !lvl.boss.dead;
        if (lvl.id === 0) { /* hub has no exit */ }
        else if (!bossAlive) { this.completeLevel(); }
        else if (this.toastT <= 0) { this.toast = { text: 'The demon still lingers... face it!' }; this.toastT = 2.5; }
      }
    }

    // brighten anim
    if (lvl.brightening && lvl.brighten < 1) lvl.brighten = Math.min(1, lvl.brighten + rawDt / 3);

    // camera
    const lookAhead = clamp(p.body.vx * 0.24, -140, 140);
    const tx = clamp(p.cx + lookAhead - VW / 2, 0, Math.max(0, lvl.width - VW));
    const ty = clamp(p.cy - VH * 0.55, 0, Math.max(0, lvl.rows * TILE - VH));
    this.cam.x = lerp(this.cam.x, tx, Math.min(1, rawDt * 6));
    this.cam.y = lerp(this.cam.y, ty, Math.min(1, rawDt * 5));
    if (lvl.boss && !lvl.boss.dead) {
      // keep arena in view
      const ax = lvl.bossArena;
      this.cam.x = clamp(this.cam.x, ax.x - 120, Math.max(ax.x - 120, ax.x + ax.w + 120 - VW));
    }
    // mouse world
    Input.mouse.worldX = Input.mouse.x + this.cam.x;
    Input.mouse.worldY = Input.mouse.y + this.cam.y;
    // music intensity
    let anyAlert = lvl.guards.some(g => g.state === 'alert');
    Audio2.intensity = anyAlert ? 2 : (lvl.id === 0 ? 0 : 1);
    Audio2.bossMode = !!(lvl.boss && !lvl.boss.dead);
  },

  touchPressed(action) {
    // touch buttons set pressed via Input._pressed; actionPressed already covers
    return Input.actionPressed(action) && Input.touchActive;
  },

  updateDialog(dt) {
    const d = this.dialog;
    if (!d) { this.state = 'playing'; return; }
    const full = d.npc.lines[d.idx];
    if (d.chars < full.length) d.chars += dt * 46;
    if (Input.actionPressed('interact') || Input.actionPressed('confirm') || Input.actionPressed('axe') || this.tapOrClick()) this.advanceDialog();
    if (Input.actionPressed('pause')) { this.dialog = null; this.state = 'playing'; }
  },
  updateBlessing(dt) {
    if (Input.actionPressed('left')) { this.blessIdx = 0; Audio2.play('uiclick'); }
    if (Input.actionPressed('right')) { this.blessIdx = 1; Audio2.play('uiclick'); }
    if (Input.actionPressed('confirm') || Input.actionPressed('interact') || Input.actionPressed('axe')) this.chooseBlessing(this.blessIdx);
    // tap hit-test
    if (Input.tap && !Input.tap.used) {
      const t = Input.tap;
      if (t.y > VH * 0.45) { this.chooseBlessing(t.x < VW / 2 ? 0 : 1); Input.tap.used = true; }
    }
  },
  updateShop(dt) {
    const rows = this.shop.rows;
    if (Input.actionPressed('up')) { this.shopIdx = (this.shopIdx + rows.length - 1) % rows.length; Audio2.play('uiclick'); }
    if (Input.actionPressed('down')) { this.shopIdx = (this.shopIdx + 1) % rows.length; Audio2.play('uiclick'); }
    if (Input.actionPressed('confirm') || Input.actionPressed('interact') || Input.actionPressed('axe')) this.buyShopRow();
    if (Input.actionPressed('pause') || Input.actionPressed('noose')) { this.shop = null; this.state = 'playing'; Audio2.play('uiclick'); }
    if (Input.tap && !Input.tap.used) {
      const t = Input.tap; Input.tap.used = true;
      rows.forEach((r, i) => {
        const y = 200 + i * 74;
        if (t.y > y && t.y < y + 66 && t.x > VW / 2 - 330 && t.x < VW / 2 + 330) { this.shopIdx = i; this.buyShopRow(); }
      });
      if (t.y > VH - 80) { this.shop = null; this.state = 'playing'; }
    }
  },
  updatePaused(dt) {
    const opts = 5;
    if (Input.actionPressed('up')) { this.pauseIdx = (this.pauseIdx + opts - 1) % opts; Audio2.play('uiclick'); }
    if (Input.actionPressed('down')) { this.pauseIdx = (this.pauseIdx + 1) % opts; Audio2.play('uiclick'); }
    if (Input.actionPressed('confirm') || Input.actionPressed('interact') || Input.actionPressed('axe')) this.pauseSelect();
    if (Input.actionPressed('pause')) { this.state = 'playing'; }
    if (Input.tap && !Input.tap.used) {
      const t = Input.tap; Input.tap.used = true;
      const y0 = VH / 2 - 60;
      for (let i = 0; i < opts; i++) if (t.y > y0 + i * 52 - 10 && t.y < y0 + i * 52 + 42) { this.pauseIdx = i; this.pauseSelect(); }
    }
  },
  pauseSelect() {
    Audio2.play('uiclick');
    switch (this.pauseIdx) {
      case 0: this.state = 'playing'; break;
      case 1: this.startLevel(this.levelId, true); break;      // restart level
      case 2: this.controlsFrom = 'paused'; this.state = 'controls'; break;
      case 3: Audio2.toggleMute(); break;
      case 4: this.startLevel(0); break;                        // return to shrine hub
    }
  },
  updateLevelEnd(dt) {
    this.card.t += dt;
    if (this.card.t > 2.2) { this.card = null; this.state = 'playing'; }
  },

  // ============================================================
  // RENDER
  // ============================================================
  render() {
    const c = ctx;
    c.save();
    c.scale(renderScale, renderScale);
    const st = this.state;
    if (st === 'title') { this.renderTitle(c); c.restore(); return; }
    if (st === 'controls' && this.controlsFrom === 'title') { this.renderControls(c); c.restore(); return; }
    if (st === 'victory') { this.renderVictory(c); c.restore(); return; }

    this.renderWorld(c);
    this.renderHUD(c);

    // overlays
    if (st === 'intro') this.renderIntro(c);
    if (st === 'dialog') this.renderDialog(c);
    if (st === 'blessing') this.renderBlessing(c);
    if (st === 'shop') this.renderShop(c);
    if (st === 'paused') this.renderPaused(c);
    if (st === 'controls' && this.controlsFrom === 'paused') { this.renderControls(c); }
    if (st === 'levelend' && this.card) this.renderCard(c);
    if (this.bossCard > 0 && this.level && this.level.boss) this.renderBossCard(c);
    // transition fade
    if (this.transition > 0) {
      c.fillStyle = `rgba(10,6,3,${clamp(this.transition * 1.4, 0, 1)})`;
      c.fillRect(0, 0, VW, VH);
    }
    c.restore();
  },

  renderWorld(c) {
    const lvl = this.level, cam = this.cam, t = this.time;
    const p = this.player;
    c.fillStyle = lvl.theme.skyTop;
    c.fillRect(0, 0, VW, VH);
    // shake
    let sx = 0, sy = 0;
    if (this.shake > 0) { sx = rnd(-this.shake, this.shake); sy = rnd(-this.shake, this.shake); }
    // parallax
    const factors = [0.12, 0.3, 0.55];
    for (let i = 0; i < 3; i++) {
      const layer = lvl.parallax[i];
      const px = -((cam.x * factors[i]) % 1600);
      const py = VH - 480 - cam.y * factors[i] * 0.4 + (i === 0 ? -40 : 20 - i * 10);
      for (let rep = -1; rep <= 1; rep++) {
        c.drawImage(layer, Math.floor(px + rep * 1600), Math.floor(py + sy * 0.2));
      }
    }
    c.save();
    c.translate(sx, sy);

    // terrain
    for (const s of lvl.solids) {
      if (s.arenaWall) continue;
      if (s.x + s.w < cam.x - 40 || s.x > cam.x + VW + 40) continue;
      Art.drawTerrain(c, s.x - cam.x, s.y - cam.y, s.w, s.h, s.kind, s.x);
    }
    // water behind entities
    for (const w of lvl.waters) if (w.x + w.w > cam.x - 40 && w.x < cam.x + VW + 40) w.draw(c, cam, t);

    // background props
    for (const s of lvl.signs) s.draw(c, cam, t);
    for (const po of lvl.portals) po.draw(c, cam, t);
    for (const sh of lvl.shrines) sh.draw(c, cam, t);
    for (const g of lvl.gates) g.draw(c, cam, t);
    for (const l of lvl.lamps) l.draw(c, cam, t);
    for (const f of lvl.flags) f.draw(c, cam, t);
    for (const ex of lvl.exits) ex.draw(c, cam, t);

    // entities
    for (const h of lvl.hangers) h.draw(c, cam, t);
    for (const r of lvl.rings) r.draw(c, cam, t);
    for (const sw of lvl.switches) sw.draw(c, cam, t);
    for (const pb of lvl.pushblocks) pb.draw(c, cam, t);
    for (const br of lvl.breakables) br.draw(c, cam, t);
    for (const pk of lvl.pickups) pk.draw(c, cam);
    for (const tl of lvl.tools) Art.drawToolPickup(c, tl.x - cam.x, tl.y - cam.y, t, tl.kind);
    for (const n of lvl.npcs) n.draw(c, cam);
    for (const g of lvl.guards) g.draw(c, cam);
    for (const be of lvl.bells) be.draw(c, cam, t);

    // boss behind player
    if (lvl.boss) lvl.boss.draw(c, cam, t);
    // player
    p.draw(c, cam, t);
    // fog above all
    for (const f of lvl.fogs) f.draw(c, cam, t);
    // particles
    Particles.draw(c, cam);

    c.restore();

    // brighten overlay on boss defeat
    if (lvl.brighten > 0) {
      c.save();
      c.globalCompositeOperation = 'screen';
      c.fillStyle = `rgba(255,214,130,${lvl.brighten * 0.22})`;
      c.fillRect(0, 0, VW, VH);
      c.restore();
    }
    // vignette
    const vg = c.createRadialGradient(VW / 2, VH / 2, VH * 0.5, VW / 2, VH / 2, VH * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,10,5,0.35)');
    c.fillStyle = vg; c.fillRect(0, 0, VW, VH);

    // interact prompt
    if (this.nearInteract && this.state === 'playing' && !p.dead) {
      const o = this.nearInteract;
      const ox = (o.type === 'npc' || o.type === 'portal' || o.type === 'shrine' ? o.x : o.x) - cam.x;
      const oy = (o.y - (o.type === 'npc' ? 96 : 46)) - cam.y;
      const pulse = 0.8 + Math.sin(t * 5) * 0.2;
      c.fillStyle = `rgba(20,12,6,${0.8 * pulse})`;
      c.strokeStyle = PAL.gold; c.lineWidth = 2;
      const label = Input.touchActive ? 'USE' : 'F';
      c.beginPath(); c.roundRect(ox - 26, oy - 30, 52, 26, 8); c.fill(); c.stroke();
      c.fillStyle = PAL.gold; c.font = 'bold 15px Georgia'; c.textAlign = 'center';
      c.fillText(label, ox, oy - 12);
    }
    // sign text (near signs)
    for (const s of lvl.signs) {
      const d = Math.abs(p.cx - s.x);
      if (d < 150) {
        const a = clamp(1.4 - d / 150, 0, 1);
        c.save(); c.globalAlpha = a;
        c.font = 'italic 15px Georgia'; c.textAlign = 'center';
        const tw = c.measureText(s.text).width;
        const bx = s.x - cam.x, by = s.y - cam.y - 58;
        c.fillStyle = 'rgba(20,12,6,0.85)';
        c.beginPath(); c.roundRect(bx - tw / 2 - 12, by - 18, tw + 24, 26, 6); c.fill();
        c.strokeStyle = 'rgba(242,193,78,0.6)'; c.lineWidth = 1; c.stroke();
        c.fillStyle = '#f3e5c0'; c.fillText(s.text, bx, by);
        c.restore();
      }
    }
    // toast (tool pickup etc.)
    if (this.toastT > 0 && this.toast) {
      c.save();
      c.globalAlpha = clamp(this.toastT, 0, 1);
      c.font = 'bold 19px Georgia'; c.textAlign = 'center';
      const tw = c.measureText(this.toast.text).width;
      c.fillStyle = 'rgba(20,12,6,0.88)';
      c.beginPath(); c.roundRect(VW / 2 - tw / 2 - 22, 96, tw + 44, 40, 10); c.fill();
      c.strokeStyle = PAL.gold; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#ffe9a8'; c.fillText(this.toast.text, VW / 2, 122);
      c.restore();
    }
    // boss HP bar
    if (lvl.boss && !lvl.boss.dead && lvl.boss.introduced) {
      const bo = lvl.boss;
      const bw = 460, bx = VW / 2 - bw / 2, by = 84;
      c.fillStyle = 'rgba(15,8,4,0.75)';
      c.beginPath(); c.roundRect(bx - 6, by - 6, bw + 12, 26, 8); c.fill();
      c.fillStyle = '#3a2418'; c.fillRect(bx, by, bw, 14);
      const hpk = clamp(bo.hp / bo.maxHp, 0, 1);
      const hg = c.createLinearGradient(bx, 0, bx + bw, 0);
      hg.addColorStop(0, '#c0392b'); hg.addColorStop(1, '#e8a13a');
      c.fillStyle = hg; c.fillRect(bx, by, bw * hpk, 14);
      c.strokeStyle = PAL.gold; c.lineWidth = 1.5; c.strokeRect(bx, by, bw, 14);
      c.fillStyle = '#f3e5c0'; c.font = 'bold 13px Georgia'; c.textAlign = 'center';
      c.fillText(bo.meta.name + ' — ' + bo.meta.title, VW / 2, by - 10);
    }
    // touch controls
    if (Input.touchActive && this.state === 'playing') this.renderTouchUI(c);
  },

  renderTouchUI(c) {
    const t = this.time;
    // joystick
    const j = Input.touch.joy;
    if (j.active) {
      c.strokeStyle = 'rgba(243,229,192,0.35)'; c.lineWidth = 3;
      c.beginPath(); c.arc(j.cx, j.cy, 70, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(243,229,192,0.3)';
      c.beginPath(); c.arc(j.cx + j.dx * 52, j.cy + j.dy * 52, 30, 0, Math.PI * 2); c.fill();
    } else {
      c.strokeStyle = 'rgba(243,229,192,0.2)'; c.lineWidth = 3;
      c.beginPath(); c.arc(150, 600, 70, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(243,229,192,0.12)';
      c.beginPath(); c.arc(150, 600, 30, 0, Math.PI * 2); c.fill();
    }
    // buttons
    for (const b of Input.touch.buttons) {
      if (b.dynamic && !this.nearInteract) continue;
      const held = Input.actionHeld(b.action);
      c.save();
      c.globalAlpha = held ? 0.85 : 0.5;
      c.fillStyle = held ? '#f2c14e' : 'rgba(20,12,6,0.7)';
      c.strokeStyle = 'rgba(242,193,78,0.8)'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = held ? '#2a1a12' : '#f3e5c0';
      c.font = 'bold 12px Georgia'; c.textAlign = 'center';
      c.fillText(b.label, b.x, b.y + 4);
      c.restore();
    }
  },

  renderHUD(c) {
    const p = this.player, lvl = this.level;
    // hearts
    const hx = 26, hy = 30;
    for (let i = 0; i < p.maxHealth; i++) {
      const full = i < p.health;
      this.drawHeart(c, hx + i * 34, hy, 13, full ? '#e8503f' : 'rgba(60,40,30,0.55)', full);
    }
    // shield hearts (temporary blessings)
    for (let i = 0; i < p.shield; i++) this.drawHeart(c, hx + (p.maxHealth + i) * 34, hy, 11, '#ffe9a8', true);
    // stamina
    const sw = 170, sx2 = 26, sy2 = 52;
    c.fillStyle = 'rgba(15,8,4,0.7)';
    c.beginPath(); c.roundRect(sx2 - 3, sy2 - 3, sw + 6, 14, 6); c.fill();
    c.fillStyle = '#3a2a18'; c.fillRect(sx2, sy2, sw, 8);
    const sg = c.createLinearGradient(sx2, 0, sx2 + sw, 0);
    sg.addColorStop(0, '#4f9d5d'); sg.addColorStop(1, '#a8d26a');
    c.fillStyle = sg;
    c.fillRect(sx2, sy2, sw * clamp(p.stamina / p.maxStamina, 0, 1), 8);
    c.strokeStyle = 'rgba(242,193,78,0.5)'; c.lineWidth = 1; c.strokeRect(sx2, sy2, sw, 8);
    // tool icons top-right
    const tools = [['axe', p.hasAxe, 'J'], ['noose', p.hasNoose, 'K'], ['trunk', p.hasTrunk, 'E']];
    tools.forEach((tt, i) => {
      const x = VW - 150 + i * 44, y = 40;
      c.save();
      c.globalAlpha = tt[1] ? 1 : 0.22;
      c.fillStyle = 'rgba(20,12,6,0.75)';
      c.beginPath(); c.arc(x, y, 18, 0, Math.PI * 2); c.fill();
      c.strokeStyle = tt[1] ? PAL.gold : 'rgba(120,100,80,0.6)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = tt[1] ? '#ffe9a8' : '#8a7a68';
      c.font = 'bold 13px Georgia'; c.textAlign = 'center';
      c.fillText(tt[2], x, y + 4);
      c.restore();
    });
    // modak & flower counters
    c.save();
    const pop = 1 + this.modakPop * 0.25;
    c.translate(VW - 44, 96); c.scale(pop, pop);
    Art.drawModak(c, 0, 0, this.time);
    c.restore();
    c.fillStyle = '#f3e5c0'; c.font = 'bold 17px Georgia'; c.textAlign = 'left';
    c.fillText(String(this.save.modaks), VW - 28, 102);
    c.save();
    const pop2 = 1 + this.flowerPop * 0.25;
    c.translate(VW - 44, 130); c.scale(pop2, pop2);
    Art.drawFlower(c, 0, 0, this.time);
    c.restore();
    c.fillStyle = '#f3e5c0'; c.font = 'bold 17px Georgia';
    c.fillText(String(this.save.flowers), VW - 28, 136);
    // level name (small, fading after start)
    if (this.state === 'playing' && this.levelTime < 4 && lvl.id !== 0) {
      c.save();
      c.globalAlpha = clamp(4 - this.levelTime, 0, 1);
      c.fillStyle = '#f3e5c0'; c.font = '16px Georgia'; c.textAlign = 'center';
      c.fillText(lvl.name + '  ·  ' + fmtTime(this.levelTime), VW / 2, 30);
      c.restore();
    } else if (lvl.id !== 0 && this.state === 'playing') {
      c.fillStyle = 'rgba(243,229,192,0.75)'; c.font = '14px Georgia'; c.textAlign = 'center';
      c.fillText(fmtTime(this.levelTime), VW / 2, 26);
    }
    // pause hint
    if (this.state === 'playing' && !Input.touchActive) {
      c.fillStyle = 'rgba(243,229,192,0.45)'; c.font = '12px Georgia'; c.textAlign = 'right';
      c.fillText('ESC — pause', VW - 20, VH - 16);
    }
    // death fade
    if (p.dead) {
      c.fillStyle = `rgba(20,8,4,${clamp(this.deathT / 1.6, 0, 0.85)})`;
      c.fillRect(0, 0, VW, VH);
      c.fillStyle = '#f3e5c0'; c.font = 'italic 22px Georgia'; c.textAlign = 'center';
      c.globalAlpha = clamp(this.deathT, 0, 1);
      c.fillText('Every fall teaches the path. Rising again...', VW / 2, VH / 2);
      c.globalAlpha = 1;
    }
  },
  drawHeart(c, x, y, r, color, full) {
    c.save();
    c.translate(x, y);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(0, r * 0.9);
    c.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.7, -r * 1.1, 0, -r * 0.4);
    c.bezierCurveTo(r * 0.7, -r * 1.1, r * 1.3, -r * 0.1, 0, r * 0.9);
    c.fill();
    if (full) { c.strokeStyle = 'rgba(255,240,200,0.7)'; c.lineWidth = 1.5; c.stroke(); }
    c.restore();
  },

  renderIntro(c) {
    const lvl = this.level;
    c.fillStyle = `rgba(12,7,3,${clamp(1.4 - Math.abs(this.introT - 1.3) * 1.2, 0, 0.82)})`;
    c.fillRect(0, 0, VW, VH);
    c.textAlign = 'center';
    c.fillStyle = PAL.gold;
    c.font = 'bold 15px Georgia';
    c.fillText(lvl.id === 0 ? 'THE JOURNEY BEGINS' : 'LEVEL ' + lvl.id, VW / 2, VH / 2 - 58);
    c.fillStyle = '#f7e9c8';
    c.font = 'bold 44px Georgia';
    c.fillText(lvl.name.toUpperCase(), VW / 2, VH / 2 - 14);
    c.fillStyle = '#d9c8a8'; c.font = 'italic 19px Georgia';
    c.fillText(lvl.subtitle, VW / 2, VH / 2 + 20);
    c.fillStyle = PAL.gold; c.font = '15px Georgia';
    c.fillText('❖ ' + lvl.quest + ' ❖', VW / 2, VH / 2 + 56);
    if (this.introT > 1.4) {
      c.fillStyle = 'rgba(243,229,192,0.55)'; c.font = '13px Georgia';
      c.fillText(Input.touchActive ? 'tap to begin' : 'press any key', VW / 2, VH / 2 + 92);
    }
  },

  renderDialog(c) {
    const d = this.dialog;
    if (!d) return;
    const y0 = VH - 150;
    c.fillStyle = 'rgba(18,10,5,0.92)';
    c.beginPath(); c.roundRect(140, y0, VW - 280, 116, 14); c.fill();
    c.strokeStyle = PAL.gold; c.lineWidth = 2; c.stroke();
    // name tab
    c.fillStyle = PAL.gold;
    c.beginPath(); c.roundRect(160, y0 - 16, Math.max(120, c.measureText(d.npc.name).width + 60), 30, 8); c.fill();
    c.fillStyle = '#2a1a12'; c.font = 'bold 16px Georgia'; c.textAlign = 'left';
    c.fillText(d.npc.name, 180, y0 + 5);
    // text (typewriter)
    const line = d.npc.lines[d.idx] || '';
    const shown = line.slice(0, Math.floor(d.chars));
    c.fillStyle = '#f3e5c0'; c.font = 'italic 19px Georgia';
    c.fillText('“' + shown + (d.chars < line.length ? '' : '”'), 176, y0 + 52);
    if (d.chars >= line.length) {
      c.fillStyle = 'rgba(242,193,78,0.8)'; c.font = '13px Georgia'; c.textAlign = 'right';
      c.fillText(Input.touchActive ? 'tap ▸' : (d.idx < d.npc.lines.length - 1 ? 'F ▸ next' : 'F ▸ accept blessing'), VW - 166, y0 + 96);
    }
  },

  renderBlessing(c) {
    c.fillStyle = 'rgba(12,7,3,0.72)'; c.fillRect(0, 0, VW, VH);
    c.textAlign = 'center';
    c.fillStyle = PAL.gold; c.font = 'bold 22px Georgia';
    c.fillText('THE VILLAGER OFFERS A BLESSING', VW / 2, VH / 2 - 90);
    c.fillStyle = '#d9c8a8'; c.font = 'italic 15px Georgia';
    c.fillText('choose how their gratitude flows through you', VW / 2, VH / 2 - 62);
    const opts = [
      { t: '+1 BLESSING SHIELD', s: 'absorbs one hit' },
      { t: '+20 MAX STAMINA', s: 'more trunk, more noose' },
    ];
    opts.forEach((o, i) => {
      const x = VW / 2 + (i === 0 ? -180 : 180), y = VH / 2 + 16;
      const sel = this.blessIdx === i;
      c.fillStyle = sel ? 'rgba(242,193,78,0.2)' : 'rgba(20,12,6,0.8)';
      c.strokeStyle = sel ? PAL.gold : 'rgba(150,120,80,0.5)';
      c.lineWidth = sel ? 3 : 1.5;
      c.beginPath(); c.roundRect(x - 150, y - 56, 300, 112, 14); c.fill(); c.stroke();
      c.fillStyle = sel ? '#ffe9a8' : '#d9c8a8';
      c.font = 'bold 19px Georgia';
      c.fillText(o.t, x, y - 8);
      c.font = 'italic 14px Georgia';
      c.fillStyle = sel ? '#e8d8b0' : '#a89878';
      c.fillText(o.s, x, y + 20);
    });
  },

  renderShop(c) {
    const rows = this.shop.rows;
    c.fillStyle = 'rgba(12,7,3,0.85)'; c.fillRect(0, 0, VW, VH);
    c.textAlign = 'center';
    c.fillStyle = PAL.gold; c.font = 'bold 26px Georgia';
    c.fillText(' shrine of blessings ', VW / 2, 96);
    c.fillStyle = '#d9c8a8'; c.font = 'italic 14px Georgia';
    c.fillText('offer modaks & flowers — grow stronger for the village', VW / 2, 122);
    // currencies
    Art.drawModak(c, VW / 2 - 90, 150, this.time);
    c.fillStyle = '#f3e5c0'; c.font = 'bold 16px Georgia'; c.textAlign = 'left';
    c.fillText(String(this.save.modaks), VW / 2 - 76, 156);
    Art.drawFlower(c, VW / 2 + 10, 150, this.time);
    c.fillStyle = '#f3e5c0';
    c.fillText(String(this.save.flowers), VW / 2 + 24, 156);
    rows.forEach((r, i) => {
      const y = 196 + i * 74;
      const sel = this.shopIdx === i;
      const maxed = r.lvl >= r.max;
      const afford = this.save[r.cur] >= r.cost;
      c.fillStyle = sel ? 'rgba(242,193,78,0.16)' : 'rgba(24,14,8,0.9)';
      c.strokeStyle = sel ? PAL.gold : 'rgba(120,95,60,0.5)';
      c.lineWidth = sel ? 2.5 : 1.2;
      c.beginPath(); c.roundRect(VW / 2 - 330, y, 660, 64, 12); c.fill(); c.stroke();
      c.textAlign = 'left';
      c.fillStyle = maxed ? '#8a7a68' : '#f3e5c0';
      c.font = 'bold 17px Georgia';
      c.fillText(r.name, VW / 2 - 310, y + 27);
      c.fillStyle = '#a89878'; c.font = '13px Georgia';
      c.fillText(r.desc + (r.max > 1 ? `  (${r.lvl}/${r.max})` : ''), VW / 2 - 310, y + 48);
      // pips
      for (let k = 0; k < r.max; k++) {
        c.fillStyle = k < r.lvl ? PAL.gold : 'rgba(90,70,50,0.6)';
        c.beginPath(); c.arc(VW / 2 - 40 + k * 18, y + 32, 5, 0, Math.PI * 2); c.fill();
      }
      c.textAlign = 'right';
      if (maxed) {
        c.fillStyle = PAL.gold; c.font = 'bold 15px Georgia';
        c.fillText('✓ BLESSED', VW / 2 + 310, y + 37);
      } else {
        c.fillStyle = afford ? '#ffe9a8' : '#a05a4a';
        c.font = 'bold 16px Georgia';
        c.fillText(r.cost + (r.cur === 'modaks' ? ' ◈' : ' ✿'), VW / 2 + 310, y + 37);
      }
    });
    c.textAlign = 'center';
    c.fillStyle = 'rgba(243,229,192,0.5)'; c.font = '13px Georgia';
    c.fillText((Input.touchActive ? 'tap an upgrade — tap below to close' : '↑↓ choose · F buy · Esc close'), VW / 2, VH - 34);
  },

  renderPaused(c) {
    c.fillStyle = 'rgba(12,7,3,0.78)'; c.fillRect(0, 0, VW, VH);
    c.textAlign = 'center';
    c.fillStyle = '#f7e9c8'; c.font = 'bold 34px Georgia';
    c.fillText('PAUSED', VW / 2, 150);
    c.fillStyle = PAL.gold; c.font = 'italic 14px Georgia';
    c.fillText('“Whatever you begin by visualizing, you can complete.” — remove one obstacle at a time', VW / 2, 180);
    const opts = ['Resume', 'Restart Level', 'Controls', 'Sound: ' + (Audio2.muted ? 'OFF' : 'ON'), 'Return to Shrine Hub'];
    opts.forEach((o, i) => {
      const y = VH / 2 - 60 + i * 52;
      const sel = this.pauseIdx === i;
      if (sel) {
        c.fillStyle = 'rgba(242,193,78,0.15)';
        c.beginPath(); c.roundRect(VW / 2 - 170, y - 26, 340, 44, 10); c.fill();
      }
      c.fillStyle = sel ? '#ffe9a8' : '#cbb890';
      c.font = sel ? 'bold 20px Georgia' : '18px Georgia';
      c.fillText((sel ? '❖ ' : '') + o + (sel ? ' ❖' : ''), VW / 2, y);
    });
  },

  renderCard(c) {
    const k = clamp(this.card.t * 2.4, 0, 1);
    c.fillStyle = `rgba(12,7,3,${0.55 * k})`; c.fillRect(0, 0, VW, VH);
    c.save();
    c.translate(VW / 2, VH / 2 - 40);
    c.scale(0.8 + k * 0.2, 0.8 + k * 0.2);
    c.globalAlpha = k;
    c.textAlign = 'center';
    c.strokeStyle = PAL.gold; c.lineWidth = 3;
    c.beginPath(); c.roundRect(-320, -70, 640, 140, 16); c.stroke();
    c.fillStyle = 'rgba(18,10,5,0.9)'; c.fill();
    c.fillStyle = PAL.gold; c.font = 'bold 34px Georgia';
    c.fillText(this.card.big, 0, -8);
    c.fillStyle = '#d9c8a8'; c.font = 'italic 16px Georgia';
    c.fillText(this.card.sub, 0, 34);
    c.restore();
  },

  renderBossCard(c) {
    const k = clamp((2.6 - this.bossCard) * 2, 0, 1) * clamp(this.bossCard, 0, 1);
    const bo = this.level.boss;
    c.save();
    c.globalAlpha = k;
    c.textAlign = 'center';
    c.fillStyle = 'rgba(120,20,20,0.35)';
    c.fillRect(0, VH / 2 - 90, VW, 130);
    c.fillStyle = '#ffb0a0'; c.font = 'bold 15px Georgia';
    c.fillText('— INNER DEMON —', VW / 2, VH / 2 - 52);
    c.fillStyle = '#fff'; c.font = 'bold 42px Georgia';
    c.fillText(bo.meta.name, VW / 2, VH / 2 - 10);
    c.fillStyle = '#ffd8b0'; c.font = 'italic 17px Georgia';
    c.fillText(bo.meta.title, VW / 2, VH / 2 + 22);
    c.restore();
  },

  renderVictory(c) {
    // sky + gopuram scene
    const g = c.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#2c1a3a'); g.addColorStop(0.55, '#7a4a3a'); g.addColorStop(1, '#e8a050');
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    Art.drawGopuram(c, VW / 2, VH, 420, 560, 0.9);
    // petals
    for (let i = 0; i < 40; i++) {
      const px = (Art.hash(i, 3) * VW + this.endT * (12 + Art.hash(i, 5) * 30)) % VW;
      const py = (Art.hash(i, 7) * VH + this.endT * (24 + Art.hash(i, 9) * 40)) % VH;
      c.save(); c.translate(px, py); c.rotate(this.endT * 2 + i);
      c.fillStyle = chance(0.5) ? '#ffb84e' : '#ff8a5c';
      c.globalAlpha = 0.7;
      c.beginPath(); c.ellipse(0, 0, 5, 2.4, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    c.textAlign = 'center';
    c.fillStyle = 'rgba(12,7,3,0.55)'; c.fillRect(0, VH / 2 - 150, VW, 300);
    c.fillStyle = PAL.gold; c.font = 'bold 40px Georgia';
    c.fillText('THE PATH IS CLEAR', VW / 2, VH / 2 - 70);
    c.fillStyle = '#f7e9c8'; c.font = 'italic 20px Georgia';
    c.fillText('“Every obstacle you removed was first a weight you carried.”', VW / 2, VH / 2 - 18);
    c.fillStyle = '#d9c8a8'; c.font = '16px Georgia';
    const rescues = Object.keys(this.save.rescues).length;
    c.fillText(`All five demons calmed · ${rescues} devotees blessed · ${this.save.modaks} modaks · ${this.save.flowers} flowers`, VW / 2, VH / 2 + 22);
    c.fillStyle = '#ffe9a8'; c.font = 'bold 16px Georgia';
    c.fillText('விக்னம் நீங்கியது — the obstacle is removed', VW / 2, VH / 2 + 62);
    if (this.endT > 1) {
      c.fillStyle = 'rgba(243,229,192,0.6)'; c.font = '14px Georgia';
      c.fillText(Input.touchActive ? 'tap to return to the shrine' : 'press ENTER — return to the shrine hub', VW / 2, VH / 2 + 110);
    }
  },

  renderTitle(c) {
    const t = this.titleT;
    // painted dusk sky
    const g = c.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, '#241224'); g.addColorStop(0.5, '#5a2e28'); g.addColorStop(0.85, '#b06a34'); g.addColorStop(1, '#e09a4e');
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    // sun
    const sg = c.createRadialGradient(VW / 2, 480, 20, VW / 2, 480, 300);
    sg.addColorStop(0, 'rgba(255,220,150,0.9)'); sg.addColorStop(1, 'rgba(255,180,90,0)');
    c.fillStyle = sg; c.beginPath(); c.arc(VW / 2, 480, 300, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffe9b0'; c.beginPath(); c.arc(VW / 2, 480, 64, 0, Math.PI * 2); c.fill();
    // gopurams
    Art.drawGopuram(c, VW / 2 - 420, VH, 200, 460, 0.85);
    Art.drawGopuram(c, VW / 2 + 430, VH, 170, 380, 0.85);
    Art.drawGopuram(c, VW / 2, VH + 40, 300, 300, 0.95);
    // ground
    c.fillStyle = '#2a180e'; c.fillRect(0, VH - 90, VW, 90);
    // ganesha silhouette standing center-left
    c.save();
    c.translate(VW / 2 - 330, VH - 96);
    c.scale(1.6, 1.6);
    Art.drawGanesha(c, 0, 0, { dir: 1, idle: true, trunkWave: Math.sin(t * 2) * 0.8, axeAng: -0.9 }, t, true);
    c.restore();
    // petals
    for (let i = 0; i < 26; i++) {
      const px = (Art.hash(i, 2) * VW + t * (16 + Art.hash(i, 4) * 26)) % VW;
      const py = (Art.hash(i, 6) * VH + t * (28 + Art.hash(i, 8) * 36)) % VH;
      c.save(); c.translate(px, py); c.rotate(t * 1.6 + i);
      c.fillStyle = i % 2 ? '#ffb84e' : '#ff9933';
      c.globalAlpha = 0.5;
      c.beginPath(); c.ellipse(0, 0, 5, 2.2, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // title
    c.textAlign = 'center';
    const ty = 180 + Math.sin(t * 1.4) * 5;
    c.fillStyle = 'rgba(20,10,5,0.45)';
    c.beginPath(); c.roundRect(VW / 2 - 400, ty - 92, 800, 190, 22); c.fill();
    c.strokeStyle = 'rgba(242,193,78,0.85)'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#f7e9c8'; c.font = 'bold 30px Georgia';
    c.fillText('विघ्नहर्ता', VW / 2, ty - 40);
    c.fillStyle = PAL.gold;
    c.font = 'bold 64px Georgia';
    c.fillText('VIGHNAHARTA', VW / 2, ty + 26);
    c.fillStyle = '#e8d0a8'; c.font = 'italic 19px Georgia';
    c.fillText('— Remover of Obstacles —', VW / 2, ty + 62);
    // prompt
    if (Math.sin(t * 3) > -0.3) {
      c.fillStyle = '#ffe9a8'; c.font = 'bold 19px Georgia';
      c.fillText(Input.touchActive ? '— tap to begin the journey —' : '— press ENTER to begin the journey —', VW / 2, VH - 150);
    }
    c.fillStyle = 'rgba(243,229,192,0.55)'; c.font = '13px Georgia';
    c.fillText(Input.touchActive ? 'joystick to move · buttons for axe, noose & trunk' : 'A/D move · SPACE jump ×2 · SHIFT dash · J axe · K noose · E trunk · F interact · ESC controls', VW / 2, VH - 52);
    c.fillStyle = 'rgba(243,229,192,0.35)'; c.font = '12px Georgia';
    c.fillText('a mythological action-platformer · Ganesha clears the village of ego, greed, anger, attachment & ignorance', VW / 2, VH - 28);
  },

  renderControls(c) {
    c.fillStyle = '#1a0f08'; c.fillRect(0, 0, VW, VH);
    // subtle mandala backdrop
    c.save();
    c.translate(VW / 2, VH / 2); c.globalAlpha = 0.06;
    for (let r = 60; r < 380; r += 60) {
      c.strokeStyle = PAL.gold; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    c.textAlign = 'center';
    c.fillStyle = PAL.gold; c.font = 'bold 34px Georgia';
    c.fillText('CONTROLS', VW / 2, 110);
    const rows = [
      ['Move', 'A / D  or  ← →', 'left joystick'],
      ['Jump (double)', 'SPACE (press twice)', 'JUMP button'],
      ['Dash', 'SHIFT', 'DASH button'],
      ['Axe — slash / HOLD to charge', 'J  or  Left Click', 'AXE button'],
      ['Noose — throw / HOLD to pull', 'K  or  Right Click', 'NOOSE button'],
      ['Trunk — blast / HOLD to bless', 'E  or  L', 'TRUNK button'],
      ['Trunk slam (in air)', 'E + ↓', 'TRUNK + joystick down'],
      ['Interact / talk / buy', 'F', 'USE button'],
      ['Swing release', 'SPACE while hanging', 'JUMP while hanging'],
      ['Pause', 'ESC', 'tap top-left ✥'],
    ];
    c.font = '17px Georgia';
    rows.forEach((r, i) => {
      const y = 160 + i * 44;
      c.textAlign = 'right'; c.fillStyle = '#f3e5c0';
      c.fillText(r[0], VW / 2 - 40, y);
      c.textAlign = 'left';
      c.fillStyle = PAL.gold; c.font = 'bold 17px Georgia';
      c.fillText(r[1], VW / 2 + 10, y);
      c.fillStyle = 'rgba(201,160,220,0.85)'; c.font = '14px Georgia';
      c.fillText(r[2], VW / 2 + 240, y);
      c.font = '17px Georgia';
    });
    c.textAlign = 'center';
    c.fillStyle = 'rgba(243,229,192,0.6)'; c.font = 'italic 14px Georgia';
    c.fillText('hold the noose to reel · hold the trunk to breathe blessings away · hold the axe to shatter stone', VW / 2, VH - 60);
    c.fillStyle = 'rgba(243,229,192,0.5)'; c.font = '13px Georgia';
    c.fillText(Input.touchActive ? 'tap to return' : 'press ESC / ENTER to return', VW / 2, VH - 30);
  },
};

// ============ BOOT ============
Game.init();
