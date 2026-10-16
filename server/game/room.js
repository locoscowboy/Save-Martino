// One room = one team's run. Lobby → (story → fight) × 3 → results.
// A wipe (everyone down at once) replays the boss from its last checkpoint instead of ending the run.
import { BOSSES, MECHANICS, PLAYER } from './bosses.js';

// Finished runs of every team since the server started, for the scoreboard on the results screen.
export const RUNS = [];
export const MAX_PLAYERS = 3; // teams of three; boss hp is tuned for a full team and scales down below that
const ARENA = { w: 960, h: 540, top: 300, bottom: 520 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const near = (a, b, dx, dy = PLAYER.depthTol) => Math.abs(a.x - b.x) <= dx && Math.abs(a.y - b.y) <= dy;

export class Room {
  constructor(code, { roster, script }) {
    this.code = code; this.roster = roster; this.script = script;
    this.players = new Map(); this.inputs = new Map(); this.hostId = null;
    this.phase = 'lobby'; this.act = 0; this.t = 0; this.clock = 0;
    this.boss = null; this.projectiles = []; this.nextId = 1;
    this.story = null; this.result = null; this.stunUntil = 0;
    this.retry = false; this.wipes = 0;
    this.lastActivity = Date.now();
    this.events = [];
  }

  // ---------- players ----------
  addPlayer(id, { name, char }) {
    if (this.players.size >= MAX_PLAYERS) return false;
    const c = this.roster.find(r => r.id === char) || this.roster[0];
    const n = this.players.size;
    this.players.set(id, { id, name, char: c.id, mechanic: c.mechanic || 'burst', x: 160 + n * 60, y: 380 + (n % 3) * 40,
      facing: 1, anim: 'idle', hp: PLAYER.hp, cd: 0, deaths: 0, dmg: 0, invuln: 0, down: 0, attackT: 0, dashT: 0, dashId: 0, swings: 0, ready: false });
    this.inputs.set(id, { dx: 0, dy: 0, attack: false, special: false, _a: false, _s: false });
    if (!this.hostId) this.hostId = id;
    this.lastActivity = Date.now();
    return true;
  }
  removePlayer(id) {
    this.players.delete(id); this.inputs.delete(id);
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null; // the next player inherits the host role
    this.lastActivity = Date.now();
  }
  setChar(id, char) {
    const p = this.players.get(id), c = this.roster.find(r => r.id === char);
    if (!p || !c || !this.inLobby()) return;
    p.char = c.id; p.mechanic = c.mechanic || 'burst'; this.lastActivity = Date.now();
  }
  setReady(id, ready) { const p = this.players.get(id); if (p) { p.ready = !!ready; this.lastActivity = Date.now(); } }
  setInput(id, inp) {
    const cur = this.inputs.get(id); if (!cur) return;
    cur.dx = clamp(+inp.dx || 0, -1, 1); cur.dy = clamp(+inp.dy || 0, -1, 1);
    // edge-trigger attack/special: fire once per press
    if (inp.attack && !cur._a) cur.attack = true; cur._a = !!inp.attack;
    if (inp.special && !cur._s) cur.special = true; cur._s = !!inp.special;
    this.lastActivity = Date.now();
  }
  idleFor() { return this.players.size ? 0 : (Date.now() - this.lastActivity) / 1000; }
  inLobby() { return this.phase === 'lobby' || this.phase === 'results'; }
  canStart() { return this.inLobby() && this.players.size > 0 && [...this.players.values()].every(p => p.ready); }

  // ---------- flow ----------
  // force skips the ready check (the watch page's Enter key, for the organiser).
  start(force = false) {
    if (!this.inLobby() || (!force && !this.canStart())) return false;
    this.act = 0; this.clock = 0; this.result = null; this.wipes = 0; this.retry = false; this.boss = null;
    for (const p of this.players.values()) { p.deaths = 0; p.dmg = 0; }
    this.beginStory();
    return true;
  }
  // kind: 'act' before each boss, 'ending' after the last one (then results), 'retry' after a wipe
  // page: a card can be split into pages ({ lines: n, seconds }) so a long card is read in parts; lines holds the page's
  // lines (the watch page draws only that page's panels), allLines the whole card and offset where the page starts.
  beginStory(kind = 'act', page = 0) {
    const card = this.script.story[this.act] || { text: '' };
    const all = card.lines || (card.text ? [card.text] : []);
    const pages = Array.isArray(card.pages) && card.pages.length ? card.pages : [{ lines: all.length, seconds: card.seconds || 6 }];
    const pg = pages[Math.min(page, pages.length - 1)], offset = pages.slice(0, page).reduce((n, q) => n + (q.lines || 0), 0);
    const lines = all.slice(offset, offset + (pg.lines || all.length - offset));
    this.phase = 'story'; this.story = { kind, act: this.act, page, pages: pages.length, offset, scene: pg.scene || card.scene || null, lines, allLines: all, text: lines.join(' '), start: this.t, until: this.t + (pg.seconds || card.seconds || 6) };
    this.projectiles = [];
  }
  beginFight() {
    if (this.retry) { // same boss, back to its last checkpoint: full hp, or half once phase 2 was reached. Solo keeps the boss where it was.
      const b = this.boss; this.retry = false;
      if (this.players.size > 1) b.hp = b.phase === 2 ? Math.floor(b.maxHp / 2) : b.maxHp;
      b.timers = {}; b.charge = null; b.windup = null; b.anim = 'idle'; b.hurtT = 0; b.x = 760; b.y = 410; b.facing = -1; b.say = null;
    } else {
      const def = BOSSES[this.act], lines = this.script.bosses[def.id] || {};
      const hp = Math.round(def.hp * clamp(this.players.size / MAX_PLAYERS, 0.25, 1)); // smaller teams face a softer boss; solo takes all the fire
      this.boss = { def, id: def.id, name: def.name, x: 760, y: 410, facing: -1, hp, maxHp: hp, anim: 'intro', phase: 1, introT: 2, attackT: 0, move: null,
        timers: {}, say: { text: lines.intro || '', until: this.t + 3 }, lines, hurtT: 0, charge: null, windup: null, saidHalf: false, lastDashHit: 0 };
    }
    let n = 0;
    for (const p of this.players.values()) { p.x = 160 + n * 60; p.y = 380 + (n % 3) * 40; p.facing = 1; p.hp = PLAYER.hp; p.down = 0; p.invuln = 1; p.dashT = 0; p.attackT = 0; p.anim = 'idle'; n++; }
    this.stunUntil = 0;
    this.phase = 'fight';
  }
  wipe() {
    const b = this.boss; this.wipes += 1; this.retry = true; this.projectiles = [];
    const text = (this.script.retry || 'Everyone is down. {boss} is still standing. Again!').replace('{boss}', b.name);
    this.phase = 'story'; this.story = { kind: 'retry', act: this.act, scene: null, lines: [text], text, start: this.t, until: this.t + 4 };
    b.say = { text: b.lines.wipe || '', until: this.t + 4 }; b.anim = 'idle'; b.charge = null; b.windup = null;
  }
  endFight() {
    this.act += 1;
    if (this.act >= BOSSES.length) { this.boss = null; this.beginStory('ending'); } // Tino turns back, the villa party, then results
    else this.beginStory();
  }
  finishRun() {
    const ps = [...this.players.values()];
    const ranked = [...ps].sort((a, b) => b.dmg - a.dmg || a.deaths - b.deaths);
    const mvp = ranked[0];
    this.result = { time: Math.round(this.clock * 10) / 10, deaths: ps.reduce((s, p) => s + p.deaths, 0), wipes: this.wipes, mvp: mvp ? mvp.name : '', mvpChar: mvp ? mvp.char : '',
      players: ranked.map(p => ({ name: p.name, char: p.char, dmg: p.dmg, deaths: p.deaths })) };
    RUNS.push({ code: this.code, at: Date.now(), ...this.result });
    this.phase = 'results'; this.boss = null; this.projectiles = []; this.story = null;
    for (const p of ps) p.ready = false; // a replay needs everyone ready again
  }

  // ---------- simulation ----------
  step(dt) {
    this.t += dt; this.events = [];
    if (this.phase === 'story') { const st = this.story; if (this.t >= st.until) { if (st.kind !== 'retry' && st.page + 1 < st.pages) this.beginStory(st.kind, st.page + 1); else if (st.kind === 'ending') this.finishRun(); else this.beginFight(); } return this.events; }
    if (this.phase !== 'fight') return this.events;
    this.clock += dt;
    for (const p of this.players.values()) this.stepPlayer(p, this.inputs.get(p.id), dt);
    this.stepBoss(dt);
    this.stepProjectiles(dt);
    const b = this.boss;
    if (b.hp <= 0 && b.anim !== 'dead') { b.anim = 'dead'; b.say = { text: b.lines.defeat || '', until: this.t + 3 }; b.deadAt = this.t; }
    if (b.anim === 'dead') { if (this.t - b.deadAt > 3) this.endFight(); }
    else if (this.players.size && [...this.players.values()].every(p => p.down > 0)) this.wipe();
    return this.events;
  }

  stepPlayer(p, inp, dt) {
    p.cd = Math.max(0, p.cd - dt); p.invuln = Math.max(0, p.invuln - dt);
    if (p.down > 0) { p.down -= dt; p.anim = 'down'; if (p.down <= 0) { p.hp = PLAYER.hp; p.invuln = 2; } return; }
    const stunned = this.t < this.stunUntil;
    if (p.dashT > 0) { p.dashT -= dt; p.x = clamp(p.x + p.facing * MECHANICS.dash.dist / 0.25 * dt, 30, ARENA.w - 30); this.hitBossIf(p, this.boss && near(p, this.boss, 70), MECHANICS.dash.dmg, true); return; }
    if (p.attackT > 0) { p.attackT -= dt; return; }
    if (!stunned && (inp.dx || inp.dy)) {
      const len = Math.hypot(inp.dx, inp.dy) || 1;
      p.x = clamp(p.x + inp.dx / len * PLAYER.speed * dt, 30, ARENA.w - 30);
      p.y = clamp(p.y + inp.dy / len * PLAYER.speed * dt, ARENA.top, ARENA.bottom);
      if (inp.dx) p.facing = inp.dx > 0 ? 1 : -1;
      p.anim = 'walk';
    } else p.anim = 'idle';
    if (inp.attack) {
      inp.attack = false; p.anim = 'attack'; p.attackT = 0.25; p.swings += 1; // swings: every press counts, so the renderer replays the lunge on each one
      const reach = { x: p.x + p.facing * PLAYER.attackReach / 2, y: p.y };
      this.hitBossIf(p, this.boss && near(reach, this.boss, PLAYER.attackReach / 2 + this.boss.def.w / 2), PLAYER.attackDmg);
    }
    if (inp.special) {
      inp.special = false;
      if (p.cd <= 0) {
        const m = MECHANICS[p.mechanic] || MECHANICS.burst; p.cd = m.cooldown; p.anim = 'special'; p.attackT = 0.3; p.swings += 1;
        const said = ((this.script.cast || {})[p.char] || {}).special; if (said) p.say = { text: said, until: this.t + 2.5 }; // the hero shouts the special, like the boss lines
        if (p.mechanic === 'burst') for (let i = 0; i < m.count; i++) this.spawn({ kind: this.roster.find(r => r.id === p.char)?.projectile || 'baguette', x: p.x + p.facing * 30, y: p.y + (i - 1) * 18, vx: p.facing * m.speed, vy: 0, owner: p.id, dmg: m.dmg, ttl: 2 });
        if (p.mechanic === 'slam') this.hitBossIf(p, this.boss && Math.hypot(p.x - this.boss.x, p.y - this.boss.y) < m.radius + this.boss.def.w / 2, m.dmg);
        if (p.mechanic === 'dash') { p.dashT = 0.25; p.invuln = 0.4; p.dashId = this.nextId++; }
        if (p.mechanic === 'heal') {
          p.attackT = m.sit;
          const alive = [...this.players.values()].filter(q => q.down <= 0 && q.hp < PLAYER.hp).sort((a, b) => a.hp - b.hp);
          if (alive[0]) alive[0].hp = Math.min(PLAYER.hp, alive[0].hp + m.hearts);
        }
        if (p.mechanic === 'zone') this.spawn({ kind: 'grill', x: p.x + p.facing * 60, y: p.y, vx: 0, vy: 0, owner: p.id, dmg: m.dmg, every: m.every, tick: 0, radius: m.radius, ttl: m.duration, zone: true });
      }
    }
  }

  // once: a dash lands at most one hit, however many ticks it overlaps the boss
  hitBossIf(p, cond, dmg, once = false) {
    const b = this.boss; if (!b || !cond || b.anim === 'dead') return;
    if (once) { if (b.lastDashHit === p.dashId) return; b.lastDashHit = p.dashId; }
    b.hp -= dmg; p.dmg += dmg; b.anim = 'hurt'; b.hurtT = 0.2;
    if (!b.saidHalf && b.hp <= b.maxHp / 2) { b.saidHalf = true; b.phase = 2; b.say = { text: b.lines.half || '', until: this.t + 3 }; }
  }

  damagePlayer(p, amount = 1) {
    if (p.invuln > 0 || p.down > 0) return;
    p.hp -= amount; p.invuln = PLAYER.invuln; p.anim = 'hurt';
    this.events.push({ type: 'hit', id: p.id });
    if (p.hp <= 0) { p.deaths += 1; p.down = PLAYER.respawn; }
  }

  stepBoss(dt) {
    const b = this.boss; if (!b || b.anim === 'dead') return;
    if (b.introT > 0) { b.introT -= dt; b.anim = 'intro'; return; } // strikes a pose while its intro line shows
    if (b.hurtT > 0) { b.hurtT -= dt; if (b.hurtT <= 0) b.anim = 'idle'; }
    if (b.attackT > 0) { b.attackT -= dt; if (b.attackT <= 0 && b.anim === 'attack') b.anim = 'idle'; }
    const targets = [...this.players.values()].filter(p => p.down <= 0);
    const target = targets[Math.floor(this.t / 2) % Math.max(1, targets.length)];
    if (b.windup) { // telegraph: the boss stands still and shakes, then charges
      b.windup.left -= dt; b.anim = 'windup';
      if (b.windup.left <= 0) { b.charge = { vx: b.facing * b.windup.speed, left: 0.8 }; b.windup = null; b.anim = 'attack'; }
      return;
    }
    if (b.charge) { // charge / lunge in progress
      b.x += b.charge.vx * dt; b.charge.left -= dt;
      for (const p of targets) if (near(p, b, b.def.w / 2 + 20)) this.damagePlayer(p);
      if (b.charge.left <= 0 || b.x < 60 || b.x > ARENA.w - 60) { b.charge = null; b.facing = b.x > ARENA.w / 2 ? -1 : 1; b.anim = 'idle'; }
      return;
    }
    if (target) { // drift toward the target's depth, keep distance
      b.y += clamp(target.y - b.y, -1, 1) * b.def.speed * dt;
      b.facing = target.x < b.x ? -1 : 1;
      if (b.anim === 'idle' || b.anim === 'walk') b.anim = Math.abs(target.y - b.y) > 6 ? 'walk' : 'idle';
    }
    for (const pat of b.def.patterns[b.phase]) {
      b.timers[pat.kind] = (b.timers[pat.kind] ?? pat.every * 0.6) + dt;
      if (b.timers[pat.kind] < pat.every || !target) continue;
      b.timers[pat.kind] = 0; b.anim = 'attack'; b.attackT = 0.45; b.move = pat.kind; // move lets the renderer pick the pose
      this.fire(pat, b, target);
    }
  }

  fire(pat, b, target) {
    const dir = b.facing;
    switch (pat.kind) {
      case 'pizza': case 'feather': case 'pigeons': {
        const n = pat.spread || pat.count || 1;
        for (let i = 0; i < n; i++) this.spawn({ kind: pat.kind === 'pigeons' ? 'pigeon' : pat.kind, x: b.x + dir * 40, y: target.y + (i - (n - 1) / 2) * 30, vx: dir * pat.speed, vy: 0, owner: 'boss', ttl: 3 });
        break;
      }
      case 'bolognese': { // arc to the target's position, splash on landing
        this.spawn({ kind: 'bolognese', x: b.x, y: target.y, tx: target.x, ty: target.y, h: 0, flight: pat.flight, age: 0, splash: pat.splash, owner: 'boss', ttl: pat.flight + 0.3, arc: true });
        break;
      }
      case 'plates': {
        for (let i = 0; i < pat.count; i++) this.spawn({ kind: 'plate', x: 120 + Math.random() * 700, y: ARENA.top + Math.random() * (ARENA.bottom - ARENA.top), h: 400, vh: -500, owner: 'boss', ttl: 1.2, drop: true });
        break;
      }
      case 'charge': case 'lunge': { b.windup = { speed: pat.speed, left: PLAYER.windup }; break; }
      case 'screech': { this.stunUntil = this.t + pat.stun; break; }
      case 'howl': { // shove everyone away from the boss
        for (const p of this.players.values()) p.x = clamp(p.x + (p.x < b.x ? -pat.push : pat.push), 30, ARENA.w - 30);
        break;
      }
    }
  }

  spawn(pr) { pr.id = this.nextId++; this.projectiles.push(pr); }

  stepProjectiles(dt) {
    const b = this.boss;
    for (const pr of this.projectiles) {
      pr.ttl -= dt;
      if (pr.zone) { pr.tick += dt; if (pr.tick >= pr.every) { pr.tick = 0; if (b && b.anim !== 'dead' && Math.hypot(b.x - pr.x, b.y - pr.y) < pr.radius + b.def.w / 2) { const p = this.players.get(pr.owner); if (p) this.hitBossIf(p, true, pr.dmg); } } continue; }
      if (pr.arc) { pr.age += dt; const k = Math.min(1, pr.age / pr.flight); pr.x = pr.x + (pr.tx - pr.x) * (dt / Math.max(0.01, pr.flight - pr.age + dt)); pr.h = Math.sin(k * Math.PI) * 180;
        if (k >= 1 && !pr.landed) { pr.landed = true; for (const p of this.players.values()) if (Math.hypot(p.x - pr.tx, p.y - pr.ty) < pr.splash) this.damagePlayer(p); pr.ttl = 0.3; }
        continue; }
      if (pr.drop) { pr.h += pr.vh * dt; if (pr.h <= 0 && !pr.landed) { pr.landed = true; pr.h = 0; for (const p of this.players.values()) if (near(p, pr, 30)) this.damagePlayer(p); pr.ttl = 0.2; } continue; }
      pr.x += pr.vx * dt; pr.y += (pr.vy || 0) * dt;
      if (pr.owner === 'boss') { for (const p of this.players.values()) if (p.down <= 0 && near(p, pr, PLAYER.w / 2 + 10)) { this.damagePlayer(p); pr.ttl = 0; } }
      else if (b && b.anim !== 'dead' && near(pr, b, b.def.w / 2 + 10)) { const p = this.players.get(pr.owner); if (p) this.hitBossIf(p, true, pr.dmg); pr.ttl = 0; }
      if (pr.x < -40 || pr.x > ARENA.w + 40) pr.ttl = 0;
    }
    this.projectiles = this.projectiles.filter(pr => pr.ttl > 0);
  }

  // ---------- output ----------
  snapshot() {
    const players = {};
    for (const p of this.players.values()) players[p.id] = { name: p.name, char: p.char, x: Math.round(p.x), y: Math.round(p.y), facing: p.facing, anim: p.anim, swings: p.swings, say: p.say && p.say.until > this.t ? p.say.text : null, hp: p.hp, cd: Math.round(p.cd * 10) / 10, cdMax: (MECHANICS[p.mechanic] || MECHANICS.burst).cooldown, deaths: p.deaths, dmg: p.dmg, ready: p.ready, down: p.down > 0 ? Math.ceil(p.down) : 0, downT: p.down > 0 ? Math.round(p.down * 10) / 10 : 0 };
    const b = this.boss;
    return {
      t: Math.round(this.t * 100) / 100, room: this.code, respawn: PLAYER.respawn, code: this.code, host: this.hostId, maxPlayers: MAX_PLAYERS, maxHp: PLAYER.hp, canStart: this.canStart(),
      phase: this.phase, act: this.act,
      story: this.phase === 'story' ? this.story : null,
      players,
      boss: b ? { id: b.id, name: b.name, x: Math.round(b.x), y: Math.round(b.y), facing: b.facing, hp: Math.max(0, b.hp), maxHp: b.maxHp, anim: b.anim, move: b.move, phase: b.phase, w: b.def.w, h: b.def.h, say: b.say && b.say.until > this.t ? b.say : null, arena: b.def.arena } : null,
      projectiles: this.projectiles.map(pr => ({ id: pr.id, kind: pr.kind, x: Math.round(pr.x), y: Math.round(pr.y), h: Math.round(pr.h || 0), owner: pr.owner === 'boss' ? 'boss' : 'player' })),
      clock: Math.round(this.clock * 10) / 10, wipes: this.wipes, result: this.result, stunned: this.t < this.stunUntil,
      board: this.phase === 'results' ? scoreboard(this.code) : null
    };
  }
  summary() {
    return { room: this.code, code: this.code, phase: this.phase, act: this.act, clock: Math.round(this.clock),
      players: [...this.players.values()].map(p => ({ name: p.name, char: p.char, ready: p.ready })), result: this.result };
  }
}

// Fastest finished run per team (the first one that finished), best first; the asking team is always included.
function scoreboard(code) {
  const best = new Map();
  for (const r of RUNS) { const k = r.code + ':' + r.players.map(p => p.name).sort().join(','); const b = best.get(k); if (!b || r.time < b.time) best.set(k, r); }
  const rows = [...best.values()].sort((a, b) => a.time - b.time || a.deaths - b.deaths);
  return rows.slice(0, 8).map((r, i) => ({ rank: i + 1, code: r.code, time: r.time, deaths: r.deaths, wipes: r.wipes, mvp: r.mvp, mvpChar: r.mvpChar,
    team: r.players.map(p => ({ name: p.name, char: p.char })), mine: r.code === code }));
}
