"use strict";
// ============================================================
// VIGHNAHARTA — bosses.js
// Player (Vighnaharta) + BossBase FSM + the five inner demons.
// ============================================================

// ============================================================
// PLAYER
// ============================================================
class Player {
  constructor(x, y) {
    this.body = { x: x - 16, y: y - 76, w: 32, h: 76, vx: 0, vy: 0, onGround: false, hitWall: false, hitCeil: false };
    this.facing = 1;
    this.maxHealth = 3 + Save.data.up.heart;
    this.health = this.maxHealth;
    this.shield = 0;
    this.maxStamina = 100 + Save.data.up.stamina * 25;
    this.stamina = this.maxStamina;
    this.hasAxe = false; this.hasNoose = false; this.hasTrunk = false;
    this.nooseRange = 300 + Save.data.up.noose * 80;
    // timers
    this.coyote = 0; this.jumpBuf = 0; this.canDouble = true;
    this.dashing = false; this.dashT = 0; this.dashCd = 0;
    this.hurtT = 0; this.dead = false; this.deathT = 0;
    this.landSquash = 0;
    // axe
    this.axeSwingT = 0; this.axeDur = 0; this.axeCombo = 0; this.axeComboWin = 0;
    this.axeCharging = false; this.chargeT = 0; this.chargedSwing = false;
    this.axeHitSet = null; this.axeHitDone = false;
    // noose
    this.nooseState = 'ready'; // ready|fly|latched
    this.nooseTarget = null; this.nooseLen = 0; this.nooseExt = 0;
    this.nooseAng = 0; this.nooseDir = { x: 1, y: 0 };
    this.swingThV = 0; this.swingPull = 0; this.pullProg = 0; this.missT = 0;
    // trunk
    this.trunkT = 0; this.breathCharge = 0; this.breathReady = true;
    this.slamming = false; this.slamDone = false;
    // cosmetic
    this.stepT = 0; this.runPhase = 0; this.wasOnGround = true;
    this.trail = [];
    this.aura = Save.data.up.aura > 0;
  }
  get cx() { return this.body.x + this.body.w / 2; }
  get cy() { return this.body.y + this.body.h / 2; }
  get trunkCost() { return Math.round(12 * (1 - Save.data.up.trunk * 0.3)); }
  restoreStamina(n) { this.stamina = clamp(this.stamina + n, 0, this.maxStamina); }

  aimAngle() {
    // mid-swing/trunk: lock aim to facing for stable hit direction
    if (this.axeSwingT > 0 || this.trunkT > 0) {
      return Math.atan2(0, this.facing);
    }
    // touch: aim stick or facing; mouse: toward cursor; keys: W/S modify
    const mx = Input.mouse.worldX, my = Input.mouse.worldY;
    if (Input.mouse.usingMouse && !Input.touchActive) {
      return Math.atan2(my - this.cy, mx - this.cx);
    }
    let ax = this.facing, ay = 0;
    if (Input.actionHeld('up')) { ay = -1; }
    else if (Input.actionHeld('down')) { ay = this.body.onGround ? 0 : 1; }
    const t = Input.touchAxis();
    if (Input.touchActive && (Math.abs(t.y) > 0.5)) ay = Math.sign(t.y);
    return Math.atan2(ay * 0.85, ax);
  }

  update(dt, solids) {
    const b = this.body;
    if (this.dead) { this.deathT += dt; return; }
    // timers
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.landSquash = Math.max(0, this.landSquash - dt * 4);
    this.axeComboWin = Math.max(0, this.axeComboWin - dt);
    if (this.axeComboWin <= 0) this.axeCombo = 0;
    this.trunkT = Math.max(0, this.trunkT - dt);
    if (this.missT > 0) { this.missT -= dt; if (this.missT <= 0 && this.nooseState === 'fly') this.nooseState = 'ready'; }

    const left = Input.actionHeld('left'), right = Input.actionHeld('right');
    const tAxis = Input.touchAxis();
    const axis = clamp((right ? 1 : 0) - (left ? 1 : 0) + (Input.touchActive ? tAxis.x : 0), -1, 1);

    // ---------- DASH ----------
    if (Input.actionPressed('dash') && this.dashCd <= 0 && !this.dashing) {
      this.dashing = true; this.dashT = 0.16; this.dashCd = 0.55;
      b.vx = (axis !== 0 ? Math.sign(axis) : this.facing) * 720;
      b.vy = 0;
      Audio2.play('dash');
      Particles.burst(this.cx, this.cy, 8, { color: '#ffe9a8', spMax: 120, life: 0.3, g: 0 });
      if (this.attachedBy) this.shedAttachment();
    }
    if (this.dashing) {
      this.dashT -= dt;
      if (this.dashT <= 0) this.dashing = false;
      this.trail.push({ x: this.cx, y: this.cy, t: 0.25, f: this.facing });
    }

    // ---------- HORIZONTAL ----------
    if (!this.dashing && this.nooseState !== 'latched') {
      const target = axis * 300 * (this.axeCharging ? 0.45 : 1) * this.attachmentSlow();
      const accel = b.onGround ? 2600 : 1700;
      if (axis !== 0) {
        this.facing = Math.sign(axis);
        b.vx = approach(b.vx, target, accel * dt);
      } else {
        b.vx = approach(b.vx, 0, (b.onGround ? 3200 : 900) * dt);
      }
    }

    // ---------- GRAVITY / WALL ----------
    const solidsHere = solids;
    const wallDir = this.wallTouchDir(solidsHere);
    if (!this.dashing && this.nooseState !== 'latched') {
      const g = b.vy > 0 ? 2100 : 1500;
      b.vy = Math.min(b.vy + g * dt, 950);
      // wall slide
      if (!b.onGround && wallDir !== 0 && b.vy > 0 && axis === wallDir) {
        b.vy = Math.min(b.vy, 130);
        this.canDouble = true;
        if (chance(dt * 20)) Particles.spawn(this.cx + wallDir * 14, this.cy + 20, { color: '#c9b493', vy: -30, vx: -wallDir * 20, life: 0.3, size: 2.5 });
      }
    }

    // ---------- JUMP ----------
    this.coyote = b.onGround ? 0.12 : Math.max(0, this.coyote - dt);
    if (b.onGround) this.canDouble = true;
    if (Input.actionPressed('jump')) this.jumpBuf = 0.14;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.jumpBuf > 0 && this.nooseState !== 'latched' && !this.dashing) {
      if (this.coyote > 0) { this.doJump(-560); Audio2.play('jump'); }
      else if (wallDir !== 0 && !b.onGround) { // wall jump
        this.doJump(-540);
        b.vx = -wallDir * 330;
        this.facing = -wallDir;
        Audio2.play('djump');
        Particles.burst(this.cx + wallDir * 12, this.cy, 6, { color: '#e8dcc0', spMax: 100, g: 0, life: 0.3 });
      }
      else if (this.canDouble) {
        this.doJump(-500); this.canDouble = false;
        Audio2.play('djump');
        Particles.ring(this.cx, b.y + b.h, '#ffe9a8');
      }
    }
    if (Input.actionReleased('jump') && b.vy < 0) b.vy *= 0.45;

