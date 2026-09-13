"use strict";
// ============================================================
// VIGHNAHARTA — entities.js
// ============================================================

// ---------- physics helpers ----------
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}
// Axis-separated movement of a body against a solid list.
// body: {x,y,w,h,vx,vy}. Sets body.onGround, body.hitWall, body.hitCeil.
function moveBody(b, solids, dt) {
  b.onGround = false; b.hitWall = false; b.hitCeil = false;
  // X axis
  let nx = b.x + b.vx * dt;
  const bx = { x: nx, y: b.y, w: b.w, h: b.h };
  for (const s of solids) {
    if (!s.active && s.active !== undefined) continue;
    if (rectsOverlap(bx, s)) {
      if (b.vx > 0) nx = s.x - b.w; else if (b.vx < 0) nx = s.x + s.w;
      b.hitWall = true; b.vx = 0; bx.x = nx;
    }
  }
  b.x = nx;
  // Y axis
  let ny = b.y + b.vy * dt;
  const by = { x: b.x, y: ny, w: b.w, h: b.h };
  for (const s of solids) {
    if (!s.active && s.active !== undefined) continue;
    if (rectsOverlap(by, s)) {
      if (b.vy > 0) { ny = s.y - b.h; b.onGround = true; }
      else if (b.vy < 0) { ny = s.y + s.h; b.hitCeil = true; }
      b.vy = 0; by.y = ny;
    }
  }
  b.y = ny;
}
function onGroundAt(b, solids) { // grounded check with a 2px probe
  const probe = { x: b.x + 2, y: b.y + b.h, w: b.w - 4, h: 2 };
  for (const s of solids) {
    if (!s.active && s.active !== undefined) continue;
    if (rectsOverlap(probe, s)) return s;
  }
  return null;
}
function solidAt(x, y, solids) {
  for (const s of solids) {
    if (!s.active && s.active !== undefined) continue;
    if (pointInRect(x, y, s)) return s;
  }
  return null;
}

// ============================================================
// Breakable barrier
// ============================================================
class Breakable {
  constructor(d) {
    this.type = 'breakable'; this.kind = d.kind;
    this.x = d.x; this.y = d.y - d.h; this.w = d.w; this.h = d.h;
    this.hp = d.kind === 'stone' ? 2 : 1;
    this.alive = true; this.shake = 0;
  }
  get solid() { return this.alive; }
  hit(power, charged, pos) {
    if (!this.alive) return false;
    this.shake = 0.25;
    if (this.kind === 'stone' && !charged) {
      Audio2.play('axestone'); Particles.burst(pos.x, pos.y, 6, { color: '#d8d2c4', spMax: 120, life: 0.3 });
      Particles.text(this.x + this.w / 2, this.y - 8, 'too tough!', '#cfc7b8');
      return false;
    }
    this.hp -= charged ? 2 : 1;
    if (this.hp <= 0) this.break_(pos); else { Audio2.play('axewood'); Particles.burst(pos.x, pos.y, 8, { color: '#8a5a33', spMax: 140 }); }
    return true;
  }
  break_(pos) {
    this.alive = false;
    Audio2.play('shatter');
    const col = this.kind === 'stone' ? '#9a8f7c' : this.kind === 'bush' ? '#4f7942' : '#8a5a33';
    Particles.burst(this.x + this.w / 2, this.y + this.h / 2, 16, { color: col, spMax: 240, life: 0.6, size: 5 });
    // modak drops
    const n = this.kind === 'stone' ? 3 : 2;
    for (let i = 0; i < n; i++) Game.spawnQueue.push({ type: 'modak', x: this.x + this.w / 2 + rnd(-14, 14), y: this.y + rnd(-6, 2), vy: -rnd(150, 300) });
    Game.shake = Math.max(Game.shake, 4);
  }
  update(dt) { this.shake = Math.max(0, this.shake - dt); }
  draw(c, cam, t) {
    if (!this.alive) return;
    const sx = this.shake > 0 ? Math.sin(t * 60) * 2 : 0;
    const x = this.x - cam.x + sx, y = this.y - cam.y;
    if (this.kind === 'wood') {
      c.fillStyle = PAL.wood; c.fillRect(x, y, this.w, this.h);
      c.strokeStyle = PAL.woodDk; c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, this.w - 2, this.h - 2);
      c.beginPath(); c.moveTo(x, y + this.h / 2); c.lineTo(x + this.w, y + this.h / 2); c.stroke();
      c.beginPath(); c.moveTo(x + this.w / 2, y); c.lineTo(x + this.w / 2, y + this.h); c.stroke();
      // crack lines telegraphing breakability
      c.strokeStyle = 'rgba(40,24,12,0.7)';
      c.beginPath(); c.moveTo(x + 6, y + 4); c.lineTo(x + 12, y + 12); c.lineTo(x + 8, y + 18); c.stroke();
    } else if (this.kind === 'stone') {
      c.fillStyle = PAL.stone; c.fillRect(x, y, this.w, this.h);
      c.fillStyle = PAL.stoneDk; c.fillRect(x, y, this.w, 3); c.fillRect(x, y + this.h - 4, this.w, 4);
      // spiral glyph hint (charged smash)
      c.strokeStyle = '#5a4f42'; c.lineWidth = 2;
      c.beginPath();
      for (let a = 0; a < 4.2; a += 0.3) {
        const r = 2 + a * 2.4, px = x + this.w / 2 + Math.cos(a + t * 0.4) * r, py = y + this.h / 2 + Math.sin(a + t * 0.4) * r;
        a === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.25)'; c.strokeRect(x + 2.5, y + 2.5, this.w - 5, this.h - 5);
    } else { // bush
      c.fillStyle = PAL.leaf;
      for (let i = 0; i < 5; i++) {
        const bx = x + this.w * (0.15 + 0.17 * i), by = y + this.h * (0.5 + (i % 2) * 0.2);
        c.beginPath(); c.arc(bx, by, this.h * 0.42, 0, Math.PI * 2); c.fill();
      }
      // thorns
      c.strokeStyle = '#2e4a20'; c.lineWidth = 1.6;
      for (let i = 0; i < 7; i++) {
        const tx = x + 4 + i * (this.w - 8) / 6;
        c.beginPath(); c.moveTo(tx, y + this.h * 0.35); c.lineTo(tx + 3, y - 2); c.stroke();
      }
      c.fillStyle = '#c94f3a'; // berry marker: dangerous
      c.beginPath(); c.arc(x + this.w * 0.3, y + this.h * 0.4, 2, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(x + this.w * 0.7, y + this.h * 0.55, 2, 0, Math.PI * 2); c.fill();
    }
  }
}