    // ---------- SWING (noose latched to ring) ----------
    if (this.nooseState === 'latched' && this.nooseTarget && this.nooseTarget.type === 'ring') {
      const r = this.nooseTarget;
      const len = Math.max(60, this.nooseLen - this.swingPull);
      // pendulum: angle from anchor
      let dx = this.cx - r.x, dy = this.cy - r.y;
      let ang = Math.atan2(dx, dy); // 0 = straight down
      const gh = 1500;
      this.swingThV += (-(gh / len) * Math.sin(ang)) * dt;
      this.swingThV *= Math.pow(0.995, dt * 60);
      // pump with movement keys
      const pump = axis !== 0 ? Math.sign(axis) : 0;
      if (pump !== 0) this.swingThV += pump * 1.6 * dt * (Math.cos(ang) > 0 ? 1 : 0.4);
      if (Input.actionHeld('noose')) this.swingPull = Math.min(this.swingPull + 300 * dt, this.nooseLen - 70);
      else this.swingPull = Math.max(0, this.swingPull - 260 * dt);
      ang += this.swingThV * dt;
      const nx2 = r.x + Math.sin(ang) * len, ny2 = r.y + Math.cos(ang) * len;
      b.vx = (nx2 - this.cx) / dt; b.vy = (ny2 - this.cy) / dt;
      // release
      if (Input.actionPressed('jump') || Input.actionReleased('noose')) {
        this.detachNoose();
        b.vy = Math.min(b.vy, 0) - 330; // release boost
        b.vx = clamp(b.vx, -620, 620);
        Audio2.play('djump');
      }
      // safety: auto release if below anchor + 500
      if (this.cy > r.y + 620) this.detachNoose();
    }

    // ---------- MOVE & COLLIDE ----------
    const wasGround = b.onGround;
    moveBody(b, solidsHere, dt);
    if (b.onGround && !wasGround) {
      if (!this.wasOnGround) Audio2.play('land');
      this.landSquash = 1;
      if (this.slamming && !this.slamDone) this.doSlamImpact();
    }
    this.wasOnGround = b.onGround;
    // run particles
    if (b.onGround && Math.abs(b.vx) > 60) {
      this.runPhase += Math.abs(b.vx) * dt * 0.05;
      this.stepT -= dt;
      if (this.stepT <= 0) { this.stepT = 0.26; Audio2.play('step'); }
    }

    // ---------- TOOLS ----------
    this.updateAxe(dt, solidsHere);
    this.updateNoose(dt, solidsHere);
    this.updateTrunk(dt, solidsHere);

    // stamina regen
    const usingSpecial = this.axeCharging || this.nooseState !== 'ready' || this.breathCharge > 0;
    if (!usingSpecial) this.stamina = clamp(this.stamina + 26 * dt, 0, this.maxStamina);