// ============================================================
// Pushable block (trunk pushes; floats into water as stepping stone)
// ============================================================
class PushBlock {
  constructor(d) {
    this.type = 'pushblock';
    this.x = d.x; this.y = d.y - TILE * 2; this.w = TILE * 2; this.h = TILE * 2;
    this.vx = 0; this.vy = 0; this.alive = true; this.inWater = false;
  }
  push(dir, power) {
    if (!this.alive || this.inWater) return;
    this.vx = clamp(this.vx + dir * power, -320, 320);
    Particles.burst(this.x + (dir > 0 ? 0 : this.w), this.y + this.h / 2, 3, { color: '#c9b493', spMax: 60, life: 0.3 });
  }
  update(dt, solids, waters) {
    if (!this.alive || this.inWater) return;
    this.vx *= Math.pow(0.02, dt); // heavy friction
    this.vy = Math.min(this.vy + 1500 * dt, 900);
    moveBody(this, solids, dt);
    for (const w of waters) {
      if (this.x + this.w > w.x && this.x < w.x + w.w && this.y + this.h > w.y + 12) {
        // splash → becomes a solid stepping stone
        this.inWater = true;
        Audio2.play('shatter');
        Particles.burst(this.x + this.w / 2, w.y, 14, { color: '#9cc4e0', spMax: 200, up: 60 });
        this.y = w.y + 26;
        Game.level.solids.push({ x: this.x, y: this.y, w: this.w, h: TILE * 1.6, kind: 'wood' });
        Particles.text(this.x + this.w / 2, w.y - 14, 'stepping stone!', '#bfe0f5');
        Game.shake = Math.max(Game.shake, 3);
        break;
      }
    }
  }
  draw(c, cam, t) {
    if (!this.alive) return;
    const x = this.x - cam.x, y = this.y - cam.y;
    c.fillStyle = PAL.wood; c.fillRect(x, y, this.w, this.h);
    c.strokeStyle = PAL.woodDk; c.lineWidth = 3; c.strokeRect(x + 1.5, y + 1.5, this.w - 3, this.h - 3);
    c.beginPath(); c.moveTo(x, y + this.h / 3); c.lineTo(x + this.w, y + this.h / 3); c.stroke();
    c.beginPath(); c.moveTo(x, y + this.h * 2 / 3); c.lineTo(x + this.w, y + this.h * 2 / 3); c.stroke();
    // trunk-push glyph (wind swirl)
    c.strokeStyle = 'rgba(255,220,140,0.6)'; c.lineWidth = 1.6;
    c.beginPath(); c.arc(x + this.w / 2, y + this.h / 2, 6 + Math.sin(t * 3) * 1.5, 0.4, 3.6); c.stroke();
    if (this.inWater) {
      c.fillStyle = 'rgba(58,110,165,0.35)';
      c.fillRect(x, y, this.w, 8);
    }
  }
}

// ============================================================
// Hanging platform → pulled down becomes bridge
// ============================================================
class Hanger {
  constructor(d) {
    this.type = 'hanger';
    this.x = d.x; this.y = d.y; this.w = TILE * 3; this.h = 14;
    this.slotX = d.slotX; this.slotY = d.slotY;
    this.state = 'hang';  // hang | dropping | bridged
    this.dropT = 0; this.grabbable = true;
  }
  onNooseGrab() {
    if (this.state !== 'hang') return false;
    Audio2.play('nooselatch');
    return true;
  }
  onNoosePull() {
    if (this.state !== 'hang') return;
    this.state = 'dropping';
    Audio2.play('gate');
  }
  update(dt) {
    if (this.state === 'dropping') {
      this.dropT += dt;
      // ease into slot with a bounce
      const k = Math.min(this.dropT / 0.7, 1);
      const ease = 1 - Math.pow(1 - k, 3);
      this.y = lerp(this._y0 || (this._y0 = this.y), this.slotY, ease);
      this.x = lerp(this._x0 || (this._x0 = this.x), this.slotX, ease);
      if (k >= 1) {
        this.state = 'bridged';
        Game.shake = Math.max(Game.shake, 5);
        Particles.burst(this.x + this.w / 2, this.y + 8, 12, { color: '#c9b493', spMax: 150 });
        Particles.text(this.x + this.w / 2, this.y - 10, 'bridge restored!', '#ffe9a8');
        Audio2.play('bless');
      }
    }
  }
  draw(c, cam, t) {
    const x = this.x - cam.x, y = this.y - cam.y;
    if (this.state === 'hang') {
      // ropes up to ceiling
      c.strokeStyle = 'rgba(120,90,60,0.9)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x + 10, y); c.lineTo(x + 10, y - 260); c.stroke();
      c.beginPath(); c.moveTo(x + this.w - 10, y); c.lineTo(x + this.w - 10, y - 260); c.stroke();
      // pull-me shimmer
      c.fillStyle = `rgba(255,225,140,${0.25 + Math.sin(t * 4) * 0.15})`;
      c.beginPath(); c.arc(x + this.w / 2, y + 7, 12, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = PAL.wood; c.fillRect(x, y, this.w, this.h);
    c.fillStyle = PAL.woodDk; c.fillRect(x, y + this.h - 3, this.w, 3);
    c.strokeStyle = PAL.woodDk; c.lineWidth = 1.5;
    for (let i = 1; i < 3; i++) { c.beginPath(); c.moveTo(x + i * this.w / 3, y); c.lineTo(x + i * this.w / 3, y + this.h); c.stroke(); }
    if (this.state === 'bridged') {
      c.fillStyle = 'rgba(255,220,130,0.25)';
      c.fillRect(x, y - 2, this.w, 3);
    }
  }
}

// ============================================================
// Pickups
// ============================================================
class Pickup {
  constructor(d) {
    this.type = d.type; this.x = d.x; this.y = d.y;
    this.vx = d.vx || 0; this.vy = d.vy || 0;
    this.w = 18; this.h = 18; this.t = rnd(10);
    this.magnet = false; this.collected = false;
    this.spawnsWithPhysics = d.vy !== undefined;
  }
  update(dt, player, solids) {
    this.t += dt;
    if (this.spawnsWithPhysics) {
      this.vy = Math.min(this.vy + 1400 * dt, 700);
      moveBody(this, solids, dt);
      if (this.onGround) this.spawnsWithPhysics = false;
    }
    const px = player.cx, py = player.cy;
    const d2 = dist2(this.x, this.y, px, py);
    if (d2 < 90 * 90) this.magnet = true;
    if (this.magnet) {
      this.x = lerp(this.x, px, Math.min(1, dt * 8));
      this.y = lerp(this.y, py, Math.min(1, dt * 8));
    }
    if (d2 < 26 * 26 && !this.collected) {
      this.collected = true;
      if (this.type === 'modak') { Game.gainModak(); Audio2.play('pickup'); }
      else { Game.gainFlower(); Audio2.play('flower'); }
      Particles.burst(this.x, this.y, 6, { color: this.type === 'modak' ? '#ffe9a8' : '#ff8a5c', spMax: 90, life: 0.4, size: 3 });
    }
  }
  draw(c, cam) {
    if (this.collected) return;
    const x = this.x - cam.x, y = this.y - cam.y;
    this.type === 'modak' ? Art.drawModak(c, x, y, this.t) : Art.drawFlower(c, x, y, this.t);
  }
}

// ============================================================
// NPC (villager / priest / kid) with dialogue + rescue blessing
// ============================================================
class NPC {
  constructor(d) {
    this.type = 'npc'; this.x = d.x; this.y = d.y;
    this.w = 26; this.h = 62;
    this.name = d.name; this.lines = d.lines; this.kind = d.kind;
    this.rescued = Game.save.rescues[Game.levelId + ':' + d.name];
    this.t = rnd(10); this.dir = -1;
    this.talkT = 0;
  }
  interact() { Game.openDialog(this); }
  update(dt) {
    this.t += dt; this.talkT = Math.max(0, this.talkT - dt);
    const p = Game.player;
    if (p) this.dir = p.cx > this.x ? 1 : -1;
  }
  draw(c, cam) {
    const cheer = this.rescued && this.talkT > 0;
    Art.drawVillager(c, this.x - cam.x, this.y - cam.y, this.t, {
      dir: this.dir, seed: this.x * 0.01, cheer,
      robe: this.kind === 'priest' ? '#c98a2a' : (this.x % 3 < 1 ? '#7a6aa8' : this.x % 3 < 2 ? '#5f8a6a' : '#a85f5f'),
      hope: this.rescued,
    });
    if (!this.rescued) {
      // golden "!" — needs help
      const yy = this.y - 78 - cam.y + Math.sin(this.t * 3) * 3;
      Particles.hint || (Particles.hint = 0);
      c.save();
      c.fillStyle = PAL.gold; c.font = 'bold 22px Georgia'; c.textAlign = 'center';
      c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 4;
      c.strokeText('!', this.x - cam.x, yy); c.fillText('!', this.x - cam.x, yy);
      c.restore();
    }
  }
}

// ============================================================
// Bell / Lamp / Flag (interactives)
// ============================================================
class Bell {
  constructor(d) { this.type = 'bell'; this.x = d.x; this.y = d.y; this.rung = 0; this.cd = 0; }
  interact() { this.ring(); }
  ring() {
    if (this.cd > 0) return;
    this.cd = 1.2; this.rung = 1;
    Audio2.bell(880, 1.6, 0.4); Audio2.bell(1320, 1.2, 0.2);
    Game.player && Game.player.restoreStamina(35);
    Particles.text(this.x, this.y - 20, '+stamina', '#ffe9a8');
    Particles.burst(this.x, this.y + 6, 8, { color: '#ffe9a8', spMax: 80, g: -40 });
  }
  update(dt) { this.rung = Math.max(0, this.rung - dt * 0.8); this.cd = Math.max(0, this.cd - dt); }
  draw(c, cam, t) { Art.drawBell(c, this.x - cam.x, this.y - cam.y, t, this.rung); }
}
class Lamp {
  constructor(d) { this.type = 'lamp'; this.x = d.x; this.y = d.y; this.lit = false; }
  interact() {
    if (this.lit) return;
    this.lit = true;
    Audio2.play('bless');
    Game.setCheckpoint(this.x, this.y - 60);
    Particles.text(this.x, this.y - 26, 'checkpoint', '#ffe9a8');
    Particles.burst(this.x, this.y - 8, 10, { color: '#ffca6a', spMax: 60, g: -80, life: 0.8 });
  }
  update(dt) {}
  draw(c, cam, t) { Art.drawLamp(c, this.x - cam.x, this.y - cam.y, t, this.lit); }
}
class Flag {
  constructor(d) { this.type = 'flag'; this.x = d.x; this.y = d.y; this.raised = false; }
  interact() {
    if (this.raised) return;
    this.raised = true;
    Audio2.play('bless'); Audio2.play('ringping');
    Game.gainFlower(2);
    Particles.text(this.x, this.y - 50, '+2 flowers', '#ff8a5c');
    Particles.burst(this.x + 16, this.y - 34, 10, { color: '#ff9933', spMax: 90, g: 120 });
  }
  update(dt) {}
  draw(c, cam, t) { Art.drawFlag(c, this.x - cam.x, this.y - cam.y, t, this.raised); }
}

// ============================================================
// Noose ring (swing point)
// ============================================================
class Ring {
  constructor(d) {
    this.type = 'ring'; this.x = d.x; this.y = d.y;
    this.latched = false; this.ropeLen = 0;
  }
  onNooseGrab(player) {
    this.latched = true;
    this.ropeLen = Math.hypot(player.cx - this.x, player.cy - this.y);
    Audio2.play('nooselatch'); Audio2.play('ringping');
    Particles.ring(this.x, this.y, '#ffe9a8');
    return true;
  }
  release() { this.latched = false; }
  update(dt) {}
  draw(c, cam, t) {
    const x = this.x - cam.x, y = this.y - cam.y;
    const g = c.createRadialGradient(x, y, 2, x, y, 24);
    g.addColorStop(0, `rgba(255,225,140,${this.latched ? 0.5 : 0.3 + Math.sin(t * 3) * 0.1})`);
    g.addColorStop(1, 'rgba(255,225,140,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 24, 0, Math.PI * 2); c.fill();
    c.strokeStyle = PAL.gold; c.lineWidth = 4;
    c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#8a6d1f'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(x, y, 13, 0, Math.PI * 2); c.stroke();
  }
}

// ============================================================
// Switch (noose target) + Gate
// ============================================================
class Switch {
  constructor(d) {
    this.type = 'switch'; this.x = d.x; this.y = d.y;
    this.gateId = d.gateId; this.pulled = false; this.flash = 0; this.grabbable = true;
  }
  onNooseGrab() { Audio2.play('nooselatch'); return true; }
  onNoosePull() {
    if (this.pulled) return;
    this.pulled = true; this.flash = 1;
    Audio2.play('gate'); Audio2.play('bless');
    Game.openGate(this.gateId);
    Particles.text(this.x, this.y - 18, 'the way opens', '#ffe9a8');
  }
  update(dt) { this.flash = Math.max(0, this.flash - dt); }
  draw(c, cam, t) {
    const x = this.x - cam.x, y = this.y - cam.y;
    // bracket
    c.fillStyle = '#6e5a40'; c.fillRect(x - 8, y - 14, 16, 28);
    // lever handle rotates when pulled
    c.save(); c.translate(x, y); c.rotate(this.pulled ? 0.9 : -0.5);
    c.strokeStyle = PAL.woodDk; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -14); c.stroke();
    c.fillStyle = this.pulled ? PAL.gold : '#c0392b';
    c.beginPath(); c.arc(0, -15, 4.5, 0, Math.PI * 2); c.fill();
    c.restore();
    if (this.flash > 0) {
      c.fillStyle = `rgba(255,235,160,${this.flash * 0.5})`;
      c.beginPath(); c.arc(x, y, 26 * (1 - this.flash) + 12, 0, Math.PI * 2); c.fill();
    }
    // glint to attract eye
    const gl = (t * 2) % 2;
    if (gl < 0.2 && !this.pulled) {
      c.fillStyle = `rgba(255,255,255,${1 - gl * 5})`;
      c.beginPath(); c.arc(x + 10, y - 20, 2, 0, Math.PI * 2); c.fill();
    }
  }
}
class Gate {
  constructor(d) {
    this.type = 'gate'; this.id = d.id;
    this.x = d.x; this.y = d.y; this.w = d.w; this.h = d.h;
    this.openT = 0; this.opening = false;
    this.solidRef = { x: d.x, y: d.y, w: d.w, h: d.h, kind: 'gate', active: true };
  }
  open() { if (!this.opening) { this.opening = true; } }
  update(dt) {
    if (this.opening && this.openT < 1) {
      this.openT = Math.min(1, this.openT + dt * 0.9);
      this.solidRef.active = this.openT < 0.45;
    }
  }
  draw(c, cam, t) {
    Art.drawGate(c, this.x - cam.x, this.y - cam.y, this.w, this.h, this.openT);
  }
}

// ============================================================
// Arrogant guard (patrol / alert / staggered)
// ============================================================
class Guard {
  constructor(d) {
    this.type = 'guard'; this.x = d.x; this.y = d.y;
    this.w = 30; this.h = 64; this.vx = 0; this.vy = 0;
    this.x1 = d.x; this.x2 = d.x2; this.dir = 1;
    this.state = 'patrol'; this.t = rnd(10); this.stagger = 0;
    this.alert = 0; this.onGround = false;
  }
  hit(fromPos) {
    // can't be killed — humbled instead
    this.stagger = 1.4;
    this.vx = (this.cx > fromPos.x ? 1 : -1) * 260;
    Audio2.play('guardhit');
    Particles.text(this.cx, this.y - 14, '"hey!"', '#e8d8c0');
    Particles.burst(this.cx, this.y - 30, 8, { color: '#d8cfc0', spMax: 120 });
  }
  trunkPush(dir, power) {
    if (this.state === 'stagger') return;
    this.stagger = Math.max(this.stagger, 0.8);
    this.vx = dir * power * 1.4;
    Audio2.play('guardhit');
  }
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  update(dt, player, solids) {
    this.t += dt;
    this.stagger = Math.max(0, this.stagger - dt);
    this.vy = Math.min(this.vy + 1500 * dt, 900);
    const wasState = this.state;
    if (this.stagger > 0) this.state = 'stagger';
    else {
      // detection: facing player, within 170px, similar height, player not dashing
      const dx = player.cx - this.cx, dy = player.cy - this.cy;
      const seen = Math.abs(dx) < 180 && Math.abs(dy) < 90 && Math.sign(dx) === this.dir && !player.dashing && player.hurtT <= 0;
      if (seen) {
        this.state = 'alert'; this.alert = Math.min(1, this.alert + dt * 3);
        this.dir = Math.sign(dx) || this.dir;
        this.vx = approach(this.vx, Math.sign(dx) * 90, 600 * dt);
      } else {
        this.alert = Math.max(0, this.alert - dt);
        if (this.state === 'alert' && this.alert <= 0) this.state = 'patrol';
        if (this.state !== 'alert') {
          this.state = 'patrol';
          // pace between posts
          if (this.x < this.x1) this.dir = 1;
          if (this.x + this.w > this.x2) this.dir = -1;
          this.vx = approach(this.vx, this.dir * 45, 300 * dt);
        }
      }
    }
    moveBody(this, solids, dt);
    if (this.hitWall && this.state === 'patrol') this.dir *= -1;
    // contact shove (alert only)
    if (this.state === 'alert' && rectsOverlap(this, player.body) && player.hurtT <= 0) {
      player.takeHit(this.cx, 'shove');
    }
  }
  draw(c, cam) {
    Art.drawGuard(c, this.cx - cam.x, this.y + this.h - cam.y, this.t, {
      dir: this.dir, seed: this.x * 0.01,
      boss: false, staggered: this.stagger > 0,
    });
    if (this.alert > 0.2 && this.state === 'alert') {
      c.fillStyle = `rgba(255,80,60,${this.alert})`;
      c.font = 'bold 20px Georgia'; c.textAlign = 'center';
      c.fillText('!', this.cx - cam.x, this.y - 16 - cam.y);
    }
  }
}

// ============================================================
// Fog of ignorance
// ============================================================
class Fog {
  constructor(d) {
    this.type = 'fog'; this.x = d.x; this.y = d.y; this.w = d.w; this.h = d.h;
    this.seed = rnd(100); this.alive = true; this.clearT = 0;
  }
  bless() {
    if (!this.alive) return false;
    this.alive = false; this.clearT = 1;
    Audio2.play('fog');
    Particles.burst(this.x + this.w / 2, this.y + this.h / 2, 20, { color: '#ffe9a8', spMax: 160, g: -60, life: 1.0, size: 6 });
    Game.fogCleared++;
    return true;
  }
  update(dt) { this.clearT = Math.max(0, this.clearT - dt * 0.5); }
  draw(c, cam, t) {
    if (!this.alive) {
      if (this.clearT > 0) {
        c.save(); c.globalAlpha = this.clearT;
        Art.drawFog(c, this.x + this.w / 2 - cam.x, this.y + this.h / 2 - cam.y, t, this.seed);
        c.restore();
      }
      return;
    }
    // dense overlapping clouds
    for (let i = 0; i < 4; i++) {
      Art.drawFog(c, this.x + this.w * (0.2 + 0.2 * i) - cam.x + Math.sin(t * 0.6 + i * 2) * 12,
        this.y + this.h * (0.3 + 0.2 * (i % 2)) - cam.y, t, this.seed + i * 13);
    }
    // eyes of ignorance inside fog
    const ex = this.x + this.w / 2 - cam.x, ey = this.y + this.h * 0.35 - cam.y;
    c.strokeStyle = 'rgba(30,25,35,0.55)'; c.lineWidth = 2.5;
    c.beginPath(); c.arc(ex - 14, ey, 5, 0.2, Math.PI - 0.2); c.stroke();
    c.beginPath(); c.arc(ex + 14, ey, 5, 0.2, Math.PI - 0.2); c.stroke();
  }
}

// ============================================================
// Water zone
// ============================================================
class Water {
  constructor(d) { this.type = 'water'; this.x = d.x; this.y = d.y; this.w = d.w; this.h = d.h; }
  update(dt) {}
  draw(c, cam, t) { Art.drawWater(c, this.x - cam.x, this.y - cam.y, this.w, t); }
}

// ============================================================
// Sign, Portal, Shrine, Exit
// ============================================================
class Sign {
  constructor(d) { this.type = 'sign'; this.x = d.x; this.y = d.y; this.text = d.text; }
  update(dt) {}
  draw(c, cam, t) {
    const x = this.x - cam.x, y = this.y - cam.y;
    c.strokeStyle = '#6e4a2a'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 26); c.stroke();
    c.fillStyle = '#8a6a42'; c.fillRect(x - 14, y - 40, 28, 16);
    c.strokeStyle = '#5f4526'; c.lineWidth = 1.5; c.strokeRect(x - 14, y - 40, 28, 16);
    c.fillStyle = '#3a2a1a';
    c.beginPath(); c.arc(x, y - 32, 2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x - 5, y - 32, 2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 5, y - 32, 2, 0, Math.PI * 2); c.fill();
  }
}
class Portal {
  constructor(d) {
    this.type = 'portal'; this.x = d.x; this.y = d.y; this.level = d.level; this.name = d.name;
  }
  get unlocked() { return Game.save.unlocked >= this.level; }
  interact() {
    if (this.unlocked) Game.startLevel(this.level);
    else { Audio2.play('uiclick'); Particles.text(this.x, this.y - 60, 'defeat the previous demon first', '#cfc7b8'); }
  }
  update(dt) {}
  draw(c, cam, t) {
    const x = this.x - cam.x, y = this.y - cam.y;
    const glow = this.unlocked ? 0.5 + Math.sin(t * 2.4 + this.level) * 0.2 : 0.12;
    // arch
    c.fillStyle = '#5f3d22';
    c.beginPath(); c.moveTo(x - 26, y); c.lineTo(x - 26, y - 64); c.arc(x, y - 64, 26, Math.PI, 0); c.lineTo(x + 26, y); c.closePath(); c.fill();
    c.fillStyle = `rgba(255,205,110,${glow * 0.5})`;
    c.beginPath(); c.moveTo(x - 18, y); c.lineTo(x - 18, y - 60); c.arc(x, y - 60, 18, Math.PI, 0); c.lineTo(x + 18, y); c.closePath(); c.fill();
    // level number medallion
    c.fillStyle = this.unlocked ? PAL.gold : '#6a5a48';
    c.beginPath(); c.arc(x, y - 84, 12, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2a1a12'; c.font = 'bold 15px Georgia'; c.textAlign = 'center';
    c.fillText(this.unlocked ? String(this.level) : '🔒'.length ? String(this.level) : '?', x, y - 79);
    if (!this.unlocked) {
      c.strokeStyle = '#2a1a12'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y - 84, 5, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#2a1a12'; c.fillRect(x - 1.5, y - 84, 3, 7);
    }
    c.fillStyle = this.unlocked ? '#ffe9a8' : '#a08a70';
    c.font = '13px Georgia'; c.textAlign = 'center';
    c.fillText(this.name, x, y + 18);
  }
}
class Shrine {
  constructor(d) { this.type = 'shrine'; this.x = d.x; this.y = d.y; }
  interact() { Game.openShrineShop(); }
  update(dt) {}
  draw(c, cam, t) { Art.drawShrineProp(c, this.x - cam.x, this.y - cam.y, t, true); }
}
class ExitDoor {
  constructor(d) {
    this.type = 'exit'; this.x = d.x; this.y = d.y;
    this.used = false;
  }
  update(dt) {}
  draw(c, cam, t) {
    const x = this.x - cam.x, y = this.y - cam.y;
    // glowing sanctum arch
    const g = c.createRadialGradient(x, y - 40, 4, x, y - 40, 60);
    g.addColorStop(0, 'rgba(255,235,170,0.8)'); g.addColorStop(1, 'rgba(255,235,170,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y - 40, 60, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#4a3018';
    c.beginPath(); c.moveTo(x - 22, y); c.lineTo(x - 22, y - 56); c.arc(x, y - 56, 22, Math.PI, 0); c.lineTo(x + 22, y); c.closePath(); c.fill();
    c.fillStyle = `rgba(255,225,140,${0.5 + Math.sin(t * 3) * 0.2})`;
    c.beginPath(); c.moveTo(x - 14, y); c.lineTo(x - 14, y - 52); c.arc(x, y - 52, 14, Math.PI, 0); c.lineTo(x + 14, y); c.closePath(); c.fill();
    // om symbol
    c.fillStyle = '#6a2a10'; c.font = 'bold 16px Georgia'; c.textAlign = 'center';
    c.fillText('ॐ', x, y - 38);
  }
}