    // dash trail decay
    for (let i = this.trail.length - 1; i >= 0; i--) { this.trail[i].t -= dt; if (this.trail[i].t <= 0) this.trail.splice(i, 1); }
  }
  // attachment cling: halves run speed while carried
  attachmentSlow() { return this.attachedBy ? 0.5 : 1; }

  doJump(v) { this.body.vy = v; this.jumpBuf = 0; this.coyote = 0; this.landSquash = -0.8; }
  wallTouchDir(solids) {
    const b = this.body;
    const l = { x: b.x - 3, y: b.y + 8, w: 3, h: b.h - 16 };
    const r = { x: b.x + b.w, y: b.y + 8, w: 3, h: b.h - 16 };
    for (const s of solids) {
      if (s.active === false) continue;
      if (rectsOverlap(l, s)) return -1;
      if (rectsOverlap(r, s)) return 1;
    }
    return 0;
  }

  // ================= AXE =================
  updateAxe(dt, solids) {
    const b = this.body;
    if (!this.hasAxe) { this.axeCharging = false; return; }
    if (Input.actionPressed('axe') && this.axeSwingT <= 0 && !this.axeCharging && this.nooseState !== 'latched') {
      // begin press — decide tap vs charge on release
      this.axeCharging = true; this.chargeT = 0;
    }
    if (this.axeCharging) {
      if (Input.actionHeld('axe')) {
        this.chargeT += dt;
        if (this.chargeT > 0.45 && chance(dt * 30)) {
          const a = this.aimAngle();
          Particles.spawn(this.cx + Math.cos(a) * 30, this.cy + Math.sin(a) * 30, { color: '#ffd23f', vx: rnd(-40, 40), vy: rnd(-60, -10), life: 0.35, size: 3, g: -60 });
        }
      } else if (Input.actionReleased('axe')) {
        this.axeCharging = false;
        if (this.chargeT >= 0.45) {
          if (this.stamina >= 15) {
            this.stamina -= 15;
            this.startSwing(0.32, 3, true);
            Game.shake = Math.max(Game.shake, 6);
            Audio2.play('axecharged');
            Particles.ring(this.cx + this.facing * 30, this.cy, '#ffd23f');
          } else { Particles.text(this.cx, this.y || this.body.y, 'no stamina', '#cfc7b8'); Audio2.play('uiclick'); }
        } else {
          this.startSwing(0.18, this.axeCombo === 2 ? 2 : 1, false);
        }
      }
    }
    // active swing
    if (this.axeSwingT > 0) {
      this.axeSwingT -= dt;
      const prog = 1 - this.axeSwingT / this.axeDur;
      // hit window mid-swing
      if (!this.axeHitDone && prog > 0.25) { this.axeHitDone = true; this.applyAxeHits(solids); }
      if (this.axeSwingT <= 0) { this.axeComboWin = 0.55; if (this.chargedSwing) { this.axeCombo = 0; } }
    }
  }
  startSwing(dur, dmg, charged) {
    this.axeSwingT = dur; this.axeDur = dur; this.axeDmg = dmg; this.chargedSwing = charged;
    this.axeHitDone = false; this.axeHitSet = new Set();
    this.axeCombo = (this.axeCombo + 1) % 3;
    if (!charged) Audio2.play('axewhoosh');
    // small lunge
    this.body.vx += this.facing * (charged ? 60 : 110);
  }
  axeHitbox() {
    const b = this.body;
    const w = this.chargedSwing ? 100 : [0, 62, 76, 92][this.axeCombo] || 62;
    const h = this.chargedSwing ? 78 : 60;
    return { x: this.facing > 0 ? b.x + b.w - 8 : b.x + 8 - w, y: b.y + b.h / 2 - h / 2, w, h };
  }
  applyAxeHits(solids) {
    const hb = this.axeHitbox();
    const pos = { x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 };
    let hitAny = false;
    // breakables
    for (const br of Game.level.breakables) {
      if (!br.alive || this.axeHitSet.has(br)) continue;
      if (rectsOverlap(hb, br)) {
        this.axeHitSet.add(br);
        br.hit(this.axeDmg, this.chargedSwing, pos);
        hitAny = true;
      }
    }
    // guards
    for (const g of Game.level.guards) {
      if (this.axeHitSet.has(g)) continue;
      if (rectsOverlap(hb, g)) { this.axeHitSet.add(g); g.hit({ x: pos.x, y: pos.y }); hitAny = true; }
    }
    // boss
    const boss = Game.level.boss;
    if (boss && !boss.dead && rectsOverlap(hb, boss.body)) {
      boss.takeHit(this.axeDmg, { charged: this.chargedSwing, kind: 'axe', pos });
      hitAny = true;
    }
    // boss projectiles destructible (anger waves) via boss.checkAxe
    if (boss && boss.checkAxe) boss.checkAxe(hb, this.axeDmg, this.chargedSwing);
    if (hitAny) Game.hitStop = Math.max(Game.hitStop, this.chargedSwing ? 0.09 : 0.045);
  }

  // ================= NOOSE =================
  updateNoose(dt, solids) {
    if (!this.hasNoose) return;
    const b = this.body;
    if (this.nooseState === 'ready') {
      if (Input.actionPressed('noose') && !this.axeCharging) {
        if (this.stamina >= 10) {
          this.stamina -= 10;
          const a = this.aimAngle();
          this.nooseDir = { x: Math.cos(a), y: Math.sin(a) };
          this.nooseExt = 0; this.nooseState = 'fly'; this.nooseTarget = null;
          Audio2.play('noosethrow');
        } else { Particles.text(this.cx, b.y - 10, 'no stamina', '#cfc7b8'); }
      }
    } else if (this.nooseState === 'fly') {
      this.nooseExt += 1500 * dt;
      // find latch candidate along ray
      const maxLen = this.nooseRange;
      const tip = { x: this.cx + this.nooseDir.x * this.nooseExt, y: this.cy + this.nooseDir.y * this.nooseExt };
      const targets = this.nooseCandidates();
      let best = null, bestD = 46;
      for (const t of targets) {
        const d = Math.hypot(t.x - tip.x, t.y - tip.y);
        if (d < bestD) { bestD = d; best = t; }
      }
      if (best) {
        // latch
        this.nooseState = 'latched'; this.nooseTarget = best.ref;
        this.nooseLen = Math.hypot(best.ref.x - this.cx, best.ref.y - this.cy);
        this.nooseAng = Math.atan2(this.cx - best.ref.x, this.cy - best.ref.y);
        this.swingThV = clamp(b.vx / Math.max(60, this.nooseLen) * 0.6, -3, 3);
        this.swingPull = 0; this.pullProg = 0;
        best.ref.onNooseGrab && best.ref.onNooseGrab(this);
        Audio2.play('nooselatch');
      } else if (this.nooseExt >= maxLen) {
        this.nooseState = 'fly'; this.missT = 0.12; // retract
        this.nooseExt = 0; this._retracting = true;
      }
      if (this._retracting) { this.nooseExt = Math.max(0, this.nooseExt - 2600 * dt); if (this.nooseExt <= 0 && this.missT <= 0) { this.nooseState = 'ready'; this._retracting = false; } }
    } else if (this.nooseState === 'latched') {
      const tgt = this.nooseTarget;
      if (!tgt || (tgt.gone)) { this.detachNoose(); return; }
      if (tgt.type === 'ring') { /* handled in swing physics */ }
      else {
        // pull progress while holding
        if (Input.actionHeld('noose')) {
          this.pullProg += dt;
          if (this.pullProg > 0.3 && !this._pulledFlag) {
            this._pulledFlag = true;
            tgt.onNoosePull && tgt.onNoosePull(this);
            Audio2.play('noosereel');
            this.detachNoose();
          }
        } else if (Input.actionReleased('noose')) { this.detachNoose(); }
      }
    }
  }
  nooseCandidates() {
    const list = [];
    const lvl = Game.level;
    for (const r of lvl.rings) list.push({ x: r.x, y: r.y, ref: r });
    for (const s of lvl.switches) if (!s.pulled) list.push({ x: s.x, y: s.y, ref: s });
    for (const h of lvl.hangers) if (h.state === 'hang') list.push({ x: h.x + h.w / 2, y: h.y + 7, ref: h });
    for (const g of lvl.guards) if (g.stagger <= 0) list.push({ x: g.cx, y: g.y + 20, ref: g, guard: true });
    const boss = lvl.boss;
    if (boss && !boss.dead && boss.nooseVulnerable()) list.push({ x: boss.cx, y: boss.cy - 10, ref: boss, boss: true });
    return list;
  }
  detachNoose() {
    if (this.nooseTarget && this.nooseTarget.release) this.nooseTarget.release();
    this.nooseState = 'ready'; this.nooseTarget = null; this._pulledFlag = false; this.swingPull = 0;
  }
  // guard yank target
  yankGuard(g) {
    g.stagger = 2.0;
    g.vx = Math.sign(this.cx - g.cx) * 200;
    g.vy = -220;
    Particles.text(g.cx, g.y - 10, 'stunned!', '#ffe9a8');
    Audio2.play('stun');
  }

  // ================= TRUNK =================
  updateTrunk(dt, solids) {
    if (!this.hasTrunk) { this.breathCharge = 0; return; }
    const held = Input.actionHeld('trunk');
    if (Input.actionPressed('trunk')) {
      // slam: down + trunk in air
      if (!this.body.onGround && (Input.actionHeld('down') || (Input.touchActive && Input.touchAxis().y > 0.55))) {
        if (this.stamina >= 15 && !this.slamming) {
          this.stamina -= 15;
          this.slamming = true; this.slamDone = false;
          this.body.vy = 950; this.body.vx *= 0.3;
          Audio2.play('trunk');
        }
      } else if (this.stamina >= this.trunkCost && this.trunkT <= 0) {
        this.stamina -= this.trunkCost;
        this.doTrunkBlast();
      } else if (this.stamina < this.trunkCost) {
        Particles.text(this.cx, this.body.y - 10, 'no stamina', '#cfc7b8');
      }
      this.breathCharge = 0;
    }
    // hold → blessing breath
    if (held && this.trunkT <= 0 && !this.slamming) {
      this.breathCharge += dt;
      if (this.breathCharge > 0.55 && this.breathReady) {
        if (this.stamina >= 25) {
          this.stamina -= 25;
          this.doBlessingBreath();
          this.breathReady = false;
        } else { Particles.text(this.cx, this.body.y - 10, 'no stamina', '#cfc7b8'); this.breathReady = false; }
      }
    } else {
      this.breathCharge = 0;
      if (!held) this.breathReady = true;
    }
    if (this.slamming && this.body.onGround && !this.slamDone) this.doSlamImpact();
  }
  doTrunkBlast() {
    this.trunkT = 0.25;
    Audio2.play('trunk');
    const a = this.aimAngle();
    const dir = Math.sign(Math.cos(a)) || this.facing;
    Game.shake = Math.max(Game.shake, 2.5);
    // cone particles
    for (let i = 0; i < 14; i++) {
      const aa = a + rnd(-0.35, 0.35);
      Particles.spawn(this.cx + Math.cos(a) * 20, this.cy + Math.sin(a) * 20, {
        vx: Math.cos(aa) * rnd(240, 420), vy: Math.sin(aa) * rnd(240, 420) - 30,
        life: 0.3, size: 4, color: chance(0.5) ? '#e8dcc0' : '#ffd8a0', g: 0,
      });
    }
    // cone hit region
    const range = 150, half = 0.55;
    const coneHit = (x, y) => {
      const dx = x - this.cx, dy = y - this.cy;
      const d = Math.hypot(dx, dy);
      if (d > range) return false;
      let da = Math.atan2(dy, dx) - a;
      while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      return Math.abs(da) < half;
    };
    for (const pb of Game.level.pushblocks) {
      if (pb.alive && !pb.inWater && coneHit(pb.x + pb.w / 2, pb.y + pb.h / 2)) pb.push(dir, 300);
    }
    for (const g of Game.level.guards) if (coneHit(g.cx, g.cy)) g.trunkPush(dir, 300);
    const boss = Game.level.boss;
    if (boss && !boss.dead) {
      if (coneHit(boss.cx, boss.cy)) boss.trunkHit && boss.trunkHit(dir, 300);
      if (boss.checkTrunk) boss.checkTrunk(coneHit, dir);
    }
  }
  doBlessingBreath() {
    Audio2.play('fog');
    const a = this.aimAngle();
    Particles.text(this.cx, this.body.y - 20, 'blessing breath', '#ffe9a8');
    for (let i = 0; i < 26; i++) {
      const aa = a + rnd(-0.5, 0.5), sp = rnd(120, 340);
      Particles.spawn(this.cx, this.cy, { vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp - 40, life: rnd(0.5, 0.9), size: 5, color: chance(0.5) ? '#ffe9a8' : '#fff3c4', g: -30, drag: 0.94 });
    }
    const reach = 360;
    for (const f of Game.level.fogs) {
      if (!f.alive) continue;
      const fx = clamp(this.cx, f.x, f.x + f.w), fy = clamp(this.cy, f.y, f.y + f.h);
      if (Math.hypot(fx - this.cx, fy - this.cy) < reach) f.bless();
    }
    const boss = Game.level.boss;
    if (boss && !boss.dead && boss.onBless) {
      const d = Math.hypot(boss.cx - this.cx, boss.cy - this.cy);
      if (d < reach) boss.onBless();
    }
  }
  doSlamImpact() {
    this.slamDone = true; this.slamming = false;
    Audio2.play('trunkslam');
    Game.shake = Math.max(Game.shake, 7);
    Particles.ring(this.cx, this.body.y + this.body.h, '#ffd8a0');
    Particles.burst(this.cx, this.body.y + this.body.h, 16, { color: '#e8dcc0', spMax: 240, angle: -Math.PI / 2, up: 40, life: 0.5 });
    const R = 170;
    for (const g of Game.level.guards) {
      if (Math.hypot(g.cx - this.cx, g.cy - this.cy) < R) { g.stagger = 1.6; Audio2.play('stun'); Particles.text(g.cx, g.y - 10, 'dazed', '#ffe9a8'); }
    }
    const boss = Game.level.boss;
    if (boss && !boss.dead && Math.hypot(boss.cx - this.cx, boss.cy - this.cy) < R + 30) {
      boss.takeHit(2, { charged: true, kind: 'slam', pos: { x: this.cx, y: this.body.y } });
    }
  }
  shedAttachment() {
    if (this.attachedBy) {
      const a = this.attachedBy;
      this.attachedBy = null;
      if (a.shed) a.shed();
    }
  }

  // ================= DAMAGE =================
  takeHit(fromX, cause) {
    if (this.hurtT > 0 || this.dead || this.dashing) return;
    if (this.shield > 0) {
      this.shield--;
      Audio2.play('shield');
      Particles.ring(this.cx, this.cy, '#ffe9a8');
      Particles.text(this.cx, this.body.y - 14, 'shield spent', '#ffe9a8');
      this.hurtT = 0.6;
      return;
    }
    this.health--;
    this.hurtT = 1.1;
    Audio2.play('hurt');
    Game.shake = Math.max(Game.shake, 6);
    Game.hitStop = Math.max(Game.hitStop, 0.06);
    const dir = Math.sign(this.cx - fromX) || 1;
    this.body.vx = dir * 260; this.body.vy = -230;
    Particles.burst(this.cx, this.cy, 10, { color: '#e85a4f', spMax: 160 });
    if (this.health <= 0) { this.dead = true; this.deathT = 0; Audio2.play('hurt'); }
  }

  draw(c, cam, t) {
    const b = this.body;
    // dash afterimages
    for (const tr of this.trail) {
      c.save(); c.globalAlpha = tr.t * 2.4;
      c.fillStyle = '#f7b32b';
      c.beginPath(); c.ellipse(tr.x - cam.x, tr.y - cam.y, 16, 30, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    if (this.dead) {
      // fall over + fade
      c.save();
      c.globalAlpha = clamp(1 - this.deathT / 1.6, 0, 1);
      c.translate(this.cx - cam.x, b.y + b.h - cam.y);
      c.rotate(Math.min(this.deathT * 2, Math.PI / 2) * -this.facing);
      Art.drawGanesha(c, 0, 0, { dir: this.facing, idle: true, squash: -0.4 }, t, false);
      c.restore();
      return;
    }
    const hurtFlash = this.hurtT > 0 && (Math.floor(this.hurtT * 12) % 2 === 0);
    // noose rope (drawn behind body)
    if (this.nooseState !== 'ready') this.drawRope(c, cam);
    const pose = {
      dir: this.facing,
      idle: b.onGround && Math.abs(b.vx) < 20 && !this.dashing,
      legSwing: b.onGround ? Math.sin(this.runPhase) * clamp(Math.abs(b.vx) / 300, 0, 1) : 0.4,
      armSwing: b.onGround ? -Math.sin(this.runPhase) * clamp(Math.abs(b.vx) / 300, 0, 1) : -0.5,
      trunkWave: Math.sin(t * 3) * 0.5 + clamp(b.vx / 600, -1, 1) * 0.6 + (this.trunkT > 0 ? 2 : 0),
      squash: this.landSquash * 0.5 + (!b.onGround ? clamp(-b.vy / 900, -0.5, 0.7) : 0),
      lean: clamp(b.vx / 300, -1, 1) * (b.onGround ? 1 : 0.4),
      scale: 1,
    };
    if (this.axeSwingT > 0) {
      const prog = 1 - this.axeSwingT / this.axeDur;
      const arc = this.chargedSwing ? -1.4 + prog * 3.1 : -1.1 + prog * 2.6;
      pose.axeAng = this.facing > 0 ? arc : Math.PI - arc;
      pose.armSwing = 0;
    } else if (this.axeCharging && this.chargeT > 0.45) {
      pose.axeAng = this.facing > 0 ? -2.2 + Math.sin(t * 30) * 0.08 : Math.PI + 2.2 - Math.sin(t * 30) * 0.08;
    } else if (this.hasAxe) {
      pose.axeAng = this.facing > 0 ? -0.9 : Math.PI + 0.9; // rest on shoulder
    }
    if (hurtFlash) {
      c.save(); c.globalAlpha = 0.55;
    }
    Art.drawGanesha(c, this.cx - cam.x, b.y + b.h - cam.y, pose, t, this.shield > 0 || this.aura);
    if (hurtFlash) c.restore();
  }
  drawRope(c, cam) {
    const hx = this.cx + this.facing * 8, hy = this.cy - 6;
    let tx, ty;
    if (this.nooseState === 'fly') {
      tx = this.cx + this.nooseDir.x * this.nooseExt; ty = this.cy + this.nooseDir.y * this.nooseExt;
    } else {
      tx = this.nooseTarget.x; ty = this.nooseTarget.y;
    }
    const x1 = hx - cam.x, y1 = hy - cam.y, x2 = tx - cam.x, y2 = ty - cam.y;
    c.save();
    c.strokeStyle = '#e8dcc0'; c.lineWidth = 2.5;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + 10;
    c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(mx, my, x2, y2); c.stroke();
    // noose loop at tip
    if (this.nooseState === 'fly') {
      c.beginPath(); c.arc(x2, y2, 7, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
  }
}

// ============================================================
// BOSS BASE — flat FSM: enter, idle, telegraph, attack, recover, stunned, defeat
// ============================================================
class BossBase {
  constructor(d, meta) {
    this.type = d.type; this.meta = meta;
    this.x = d.x; this.y = d.y; this.w = 56; this.h = 96;
    this.vx = 0; this.vy = 0; this.onGround = false;
    this.maxHp = meta.hp; this.hp = meta.hp;
    this.phase = 1; this.maxPhase = meta.phases || 3;
    this.state = 'enter'; this.stateT = 0;
    this.flashT = 0; this.dead = false; this.deathT = 0;
    this.dir = -1;
    this.arena = Game.level.bossArena;
    this.body = this; // shared interface
    this.touchCd = 0;
    this.introduced = false;
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  setState(s) { this.state = s; this.stateT = 0; this.onEnterState && this.onEnterState(s); }
  clampToArena() {
    if (!this.arena) return;
    let maxX = this.arena.x + this.arena.w - this.w - 10;
    if (maxX < this.arena.x + 10) maxX = this.arena.x + 10; // degenerate arena guard
    this.x = clamp(this.x, this.arena.x + 10, maxX);
  }
  facePlayer() { this.dir = Game.player.cx < this.cx ? -1 : 1; }
  gravity(dt) { this.vy = Math.min(this.vy + 1600 * dt, 900); }

  update(dt, solids) {
    this.stateT += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.touchCd = Math.max(0, this.touchCd - dt);
    if (this.dead) {
      this.deathT += dt;
      if (chance(dt * 14)) Particles.spawn(this.cx + rnd(-30, 30), this.cy + rnd(-40, 20), { color: chance(0.5) ? '#ffd23f' : '#ff8a5c', vy: -rnd(40, 120), vx: rnd(-40, 40), life: 1.0, size: 4, kind: 'petal', g: 40 });
      return;
    }
    this.physics(dt, solids);
    this['st_' + this.state] && this['st_' + this.state](dt, solids);
    // contact damage
    if (this.state !== 'stunned' && this.state !== 'defeat' && this.touchCd <= 0 && rectsOverlap(this, Game.player.body)) {
      if (this.contactDamage()) this.touchCd = 0.8;
    }
    Audio2.bossMode = true;
  }
  physics(dt, solids) { moveBody(this, solids, dt); this.clampToArena(); }

  takeHit(dmg, opt = {}) {
    if (this.dead || this.state === 'defeat') return;
    if (!this.canDamage(opt)) {
      Audio2.play('bossclank');
      Particles.burst(opt.pos ? opt.pos.x : this.cx, opt.pos ? opt.pos.y : this.cy, 6, { color: '#fff', spMax: 140, life: 0.25 });
      Particles.text(this.cx, this.y - 12, this.deflectText || 'deflected!', '#cfc7b8');
      return;
    }
    let d = dmg;
    if (opt.kind === this.meta.weakness) d *= 2;       // weakness tool deals double
    if (this.state === 'stunned') d *= 2;               // stun window double
    this.hp -= d;
    this.flashT = 0.15;
    Audio2.play('bosshurt');
    Particles.burst(opt.pos ? opt.pos.x : this.cx, opt.pos ? opt.pos.y : this.cy, 10, { color: '#ffd23f', spMax: 180 });
    Game.hitStop = Math.max(Game.hitStop, 0.05);
    const ph = this.phaseForHp();
    if (ph !== this.phase) { this.phase = ph; this.onPhase && this.onPhase(ph); }
    if (this.hp <= 0) this.die();
  }
  phaseForHp() {
    const f = this.hp / this.maxHp;
    return f > 0.6 ? 1 : f > 0.25 ? 2 : 3;
  }
  die() {
    this.dead = true; this.hp = 0;
    this.setState('defeat');
    Audio2.play('bossdie');
    Game.shake = 8;
    Particles.burst(this.cx, this.cy, 30, { color: '#ffd23f', spMax: 300, life: 1.2, size: 5 });
    Game.onBossDefeated();
  }
  // default: damage allowed unless overridden
  canDamage(opt) { return true; }
  contactDamage() { Game.player.takeHit(this.cx, 'boss'); return true; }
  nooseVulnerable() { return false; }
  trunkHit(dir, power) {}
  drawCommon(c, cam) {
    if (this.flashT > 0) { c.save(); }
  }

  // ------- shared states -------
  st_enter(dt) {
    // rise / roar intro
    if (this.stateT > 1.2) { this.setState('idle'); this.introduced = true; }
  }
  st_idle(dt) {
    this.facePlayer();
    this.vx = approach(this.vx, 0, 800 * dt);
    if (this.stateT > this.idleTime()) this.pickAttack();
  }
  st_telegraph(dt) {
    this.vx = approach(this.vx, 0, 1200 * dt);
    if (this.stateT > this.telegraphDur) this.executeAttack();
  }
  st_stunned(dt) {
    this.vx = approach(this.vx, 0, 1400 * dt);
    if (this.stateT > this.stunDur) this.setState('idle');
  }
}

// ============================================================
// BOSS 1 — EGO (boastful captain; weak to noose — pull his plates)
// ============================================================
class EgoBoss extends BossBase {
  constructor(d) {
    super(d, BOSS_META.ego);
    this.w = 52; this.h = 104;
    this.y = d.y - this.h;
    this.plates = 3; this.plateAng = 0; this.plateDip = 0;
    this.telegraphDur = 0.7; this.stunDur = 2.5;
    this.chargeVx = 0;
  }
  onEnterState(s) {
    if (s === 'telegraph') { Audio2.play('telegraph'); }
    if (s === 'stunned') { Audio2.play('stun'); Particles.text(this.cx, this.y - 16, 'STUNNED', '#ffe9a8'); }
  }
  idleTime() { return this.phase === 3 ? 0.7 : 1.1; }
  pickAttack() {
    this.facePlayer();
    if (this.phase === 2 && this.plates > 0 && chance(0.55)) { this._atk = 'sweep'; this.telegraphDur = 0.6; }
    else { this._atk = 'charge'; this.telegraphDur = this.phase === 3 ? 0.5 : 0.7; }
    this.setState('telegraph');
  }
  onPhase(ph) {
    if (ph === 2) { Particles.text(this.cx, this.y - 30, 'BEHOLD MY ARMOR!', '#f2c14e'); Audio2.play('telegraph'); }
    if (ph === 3) { Particles.text(this.cx, this.y - 30, 'NO... MY ARMOR!', '#f2c14e'); this.plates = 0; }
  }
  executeAttack() {
    this.setState('attack');
    if (this._atk === 'charge') {
      this.chargeVx = this.dir * (this.phase === 3 ? 640 : 520);
      Audio2.play('bossdash');
    } else {
      this.plateDip = 1; // plates sweep low — noose window
      this._dipT = 1.4;
    }
  }
  st_attack(dt) {
    if (this._atk === 'charge') {
      this.vx = this.chargeVx;
      if (chance(dt * 30)) Particles.burst(this.cx - this.dir * 20, this.y + this.h - 8, 2, { color: '#c9b493', spMax: 80, life: 0.3 });
      if (this.stateT > 0.85 || this.hitWallTransient) { this.setState('recover'); this._recT = 0.7; }
    } else {
      this.vx = approach(this.vx, 0, 900 * dt);
      this._dipT -= dt;
      if (this._dipT <= 0) this.setState('recover'), this._recT = 0.5;
    }
  }
  st_recover(dt) {
    this.vx = approach(this.vx, 0, 1400 * dt);
    this.plateDip = Math.max(0, this.plateDip - dt * 2);
    if (this.stateT > (this._recT || 0.6)) this.setState('idle');
  }
  // noose interaction: during plate dip, boss is latchable
  nooseVulnerable() { return this.phase >= 2 && this.plates > 0 && this.plateDip > 0.25 && this.state === 'attack'; }
  onNooseGrab(p) { Particles.text(this.cx, this.y - 24, 'a plate!', '#ffe9a8'); return true; }
  onNoosePull(p) {
    if (!this.nooseVulnerable()) return;
    this.plates--;
    this.setState('stunned');
    Audio2.play('shatter');
    Particles.burst(this.cx, this.cy - 20, 18, { color: '#f2c14e', spMax: 260 });
    Particles.text(this.cx, this.y - 26, this.plates > 0 ? 'armor broken!' : 'bare pride!', '#ffe9a8');
    Game.shake = Math.max(Game.shake, 5);
    if (this.plates <= 0) this.phase = 3;
  }
  canDamage(opt) {
    // stunned = punish window: any hit lands
    if (this.state === 'stunned' || this.state === 'defeat') return true;
    // while plates remain (phase 2+), light axe hits deflect — charged smash or noose pull bypass
    if (this.plates > 0 && this.phase >= 2 && opt.kind === 'axe' && !opt.charged) return false;
    return true;
  }
  contactDamage() {
    if (this._atk === 'charge' && this.state === 'attack') { Game.player.takeHit(this.cx, 'charge'); return true; }
    Game.player.takeHit(this.cx, 'boss'); return true;
  }
  draw(c, cam, t) {
    const flash = this.flashT > 0;
    // plates orbit / dip
    const dip = this.plateDip;
    for (let i = 0; i < this.plates; i++) {
      const base = t * 2.2 + i * (Math.PI * 2 / Math.max(1, this.plates));
      const drop = dip * (36 + Math.sin(t * 9 + i) * 6);
      const px = this.cx - cam.x + Math.cos(base) * (34 - dip * 8);
      const py = this.cy - 30 - cam.y + Math.sin(base) * 14 + drop;
      c.fillStyle = flash ? '#fff' : '#d7b544';
      c.beginPath(); c.ellipse(px, py, 11, 13, base, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#8a6d1f'; c.lineWidth = 2; c.stroke();
    }
    Art.drawGuard(c, this.cx - cam.x, this.y + this.h - cam.y, t, { dir: this.dir, boss: true });
    if (this.state === 'telegraph') {
      c.fillStyle = `rgba(255,210,80,${0.4 + Math.sin(t * 24) * 0.25})`;
      c.beginPath(); c.arc(this.cx - cam.x, this.cy - cam.y, 46, 0, Math.PI * 2); c.fill();
    }
    if (this.state === 'stunned') {
      c.fillStyle = '#ffe9a8'; c.font = 'bold 18px Georgia'; c.textAlign = 'center';
      for (let i = 0; i < 3; i++) c.fillText('✦', this.cx - cam.x - 18 + i * 18, this.y - cam.y - 12 + Math.sin(t * 6 + i * 2) * 4);
    }
    if (flash) c.restore();
  }
}

// ============================================================
// BOSS 2 — GREED (hoarding spirit; weak to charged axe + pot breaks)
// ============================================================
class GreedBoss extends BossBase {
  constructor(d) {
    super(d, BOSS_META.greed);
    this.w = 58; this.h = 92;
    this.y = d.y - this.h;
    this.telegraphDur = 0.65; this.stunDur = 2.6;
    this.pots = [];
    const ax = this.arena;
    for (let i = 0; i < 3; i++) {
      this.pots.push({ x: ax.x + 60 + i * (ax.w - 120) / 2, y: d.y - 26, w: 34, h: 30, hp: 2, alive: true });
    }
    this.coins = [];
    this.potsBroken = 0;
  }
  idleTime() { return 1.0; }
  pickAttack() {
    this.facePlayer();
    this._atk = this.phase >= 2 && chance(0.4) ? 'coinrain' : 'cointoss';
    this.telegraphDur = 0.6;
    this.setState('telegraph');
  }
  onPhase(ph) {
    if (ph === 2) Particles.text(this.cx, this.y - 30, 'MY PRECIOUS HOARD!', '#f2c14e');
    if (ph === 3) Particles.text(this.cx, this.y - 30, 'NOT THE BAG!', '#f2c14e');
  }
  executeAttack() {
    this.setState('attack');
    this._throwN = this._atk === 'coinrain' ? 5 : 3;
    this._throwT = 0;
  }
  st_attack(dt) {
    this._throwT -= dt;
    if (this._throwN > 0 && this._throwT <= 0) {
      this._throwT = 0.22; this._throwN--;
      const p = Game.player;
      const dx = p.cx - this.cx, dy = p.cy - this.cy;
      const tt = 0.9;
      this.coins.push({ x: this.cx, y: this.y + 10, vx: dx / tt, vy: dy / tt - 0.5 * 1300 * tt, r: 8 });
      Audio2.play('pickup');
    }
    if (this._throwN <= 0) { this.setState('recover'); this._recT = 0.55; }
  }
  st_recover(dt) { this.vx = approach(this.vx, 0, 1000 * dt); if (this.stateT > (this._recT || 0.6)) this.setState('idle'); }
  update(dt, solids) {
    super.update(dt, solids);
    // coins physics
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const co = this.coins[i];
      co.vy += 1300 * dt; co.x += co.vx * dt; co.y += co.vy * dt;
      if (solidAt(co.x, co.y, solids) || co.y > (Game.level.rows * TILE)) {
        Particles.burst(co.x, co.y, 4, { color: '#f2c14e', spMax: 80, life: 0.3 });
        this.coins.splice(i, 1); continue;
      }
      if (dist2(co.x, co.y, Game.player.cx, Game.player.cy) < 20 * 20 && Game.player.hurtT <= 0) {
        Game.player.takeHit(co.x, 'coin'); this.coins.splice(i, 1);
      }
    }
    // pots regen check
    for (const pot of this.pots) if (pot.alive) { /* static */ }
  }
  checkAxe(hb, dmg, charged) {
    for (const pot of this.pots) {
      if (!pot.alive) continue;
      if (rectsOverlap(hb, pot)) {
        pot.hp -= charged ? 2 : (charged ? 2 : 0.6);
        Particles.burst(pot.x + 17, pot.y + 15, 8, { color: '#c9a23f', spMax: 140 });
        Audio2.play(charged ? 'axecharged' : 'axestone');
        if (charged || pot.hp <= 0) {
          pot.alive = false; this.potsBroken++;
          Audio2.play('shatter');
          Game.shake = Math.max(Game.shake, 4);
          Particles.text(pot.x + 17, pot.y - 10, 'vault broken!', '#ffe9a8');
          for (let i = 0; i < 4; i++) Game.spawnQueue.push({ type: 'modak', x: pot.x + 17 + rnd(-16, 16), y: pot.y, vy: -rnd(180, 320) });
          if (this.potsBroken === 3) { Particles.text(this.cx, this.y - 30, 'his hoard is exposed!', '#ffe9a8'); }
        }
      }
    }
  }
  canDamage(opt) {
    if (opt.kind !== 'axe') return true;
    if (opt.charged) return true;                       // charged always bites
    return this.phase === 1;                            // light hits only in phase 1
  }
  nooseVulnerable() { return this.potsBroken >= 3; }
  onNooseGrab(p) {
    if (this.potsBroken >= 3) { Particles.text(this.cx, this.y - 24, 'the bag!', '#ffe9a8'); return true; }
    Particles.text(this.cx, this.y - 24, 'protected by his hoard...', '#cfc7b8');
    return false;
  }
  onNoosePull(p) {
    if (this.potsBroken < 3) return;
    this.setState('stunned');
    Audio2.play('shatter');
    Particles.burst(this.cx, this.y + 20, 24, { color: '#f2c14e', spMax: 300 });
    Particles.text(this.cx, this.y - 26, 'the hoard spills!', '#ffe9a8');
    for (let i = 0; i < 6; i++) Game.spawnQueue.push({ type: 'modak', x: this.cx + rnd(-30, 30), y: this.y + 20, vy: -rnd(200, 360) });
    Game.shake = Math.max(Game.shake, 6);
  }
  trunkHit() {}
  contactDamage() { Game.player.takeHit(this.cx, 'boss'); return true; }
  draw(c, cam, t) {
    const flash = this.flashT > 0;
    Art.drawGreed(c, this.cx - cam.x, this.y + this.h - cam.y, t, { flash });
    // pots
    for (const pot of this.pots) {
      if (!pot.alive) continue;
      const x = pot.x - cam.x, y = pot.y - cam.y;
      c.fillStyle = '#8a5a2a';
      c.beginPath(); c.ellipse(x + 17, y + 15, 17, 15, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#6e4520'; c.fillRect(x + 8, y + 2, 18, 6);
      c.strokeStyle = PAL.gold; c.lineWidth = 2;
      c.beginPath(); c.arc(x + 17, y + 15, 9, 0, Math.PI * 2); c.stroke();
    }
    // coins
    c.fillStyle = PAL.gold;
    for (const co of this.coins) {
      c.beginPath(); c.arc(co.x - cam.x, co.y - cam.y, co.r, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#8a6d1f'; c.lineWidth = 1.5; c.stroke();
    }
    if (this.state === 'telegraph') {
      c.fillStyle = `rgba(255,210,80,${0.35 + Math.sin(t * 24) * 0.2})`;
      c.beginPath(); c.arc(this.cx - cam.x, this.cy - cam.y, 44, 0, Math.PI * 2); c.fill();
    }
    if (this.state === 'stunned') {
      for (let i = 0; i < 8; i++) {
        const a = t * 4 + i;
        c.fillStyle = PAL.gold;
        c.beginPath(); c.arc(this.cx - cam.x + Math.cos(a) * 30, this.y - cam.y + Math.sin(a * 1.7) * 8, 4, 0, Math.PI * 2); c.fill();
      }
    }
  }
}

// ============================================================
// BOSS 3 — ANGER (flood guardian; weak to trunk — push waves back)
// ============================================================
class AngerBoss extends BossBase {
  constructor(d) {
    super(d, BOSS_META.anger);
    this.w = 62; this.h = 96;
    this.y = d.y - this.h;
    this.telegraphDur = 0.8; this.stunDur = 2.2;
    this.waves = []; this.surfaced = true; this.diveT = 0;
  }
  idleTime() { return 0.9; }
  pickAttack() {
    this.facePlayer();
    if (this.phase >= 2 && chance(0.35)) { this._atk = 'geyser'; }
    else { this._atk = 'wave'; }
    this.telegraphDur = 0.8;
    this.setState('telegraph');
  }
  onPhase(ph) { if (ph === 2) Particles.text(this.cx, this.y - 30, 'THE RIVER RISES!', '#9cc4e0'); if (ph === 3) Particles.text(this.cx, this.y - 30, 'RRRAAGGH!', '#ff6a33'); }
  executeAttack() {
    this.setState('attack');
    if (this._atk === 'wave') {
      this.waves.push({ x: this.cx + this.dir * 30, y: this.y + this.h - 26, w: 56, h: 34, vx: this.dir * (this.phase === 3 ? 380 : 300), pushed: 0 });
      Audio2.play('bossdash');
    } else {
      this._geyN = this.phase === 3 ? 3 : 2; this._geyT = 0;
    }
  }
  st_attack(dt) {
    if (this._atk === 'wave') {
      this.vx = approach(this.vx, 0, 800 * dt);
      if (this.stateT > 0.5) { this.setState('recover'); this._recT = 0.6; }
    } else {
      this._geyT -= dt;
      if (this._geyN > 0 && this._geyT <= 0) {
        this._geyT = 0.5; this._geyN--;
        const px = Game.player.cx;
        this.waves.push({ x: px + rnd(-60, 60), y: this.y + this.h - 20, w: 40, h: 90, vx: 0, vy: -260, geyser: true, life: 1.1 });
        Audio2.play('trunk');
      }
      if (this._geyN <= 0) { this.setState('recover'); this._recT = 0.5; }
    }
  }
  st_recover(dt) { if (this.stateT > (this._recT || 0.6)) this.setState('idle'); }
  update(dt, solids) {
    super.update(dt, solids);
    const pl = Game.player;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      if (w.geyser) {
        w.life -= dt; w.vy += 500 * dt; w.y += w.vy * dt;
        if (w.life <= 0) { this.waves.splice(i, 1); continue; }
      } else {
        w.x += w.vx * dt;
        if (w.x < this.arena.x - 60 || w.x > this.arena.x + this.arena.w + 60) { this.waves.splice(i, 1); continue; }
      }
      if (pl.hurtT <= 0 && rectsOverlap({ x: w.x - w.w / 2, y: w.y - w.h / 2, w: w.w, h: w.h }, pl.body)) {
        pl.takeHit(w.x, 'wave');
      }
    }
  }
  checkTrunk(coneHit, dir) {
    // pushing a wave back damages the boss
    for (const w of this.waves) {
      if (w.geyser) continue;
      if (coneHit(w.x, w.y)) {
        w.vx = dir * Math.abs(w.vx) * 1.2;
        w.pushed += 1;
        Particles.burst(w.x, w.y - 10, 10, { color: '#bfe0f5', spMax: 160 });
        Audio2.play('trunk');
        if (w.pushed === 1) this.takeHit(2, { kind: 'trunk', pos: { x: w.x, y: w.y - 10 } });
      }
    }
  }
  trunkHit(dir, power) {
    // direct blast disperses him a little
    this.takeHit(1, { kind: 'trunk', pos: { x: this.cx, y: this.cy } });
    this.vx = dir * 120;
  }
  checkAxe(hb, dmg, charged) {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      if (rectsOverlap(hb, { x: w.x - w.w / 2, y: w.y - w.h / 2, w: w.w, h: w.h })) {
        Particles.burst(w.x, w.y, 8, { color: '#bfe0f5', spMax: 140 });
        this.waves.splice(i, 1);
        Audio2.play('axewood');
      }
    }
  }
  canDamage(opt) { return true; }
  contactDamage() { Game.player.takeHit(this.cx, 'boss'); return true; }
  draw(c, cam, t) {
    const flash = this.flashT > 0;
    Art.drawAnger(c, this.cx - cam.x, this.y + this.h - cam.y, t, { flash });
    for (const w of this.waves) {
      const x = w.x - cam.x, y = w.y - cam.y;
      const g = c.createLinearGradient(0, y - w.h / 2, 0, y + w.h / 2);
      g.addColorStop(0, 'rgba(140,190,230,0.9)'); g.addColorStop(1, 'rgba(40,90,150,0.9)');
      c.fillStyle = g;
      c.beginPath();
      if (w.geyser) {
        c.ellipse(x, y, w.w / 2, w.h / 2, 0, 0, Math.PI * 2);
      } else {
        c.moveTo(x - w.w / 2, y + w.h / 2);
        c.quadraticCurveTo(x, y - w.h * 0.9, x + w.w / 2, y + w.h / 2);
      }
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2; c.stroke();
    }
    if (this.state === 'telegraph') {
      c.fillStyle = `rgba(255,110,60,${0.35 + Math.sin(t * 24) * 0.2})`;
      c.beginPath(); c.arc(this.cx - cam.x, this.cy - cam.y, 50, 0, Math.PI * 2); c.fill();
    }
    if (this.state === 'stunned') {
      c.fillStyle = '#9cc4e0'; c.font = 'bold 16px Georgia'; c.textAlign = 'center';
      c.fillText('~ doused ~', this.cx - cam.x, this.y - cam.y - 10);
    }
  }
}

// ============================================================
// BOSS 4 — ATTACHMENT (clinging shadow; weak to dash — shed it)
// ============================================================
class AttachmentBoss extends BossBase {
  constructor(d) {
    super(d, BOSS_META.attachment);
    this.w = 56; this.h = 64;
    this.y = d.y - this.h;
    this.telegraphDur = 0.6; this.stunDur = 2.4;
    this.driftVx = 0;
  }
  idleTime() { return 0.7; }
  pickAttack() {
    this._atk = chance(0.6) ? 'lunge' : 'tendrils';
    this.telegraphDur = 0.6;
    this.setState('telegraph');
  }
  onPhase(ph) {
    if (ph === 2) Particles.text(this.cx, this.y - 30, 'stay with me...', '#c9a0dc');
    if (ph === 3) Particles.text(this.cx, this.y - 30, 'you cannot leave!', '#c9a0dc');
  }
  executeAttack() {
    this.setState('attack');
    if (this._atk === 'lunge') {
      const p = Game.player;
      const dx = p.cx - this.cx, dy = (p.cy - this.cy) * 0.4;
      const d = Math.hypot(dx, dy) || 1;
      this.vx = dx / d * 480; this.vy = dy / d * 480 - 120;
      Audio2.play('bossdash');
    } else { this._tendT = 0; }
  }
  st_attack(dt) {
    if (this._atk === 'lunge') {
      if (this.stateT > 0.5) { this.setState('recover'); this._recT = 0.7; }
    } else {
      this._tendT += dt;
      // tendrils: wide slow swipe zone
      const zone = { x: this.cx + this.dir * 30 - 60, y: this.y - 10, w: 120, h: this.h + 20 };
      if (rectsOverlap(zone, Game.player.body) && Game.player.hurtT <= 0) Game.player.takeHit(this.cx, 'tendril');
      if (this._tendT > 0.7) { this.setState('recover'); this._recT = 0.5; }
    }
  }
  st_recover(dt) { this.vx = approach(this.vx, 0, 700 * dt); this.vy = approach(this.vy, 0, 700 * dt); if (this.stateT > (this._recT || 0.6)) this.setState('idle'); }
  st_idle(dt) {
    // perpetual slow drift toward player (can't be walked away from)
    this.facePlayer();
    const p = Game.player;
    const dx = p.cx - this.cx;
    this.vx = approach(this.vx, Math.sign(dx) * 46 * (1 + (this.phase - 1) * 0.35), 300 * dt);
    if (this.stateT > this.idleTime()) this.pickAttack();
  }
  update(dt, solids) {
    super.update(dt, solids);
    const p = Game.player;
    // attach on contact
    if (!p.attachedBy && !p.dead && rectsOverlap(this, p.body) && this.state !== 'stunned' && this.state !== 'defeat') {
      p.attachedBy = this;
      Particles.text(p.cx, p.body.y - 16, 'it clings! DASH to shed!', '#c9a0dc');
      Audio2.play('hurt');
    }
  }
  // while attached, player is slowed (checked by Game via player.attachedBy)
  shed() {
    this.setState('stunned');
    Particles.burst(this.cx, this.cy, 16, { color: '#c9a0dc', spMax: 220 });
    Particles.text(this.cx, this.y - 20, 'shed! strike now!', '#ffe9a8');
    Audio2.play('stun');
  }
  canDamage(opt) { return true; }
  contactDamage() {
    // attachment doesn't hurt on touch — it clings (handled in update)
    return false;
  }
  draw(c, cam, t) {
    const flash = this.flashT > 0;
    const attached = Game.player.attachedBy === this;
    Art.drawAttachment(c, this.cx - cam.x, this.y + this.h - cam.y, t, { flash });
    if (attached) {
      // clinging veil over player
      const p = Game.player;
      c.strokeStyle = `rgba(201,160,220,${0.5 + Math.sin(t * 6) * 0.2})`;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(this.cx - cam.x, this.cy - cam.y);
      c.quadraticCurveTo((this.cx + p.cx) / 2 - cam.x, (this.cy + p.cy) / 2 - cam.y + 20, p.cx - cam.x, p.cy - cam.y);
      c.stroke();
    }
    if (this.state === 'telegraph') {
      c.fillStyle = `rgba(180,120,220,${0.3 + Math.sin(t * 24) * 0.2})`;
      c.beginPath(); c.arc(this.cx - cam.x, this.cy - cam.y, 44, 0, Math.PI * 2); c.fill();
    }
  }
}

// ============================================================
// BOSS 5 — IGNORANCE (fog beast; bless-breath reveals core, then strike)
// ============================================================
class IgnoranceBoss extends BossBase {
  constructor(d) {
    super(d, BOSS_META.ignorance);
    this.w = 70; this.h = 90;
    this.y = d.y - this.h;
    this.telegraphDur = 0.7; this.stunDur = 2.6;
    this.revealT = 0; this.puffs = [];
  }
  idleTime() { return 0.8; }
  pickAttack() {
    this._atk = chance(0.55) ? 'pulse' : 'puffs';
    this.telegraphDur = 0.7;
    this.setState('telegraph');
  }
  onPhase(ph) { if (ph === 2) Particles.text(this.cx, this.y - 30, 'forget... forget...', '#b0a0ff'); if (ph === 3) Particles.text(this.cx, this.y - 30, 'THERE IS NO PATH!', '#b0a0ff'); }
  executeAttack() {
    this.setState('attack');
    if (this._atk === 'pulse') {
      this.pulseR = 10;
      Audio2.play('fog');
    } else { this._puffN = 3; this._puffT = 0; }
  }
  st_attack(dt) {
    if (this._atk === 'pulse') {
      this.pulseR += 340 * dt;
      const p = Game.player;
      const d = Math.abs(p.cx - this.cx);
      const band = Math.abs(d - this.pulseR);
      if (band < 24 && p.body.onGround && p.hurtT <= 0 && !p.dashing) p.takeHit(this.cx, 'pulse');
      if (this.pulseR > 520) { this.setState('recover'); this._recT = 0.5; }
    } else {
      this._puffT -= dt;
      if (this._puffN > 0 && this._puffT <= 0) {
        this._puffT = 0.4; this._puffN--;
        const p = Game.player;
        this.puffs.push({ x: p.cx + rnd(-40, 40), y: this.arena ? this.y + this.h - 40 : p.cy, r: 20, life: 2.2, vy: -30 });
        Audio2.play('trunk');
      }
      if (this._puffN <= 0) { this.setState('recover'); this._recT = 0.5; }
    }
  }
  st_recover(dt) { if (this.stateT > (this._recT || 0.5)) this.setState('idle'); }
  update(dt, solids) {
    this.revealT = Math.max(0, this.revealT - dt);
    super.update(dt, solids);
    const p = Game.player;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const f = this.puffs[i];
      f.life -= dt; f.y += f.vy * dt; f.r += 14 * dt;
      if (f.life <= 0) { this.puffs.splice(i, 1); continue; }
      if (dist2(f.x, f.y, p.cx, p.cy) < (f.r + 16) * (f.r + 16) && p.hurtT <= 0) {
        p.takeHit(f.x, 'fog'); this.puffs.splice(i, 1);
      }
    }
  }
  onBless() {
    // blessing breath reveals the core
    if (this.revealT <= 0) {
      this.revealT = 4.5;
      Particles.text(this.cx, this.y - 26, 'the core shows itself!', '#fff3c4');
      Audio2.play('bless');
      Particles.burst(this.cx, this.cy, 20, { color: '#fff3c4', spMax: 200, g: -40 });
      this.setState('stunned'); // brief stagger on first reveal
    } else this.revealT = Math.max(this.revealT, 4.5);
  }
  canDamage(opt) {
    if (opt.kind === 'trunk') return true;
    if (this.revealT > 0) return true;
    return false;
  }
  deflectText = 'it is not here... breathe (hold E)';
  nooseVulnerable() { return false; }
  contactDamage() { Game.player.takeHit(this.cx, 'fog'); return true; }
  draw(c, cam, t) {
    const flash = this.flashT > 0;
    const revealed = this.revealT > 0;
    // body flickers with reveal
    c.save();
    if (!revealed) c.globalAlpha = 0.75 + Math.sin(t * 2) * 0.1;
    Art.drawIgnorance(c, this.cx - cam.x, this.y + this.h - cam.y, t, { flash, coreRevealed: revealed });
    c.restore();
    // pulse rings
    if (this._atk === 'pulse' && this.state === 'attack') {
      c.strokeStyle = `rgba(176,160,255,${clamp(1 - this.pulseR / 520, 0.15, 0.8)})`;
      c.lineWidth = 5;
      c.beginPath(); c.arc(this.cx - cam.x, this.y + this.h - cam.y, this.pulseR, Math.PI, Math.PI * 2); c.stroke();
    }
    // fog puffs
    for (const f of this.puffs) {
      c.save(); c.globalAlpha = clamp(f.life, 0, 1) * 0.7;
      Art.drawFog(c, f.x - cam.x, f.y - cam.y, t, f.x);
      c.restore();
    }
    if (this.state === 'telegraph') {
      c.fillStyle = `rgba(176,160,255,${0.3 + Math.sin(t * 24) * 0.2})`;
      c.beginPath(); c.arc(this.cx - cam.x, this.cy - cam.y, 52, 0, Math.PI * 2); c.fill();
    }
  }
}

const BOSS_CLASSES = { ego: EgoBoss, greed: GreedBoss, anger: AngerBoss, attachment: AttachmentBoss, ignorance: IgnoranceBoss };
