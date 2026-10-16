// Draws one room from server snapshots. Same code for the team laptop and the TV grid.
// Characters, bosses and projectiles come from the atlases that server/tools/cut-sheets.mjs cuts out of Jin's sheets
// (assets/sprites/). An entity whose atlas did not load falls back to a coloured box or dot, so the game stays playable
// without the art. Sound follows content/sfx.json and plays from the differences between two snapshots.
window.SaveMartino = (function () {
  const W = 960, H = 540, PLAYER_H = 96; // PLAYER_H mirrors PLAYER.h in server/game/bosses.js
  const ARENAS = { farm: 'assets/arenas/farm.jpg', woods: 'assets/arenas/woods.jpg', venice: 'assets/arenas/venice.jpg' };
  const CHARS = ['euge', 'quentin', 'jin', 'oriana', 'carlos', 'bricciola'], BOSSES = ['nonna', 'peacock', 'martino'];
  const SHEET_FACING = { bricciola: -1, nonna: -1, peacock: -1, martino: -1 }; // fallback when a frame carries no facing of its own
  const COLORS = { euge: 0x1f6fb2, quentin: 0xe2c044, jin: 0xd23a2c, oriana: 0x9b6bd6, carlos: 0x2e8b57, bricciola: 0x8a7f78, nonna: 0xd23a2c, peacock: 0x15797a, martino: 0x4a2e22 };
  const PROJ = { pizza: 0xf2b84a, bolognese: 0xb23a2c, plate: 0xffffff, feather: 0x3db5b0, pigeon: 0x9aa0a6, grill: 0xff7a1a, baguette: 0xd9a030, default: 0xcccccc };
  // projectile kind → frame in the props atlas and in-game width; tumbling ones spin in flight, the others face their direction
  const PROPS = { pizza: ['plate', 30], plate: ['plate', 30], feather: ['feather', 44], baguette: ['baguette', 24], bolognese: ['sauce', 32] };
  const SPIN = { pizza: true, plate: true, baguette: true };
  // a boss attack shows the pose of the pattern that fired (state.boss.move); a windup telegraphs with another pose
  const BOSS_MOVES = { nonna: { pizza: 'throw', plates: 'throw', bolognese: 'special' }, peacock: { feather: 'throw', screech: 'special' }, martino: { howl: 'special' } };
  const WINDUP = { nonna: 'attack', peacock: 'special', martino: 'hero' };
  const FONT = '"Lilita One", system-ui, sans-serif';

  function createRenderer(parent, opts) {
    let latest = null, prev = null, prevAt = 0, latestAt = 0;
    const fxq = []; // game-feel events found between two snapshots, played by the scene on its next frame
    const base = opts.base || '';
    const sfx = createSfx(opts.sfx, !!opts.sound);
    const music = createMusic(opts.music, !!opts.sound, base);
    const scene = {
      preload() {
        for (const k in ARENAS) this.load.image('arena-' + k, base + '/' + ARENAS[k]);
        for (const id of [...CHARS, ...BOSSES, 'props']) this.load.atlas(id, base + '/assets/sprites/' + id + '.png', base + '/assets/sprites/' + id + '.json');
        if (opts.sound) for (const id of sfx.ids) this.load.audio(id, base + '/assets/sfx/' + id + '.mp3');
      },
      create() {
        this.add.rectangle(W / 2, H / 2, W, H, 0x1a252c).setDepth(0);
        this.arena = this.add.image(W / 2, H / 2, '__DEFAULT').setDisplaySize(W, H).setVisible(false).setDepth(0);
        this.ground = this.add.graphics().setDepth(1); // shadows and the grill's heat, under everyone
        this.sprites = new Map(); this.labels = new Map(); this.dirs = new Map();
        this.fx = new Map(); this.bfx = { flashUntil: 0, kx: 0, ghost: 1, hitAt: -1e9, atkAt: -1e9, lastGhost: 0 }; this.ghosts = 0; this.rings = new Map(); this.lastPuff = new Map();
        this.hud = this.add.graphics().setDepth(9001);
        const g = this.make.graphics({ add: false }); g.fillStyle(0xffffff, 1); g.fillCircle(16, 16, 16); g.generateTexture('dot', 32, 32); g.destroy();
        // a swing crescent (opens to the right) and a four-point spark, white so a tint can colour them
        const crescent = (gr, cx, cy, R, T, A, alpha) => {
          const pts = []; for (let i = 0; i <= 16; i++) { const a = -A + 2 * A * i / 16; pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }); }
          for (let i = 16; i >= 0; i--) { const a = -A + 2 * A * i / 16, r = R - T * Math.cos(a / A * Math.PI / 2); pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
          gr.fillStyle(0xffffff, alpha).fillPoints(pts, true);
        };
        const sl = this.make.graphics({ add: false }); crescent(sl, 4, 56, 60, 26, 1.2, 0.35); crescent(sl, 4, 56, 56, 15, 1.15, 1); sl.generateTexture('slash', 68, 112); sl.destroy();
        const st = this.make.graphics({ add: false });
        st.fillStyle(0xffffff, 1).fillPoints([{ x: 12, y: 0 }, { x: 15, y: 9 }, { x: 24, y: 12 }, { x: 15, y: 15 }, { x: 12, y: 24 }, { x: 9, y: 15 }, { x: 0, y: 12 }, { x: 9, y: 9 }], true);
        st.generateTexture('spark', 24, 24); st.destroy();
        // no pigeon on any sheet: a small one drawn here, facing right
        const pg = this.make.graphics({ add: false });
        pg.fillStyle(0x2b2b2b, 1); pg.fillEllipse(22, 18, 34, 22); pg.fillCircle(38, 11, 9);
        pg.fillStyle(0x9aa0a6, 1); pg.fillEllipse(22, 18, 30, 18); pg.fillCircle(38, 11, 7);
        pg.fillStyle(0x6f7a84, 1); pg.fillEllipse(18, 16, 18, 9);
        pg.fillStyle(0xf2a93b, 1); pg.fillTriangle(44, 11, 51, 13, 44, 15);
        pg.fillStyle(0x111111, 1); pg.fillCircle(40, 9, 1.5);
        pg.generateTexture('pigeon', 52, 32); pg.destroy();
        const ui = (t) => t.setDepth(10000);
        this.title = ui(this.add.text(W / 2, 40, '', { fontFamily: 'system-ui', fontSize: '28px', fontStyle: 'bold', color: '#ecf1ee', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5));
        this.sub = ui(this.add.text(W / 2, H / 2, '', { fontFamily: 'system-ui', fontSize: '22px', color: '#ecf1ee', backgroundColor: '#0c1419cc', padding: { x: 18, y: 12 }, wordWrap: { width: 720 }, align: 'center' }).setOrigin(0.5));
        this.bossBar = ui(this.add.graphics());
        this.bossName = ui(this.add.text(W / 2, 62, '', { fontFamily: FONT, fontSize: '22px', color: '#fff1d6', stroke: '#2a0e08', strokeThickness: 6 }).setOrigin(0.5));
        this.clock = ui(this.add.text(W - 16, 12, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ecf1ee', stroke: '#000', strokeThickness: 3 }).setOrigin(1, 0));
        this.bubble = ui(this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '16px', color: '#1a0d0b', backgroundColor: '#f7f7f2', padding: { x: 8, y: 4 }, wordWrap: { width: 260 } }).setOrigin(0.5, 1).setVisible(false));
        this.flash = ui(this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.15).setVisible(false));
        sfx.bind(this); music.bind(this);
        if (opts.sound && opts.onSound) { if (this.sound.locked) this.sound.once('unlocked', () => opts.onSound(true)); else opts.onSound(true); }
      },
      update() {
        if (!latest) return;
        const s = latest, now = performance.now();
        // interpolate between the two latest snapshots for smooth motion at 20 Hz
        const span = Math.max(1, latestAt - prevAt); const k = prev ? Math.min(1, (now - latestAt) / span) : 1;
        const lerp = (a, b) => a + (b - a) * k;
        const g = this.ground; g.clear(); this.bossBar.clear(); this.hud.clear();
        // game feel: hit flashes, damage numbers, shakes and squash, from the events push() found between snapshots
        const sparks = (x, y, dir, n) => { // a burst of gold and white stars from an impact point
          for (let i = 0; i < n; i++) {
            const a = dir ? (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2, d = 40 + Math.random() * 50;
            const c = this.add.image(x, y, 'spark').setDepth(9450).setTint(i % 2 ? 0xffffff : 0xf4b63b).setScale(0.6 + Math.random() * 0.6).setAngle(Math.random() * 90);
            this.tweens.add({ targets: c, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, scale: 0.1, angle: c.angle + 120, duration: 260 + Math.random() * 120, ease: 'Cubic.Out', onComplete: () => c.destroy() });
          }
          const flashStar = this.add.image(x, y, 'spark').setDepth(9451).setScale(1.6);
          this.tweens.add({ targets: flashStar, scale: 3.2, alpha: 0, duration: 140, onComplete: () => flashStar.destroy() });
        };
        const slash = (x, y, dir, tint, size) => {
          const c = this.add.image(x, y, 'slash').setOrigin(0.15, 0.5).setFlipX(dir < 0).setDepth(9300).setTint(tint).setAlpha(0.95).setScale(0.55 * size).setAngle(dir * -25);
          if (dir < 0) c.setOrigin(0.85, 0.5);
          this.tweens.add({ targets: c, scale: 1.05 * size, angle: dir * 20, alpha: 0, duration: 190, ease: 'Quad.Out', onComplete: () => c.destroy() });
        };
        const punch = (z) => { const cam = this.cameras.main; this.tweens.killTweensOf(cam); cam.setZoom(1); this.tweens.add({ targets: cam, zoom: z, duration: 70, yoyo: true, ease: 'Quad.Out' }); };
        while (fxq.length) {
          const e = fxq.shift(), f = (id) => { let v = this.fx.get(id); if (!v) { v = { flashUntil: 0, squashUntil: 0, atkAt: -1e9, hurtAt: -1e9, lastGhost: 0 }; this.fx.set(id, v); } return v; };
          if (e.t === 'boss' && s.boss) {
            // a short white blink with a gap after it, so a boss under three attackers flickers instead of staying a white silhouette
            if (now - this.bfx.flashUntil > 150) this.bfx.flashUntil = now + 55; this.bfx.kx = 9;
            const sp = this.sprites.get('boss'), top = sp ? sp.getBounds().top : s.boss.y - s.boss.h;
            const n = this.add.text(s.boss.x + (Math.random() - 0.5) * 40, top + 20, String(e.dmg), { fontFamily: FONT, fontSize: e.dmg >= 18 ? '34px' : '26px', color: '#f4b63b', stroke: '#2a0e08', strokeThickness: 6 }).setOrigin(0.5).setDepth(9500);
            this.tweens.add({ targets: n, y: n.y - 60, alpha: 0, scale: { from: 1.4, to: 1 }, duration: 750, ease: 'Cubic.Out', onComplete: () => n.destroy() });
            const ring = this.add.circle(s.boss.x - s.boss.facing * 20, s.boss.y - s.boss.h * 0.55, 10).setStrokeStyle(4, 0xffffff).setDepth(9400);
            this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
            if (e.dmg >= 18) this.cameras.main.shake(110, 0.004);
            // sparks fly off the side the hit came from
            this.bfx.hitAt = now;
            let side = -s.boss.facing, best = 1e9;
            for (const p of Object.values(s.players)) { const d = Math.abs(p.x - s.boss.x) + Math.abs(p.y - s.boss.y); if (p.anim !== 'down' && d < best) { best = d; side = Math.sign(p.x - s.boss.x) || side; } }
            sparks(s.boss.x + side * s.boss.w * 0.35, s.boss.y - s.boss.h * 0.5, side, e.dmg >= 18 ? 8 : 5);
          }
          if (e.t === 'bossAtk') this.bfx.atkAt = now;
          if (e.t === 'bossDown' && s.boss) { this.cameras.main.shake(380, 0.012); punch(1.06); sparks(s.boss.x, s.boss.y - s.boss.h * 0.5, 0, 14); }
          if (e.t === 'hurt') { const v = f(e.id); v.flashUntil = now + 110; v.hurtAt = now; this.cameras.main.shake(130, 0.006); }
          if (e.t === 'squash') { // a swing: wind back, lunge, and a crescent in front of the weapon
            const v = f(e.id), p = s.players[e.id]; v.squashUntil = now + 70; v.atkAt = now; v.atkKind = e.kind;
            if (p) slash(p.x + p.facing * 34, p.y - 52, p.facing, e.kind === 'special' ? COLORS[p.char] || 0xffffff : 0xfff6e0, e.kind === 'special' ? 1.35 : 1);
            if (e.kind === 'special') punch(1.03);
          }
          if (e.t === 'shake') this.cameras.main.shake(250, 0.008);
          if (e.t === 'back') { const p = s.players[e.id]; if (p) { const r = this.add.circle(p.x, p.y - 48, 20).setStrokeStyle(5, 0x4fa35a).setDepth(9400); this.tweens.add({ targets: r, scale: 3, alpha: 0, duration: 450, onComplete: () => r.destroy() }); } }
        }
        const ghost = (sp, tint, alpha, dur) => { // a fading copy of a sprite's current frame: afterimages on dashes, lunges and charges
          if (!sp || this.ghosts > 40) return; this.ghosts++;
          const c = this.add.image(sp.x, sp.y, sp.texture.key, sp.frame.name).setOrigin(sp.originX, sp.originY).setFlipX(sp.flipX).setScale(sp.scaleX, sp.scaleY).setAngle(sp.angle).setDepth(sp.depth - 1).setTintFill(tint).setAlpha(alpha);
          this.tweens.add({ targets: c, alpha: 0, duration: dur, onComplete: () => { c.destroy(); this.ghosts--; } });
        };
        const lines = (x, y, h, dir, speed) => { // speed streaks trailing behind a fast mover, on the ground layer so they stay behind sprites
          g.lineStyle(3, 0xffffff, 0.55);
          for (let i = 0; i < 4; i++) { const ly = y - h * (0.2 + i * 0.2) + Math.sin(now / 37 + i * 2) * 4, len = Math.min(110, speed * 0.09) * (0.6 + ((i * 37) % 10) / 20); g.lineBetween(x - dir * 26, ly, x - dir * (26 + len), ly); }
        };
        const lean = (vx, max, top) => Math.max(-max, Math.min(max, vx / top * max)); // tilt into the direction of travel
        const puff = (x, y) => { const c = this.add.ellipse(x, y, 16, 8, 0xf0e6d2, 0.7).setDepth(y - 1); this.tweens.add({ targets: c, scale: 2.4, alpha: 0, x: x + (Math.random() - 0.5) * 20, y: y - 6, duration: 380, onComplete: () => c.destroy() }); };
        const arenaKey = s.boss ? s.boss.arena : 'farm';
        if (this.textures.exists('arena-' + arenaKey)) this.arena.setTexture('arena-' + arenaKey).setDisplaySize(W, H).setVisible(true); else this.arena.setVisible(false);
        const live = new Set(), liveLabels = new Set();
        const walk = Math.floor(now / 130) % 2 ? 'walk2' : 'walk1';

        const label = (id, text, x, y) => {
          let t = this.labels.get(id);
          if (!t) { t = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '14px', color: '#fff1d6', stroke: '#2a0e08', strokeThickness: 4 }).setOrigin(0.5, 1); this.labels.set(id, t); }
          t.setText(text).setPosition(x, y).setDepth(9000).setVisible(true); liveLabels.add(id);
        };
        // one sprite per character or boss: frame from its atlas, feet on (x, y), flipped when it faces away from the pose
        const place = (id, atlas, frame, x, y, facing, h, extra = {}) => {
          if (!this.textures.exists(atlas)) return null;
          const tex = this.textures.get(atlas);
          let sp = this.sprites.get(id);
          if (!sp) { sp = this.add.sprite(x, y, atlas); this.sprites.set(id, sp); }
          if (!tex.has(frame)) frame = 'idle';
          if (sp.texture.key !== atlas) sp.setTexture(atlas, frame); else if (sp.frame.name !== frame) sp.setFrame(frame);
          const cd = sp.frame.customData || {}, pv = cd.pivot || { x: 0.5, y: 1 };
          const flip = facing !== (cd.facing || SHEET_FACING[atlas] || 1);
          sp.setOrigin(flip ? 1 - pv.x : pv.x, 1).setFlipX(flip).setScale(h / tex.get('idle').height);
          sp.setPosition(x + (extra.dx || 0), y).setAngle(extra.angle || 0).setAlpha(extra.alpha ?? 1).setDepth(y).setVisible(true);
          if (extra.tint) sp.setTint(extra.tint); else sp.clearTint();
          live.add(id); return sp;
        };
        // one image per projectile or prop, scaled to a width in game pixels
        const prop = (id, key, frame, x, y, w, extra = {}) => {
          if (!this.textures.exists(key) || (frame && !this.textures.get(key).has(frame))) return null;
          let sp = this.sprites.get(id);
          if (!sp) { sp = this.add.image(x, y, key, frame || undefined); this.sprites.set(id, sp); }
          const pv = (sp.frame.customData && sp.frame.customData.pivot) || { x: 0.5, y: 0.5 };
          sp.setOrigin(pv.x, pv.y).setScale(w / sp.frame.width).setPosition(x, y).setAngle(extra.angle || 0).setFlipX(!!extra.flip).setDepth(extra.depth ?? y).setVisible(true);
          if (extra.tint) sp.setTint(extra.tint); else sp.clearTint();
          live.add(id); return sp;
        };

        const vel = (a, b) => a ? (b.x - a.x) / Math.max(30, span) * 1000 : 0; // px per second between the two snapshots
        for (const [id, p] of Object.entries(s.players)) {
          const pp = prev && prev.players[id]; const x = pp ? lerp(pp.x, p.x) : p.x, y = pp ? lerp(pp.y, p.y) : p.y, vx = vel(pp, p);
          g.fillStyle(0x000000, 0.3); g.fillEllipse(x, y, 50, 14);
          const down = p.anim === 'down';
          const frame = down ? 'hurt' : p.anim === 'walk' ? walk : p.anim;
          const sp = place('p:' + id, p.char, frame, x, y, p.facing, PLAYER_H, down ? { angle: p.facing > 0 ? -80 : 80, alpha: 0.55 } : {});
          if (!sp) drawBox(g, COLORS[p.char] || 0xcccccc, x, y, 48, PLAYER_H, p.facing, p.anim);
          const fx = this.fx.get(id);
          if (sp && !down) { // wind-up and lunge on a swing, breathing at rest, a bounce and lean while walking, afterimages when fast, white when hit
            const k = sp.scaleY, ph = id.length + id.charCodeAt(0);
            const at = fx ? now - fx.atkAt : 1e9, dur = fx && fx.atkKind === 'special' ? 320 : 240;
            if (at < dur) {
              const t = at / dur, reach = fx.atkKind === 'special' ? 22 : 16;
              const push = t < 0.18 ? -0.35 * (t / 0.18) : Math.sin((t - 0.18) / 0.82 * Math.PI) * (1 - (t - 0.18) * 0.5);
              sp.x += p.facing * reach * push; sp.angle += p.facing * 9 * push;
              sp.setScale(k * (1 + 0.1 * Math.max(0, push)), k * (1 - 0.07 * Math.max(0, push) + (t < 0.18 ? 0.04 : 0)));
              if (t > 0.18 && t < 0.5 && now - fx.lastGhost > 40) { fx.lastGhost = now; ghost(sp, fx.atkKind === 'special' ? COLORS[p.char] || 0xffffff : 0xffffff, 0.45, 160); }
            } else if (fx && now < fx.squashUntil) sp.setScale(k * 1.13, k * 0.9);
            else if (p.anim === 'idle') sp.setScale(k * (1 + Math.sin(now / 420 + ph) * 0.006), k * (1 + Math.sin(now / 420 + ph) * 0.016));
            if (p.anim === 'walk') {
              const c = Math.sin(now / 130 * Math.PI), b = Math.abs(c);
              sp.y -= b * 5; sp.angle += lean(vx, 7, 230) + c * 2; sp.setScale(sp.scaleX * (1.03 - b * 0.03), sp.scaleY * (0.97 + b * 0.05));
              if (now - (this.lastPuff.get(id) || 0) > 200) { this.lastPuff.set(id, now); puff(x - p.facing * 12, y); }
            }
            if (Math.abs(vx) > 500) { // a dash: streaks, ghosts and a hard lean
              sp.angle += lean(vx, 14, 900); lines(x, y, PLAYER_H, Math.sign(vx), Math.abs(vx));
              if (fx && now - fx.lastGhost > 30) { fx.lastGhost = now; ghost(sp, COLORS[p.char] || 0xffffff, 0.5, 200); }
            }
            const ht = fx ? now - fx.hurtAt : 1e9;
            if (ht < 260) { // knocked back away from the boss, leaning back
              const away = s.boss ? (Math.sign(x - s.boss.x) || -p.facing) : -p.facing, e = 1 - ht / 260;
              sp.x += away * 14 * e * e; sp.angle += away * 10 * e;
            }
            if (fx && now < fx.flashUntil) sp.setTintFill(0xffffff);
          }
          const top = sp ? sp.getBounds().top : y - PLAYER_H;
          const ly = down ? y - 70 : Math.min(top, y - 24) - 12;
          label('p:' + id, down ? p.name : `${p.name} ${'♥'.repeat(Math.max(0, p.hp))}`, x, ly);
          if (down) { // respawn countdown: a ring that fills up and the seconds left, so nobody thinks they are out
            const left = p.downT || p.down || 0, max = s.respawn || 5, frac = 1 - Math.min(1, left / max), cy = y - 40;
            this.hud.fillStyle(0x13151b, 0.75).fillCircle(x, cy, 25);
            this.hud.lineStyle(6, 0x4fa35a, 1).beginPath().arc(x, cy, 25, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2).strokePath();
            let t = this.rings.get(id); if (!t) { t = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '26px', color: '#fff1d6', stroke: '#2a0e08', strokeThickness: 5, align: 'center' }).setOrigin(0.5).setDepth(9600); this.rings.set(id, t); }
            t.setText(String(Math.max(1, Math.ceil(left)))).setPosition(x, cy).setVisible(true); liveLabels.add('ring:' + id);
            label('pb:' + id, 'BACK IN', x, cy - 28);
          } else {
            const t = this.rings.get(id); if (t) t.setVisible(false);
            // special charge under the name: fills while it recharges, gold and pulsing once SP is ready
            const max = p.cdMax || 10, frac = p.cd > 0 ? 1 - p.cd / max : 1, bw = 46, bx = x - bw / 2, by = ly + 3;
            this.hud.fillStyle(0x13151b, 0.8).fillRect(bx - 2, by - 2, bw + 4, 9);
            if (frac >= 1) { this.hud.fillStyle(0xf4b63b, 0.75 + Math.sin(now / 120) * 0.25).fillRect(bx, by, bw, 5); }
            else this.hud.fillStyle(0x3db5b0, 1).fillRect(bx, by, bw * frac, 5);
          }
        }

        if (s.boss) {
          const b = s.boss, pb = prev && prev.boss && prev.boss.id === b.id ? prev.boss : null; const x = pb ? lerp(pb.x, b.x) : b.x, y = pb ? lerp(pb.y, b.y) : b.y, vx = vel(pb, b);
          g.fillStyle(0x000000, 0.3); g.fillEllipse(x, y, b.w + 10, 18);
          const moves = BOSS_MOVES[b.id] || {};
          const frame = b.anim === 'dead' ? 'defeated' : b.anim === 'windup' ? (WINDUP[b.id] || 'idle') : b.anim === 'intro' ? 'hero'
            : b.anim === 'attack' ? (moves[b.move] || 'attack') : b.anim === 'walk' ? walk : b.anim;
          const windup = b.anim === 'windup';
          this.bfx.kx *= 0.82;
          const sp = place('boss', b.id, frame, x, y, b.facing, b.h, { dx: (windup ? (Math.random() - 0.5) * 10 : 0) - b.facing * this.bfx.kx, tint: windup ? 0xffd080 : 0 });
          if (sp && b.anim !== 'dead') { // lunge into an attack, recoil when hit, a heavy stomp while walking, streaks on a charge
            const k = sp.scaleY, at = now - this.bfx.atkAt, ht = now - this.bfx.hitAt;
            if (at < 360) { const t = at / 360, push = t < 0.25 ? -0.4 * (t / 0.25) : Math.sin((t - 0.25) / 0.75 * Math.PI); sp.x += b.facing * 20 * push; sp.angle += b.facing * 5 * push; sp.setScale(k * (1 + 0.06 * Math.max(0, push)), k * (1 - 0.05 * Math.max(0, push) + (t < 0.25 ? 0.04 : 0))); }
            else if (b.anim === 'idle') sp.setScale(k, k * (1 + Math.sin(now / 520) * 0.014));
            if (ht < 120) { const e = 1 - ht / 120; sp.setScale(sp.scaleX * (1 + 0.07 * e), sp.scaleY * (1 - 0.06 * e)); sp.angle += -b.facing * 3 * e; }
            if (b.anim === 'walk') { const c = Math.sin(now / 160 * Math.PI); sp.y -= Math.abs(c) * 4; sp.angle += lean(vx, 4, 110) + c * 1.5; }
            if (Math.abs(vx) > 300) { sp.angle += lean(vx, 10, 700); lines(x, y, b.h, Math.sign(vx), Math.abs(vx)); if (now - this.bfx.lastGhost > 40) { this.bfx.lastGhost = now; ghost(sp, 0xffffff, 0.4, 220); } }
          }
          if (sp && now < this.bfx.flashUntil) sp.setTintFill(0xffffff);
          if (!sp) drawBox(g, COLORS[b.id] || 0x4a2e22, x, y, b.w, b.h, b.facing, b.anim);
          const w = 520, bx = (W - w) / 2, frac = b.hp / b.maxHp;
          this.bfx.ghost = Math.max(frac, this.bfx.ghost - 0.004); if (this.bfx.ghost < frac || (pb && pb.id !== b.id)) this.bfx.ghost = frac;
          this.bossBar.fillStyle(0x2a0e08, 1).fillRoundedRect(bx - 4, 76, w + 8, 22, 6);
          this.bossBar.fillStyle(0xffffff, 0.45).fillRect(bx, 80, w * this.bfx.ghost, 14);
          this.bossBar.fillStyle(b.phase === 2 ? 0xff7a5c : 0xe2452f, 1).fillRect(bx, 80, w * frac, 14);
          this.bossBar.fillStyle(0xffffff, 0.25).fillRect(bx, 80, w * frac, 4);
          this.bossName.setText(b.name + (b.anim === 'dead' ? ' · defeated' : ''));
          const top = sp ? sp.getBounds().top : y - b.h;
          if (b.say) this.bubble.setText(b.say.text).setPosition(x, top - 10).setVisible(true); else this.bubble.setVisible(false);
        } else { this.bossName.setText(''); this.bubble.setVisible(false); }

        for (const pr of s.projectiles) {
          const pp = prev && prev.projectiles.find(q => q.id === pr.id);
          const x = pp ? lerp(pp.x, pr.x) : pr.x, y = pp ? lerp(pp.y, pr.y) : pr.y, h = pp ? lerp(pp.h || 0, pr.h || 0) : (pr.h || 0);
          const dir = (pp && Math.sign(pr.x - pp.x)) || this.dirs.get(pr.id) || 1; this.dirs.set(pr.id, dir);
          const id = 'pr:' + pr.id;
          if (pr.kind === 'grill') {
            g.fillStyle(PROJ.grill, 0.35); g.fillEllipse(x, y, 180, 60);
            if (!prop(id, 'props', 'grill', x, y, 72, { depth: y })) { g.fillStyle(0x333333, 1); g.fillRect(x - 24, y - 20, 48, 16); }
            continue;
          }
          g.fillStyle(0x000000, 0.25); g.fillEllipse(x, y, 22, 8);
          const [frame, w] = PROPS[pr.kind] || [];
          const sp = frame ? prop(id, 'props', frame, x, y - 40 - h, w, { angle: SPIN[pr.kind] ? (now / 3 + pr.id * 47) % 360 : 0, flip: dir < 0, depth: y })
            : pr.kind === 'pigeon' ? prop(id, 'pigeon', null, x, y - 40 - h, 36, { flip: dir < 0, angle: Math.sin(now / 80 + pr.id) * 8, depth: y }) : null;
          if (!sp) prop(id, 'dot', null, x, y - 40 - h, pr.kind === 'bolognese' ? 28 : 20, { tint: PROJ[pr.kind] || PROJ.default, depth: y });
        }

        for (const [id, sp] of this.sprites) if (!live.has(id)) { sp.destroy(); this.sprites.delete(id); }
        for (const [id, t] of this.labels) if (!liveLabels.has(id)) t.setVisible(false);
        for (const [id, t] of this.rings) if (!liveLabels.has('ring:' + id)) t.setVisible(false);

        // phases (lobby and results details are drawn by the watch page's HTML overlay)
        // the title, story cards and results are HTML screens on top (web/js/screens.js)
        this.title.setText(''); this.sub.setVisible(false);
        this.clock.setText(s.phase === 'fight' ? fmt(s.clock) : '');
        this.flash.setVisible(!!s.stunned);
      }
    };
    const game = new Phaser.Game({ type: Phaser.AUTO, parent, width: W, height: H, backgroundColor: '#1a252c', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, loader: { crossOrigin: 'anonymous' }, scene });
    const feel = (a, b) => {
      if (!a || !b || b.phase !== 'fight' || a.phase !== 'fight') return;
      if (a.boss && b.boss && a.boss.id === b.boss.id && b.boss.hp < a.boss.hp) fxq.push({ t: 'boss', dmg: a.boss.hp - b.boss.hp });
      if (a.boss && b.boss && b.boss.anim === 'attack' && (a.boss.anim !== 'attack' || a.boss.move !== b.boss.move) && (b.boss.move === 'howl' || b.boss.move === 'screech' || b.boss.move === 'plates')) fxq.push({ t: 'shake' });
      if (a.boss && b.boss && b.boss.anim === 'attack' && a.boss.anim !== 'attack') fxq.push({ t: 'bossAtk' });
      if (a.boss && b.boss && a.boss.id === b.boss.id && b.boss.anim === 'dead' && a.boss.anim !== 'dead') fxq.push({ t: 'bossDown' });
      for (const [id, p] of Object.entries(b.players)) {
        const q = a.players[id]; if (!q) continue;
        if (p.hp < q.hp && q.anim !== 'down') fxq.push({ t: 'hurt', id });
        if (p.anim !== q.anim && (p.anim === 'attack' || p.anim === 'special')) fxq.push({ t: 'squash', id, kind: p.anim });
        if (q.anim === 'down' && p.anim !== 'down') fxq.push({ t: 'back', id });
      }
      if (fxq.length > 40) fxq.splice(0, fxq.length - 40);
    };
    return { push(s) { prev = latest; prevAt = latestAt; latest = s; latestAt = performance.now(); sfx.diff(prev, s); music.sync(prev, s); feel(prev, s); }, game };
  }

  // Sound: plays the clip for every change between two snapshots (an attack frame, a landed hit, a phase change), the way
  // content/sfx.json asks: hits loud, specials 0.8, UI stingers 0.6, a random _b variant and a ±5 % pitch so nothing loops.
  function createSfx(manifest, enabled) {
    const ids = ((manifest && manifest.sounds) || []).map(s => s.id), has = new Set(ids), last = new Map();
    let scene = null;
    const play = (id, { volume = 1, pitch = true, min = 0 } = {}) => {
      if (!enabled || !scene || scene.sound.locked || !has.has(id)) return;
      const now = performance.now(); if (now - (last.get(id) || -1e9) < Math.max(min, 60)) return; last.set(id, now);
      scene.sound.play(id, { volume, rate: pitch ? 0.95 + Math.random() * 0.1 : 1 });
    };
    const variant = (id) => has.has(id + '_b') && Math.random() < 0.5 ? id + '_b' : id;
    const bossAttack = (b) => {
      const m = b.move;
      if (b.id === 'nonna') return m === 'bolognese' ? 'nonna_special' : m === 'pizza' || m === 'plates' ? 'nonna_throw' : 'nonna_attack';
      if (b.id === 'peacock') return m === 'feather' ? 'peacock_throw' : m === 'screech' ? 'peacock_special' : 'peacock_attack';
      return m === 'howl' ? 'martino_special' : 'martino_attack';
    };
    return {
      ids, bind(s) { scene = s; },
      diff(a, b) {
        if (!enabled || !a || !b) return;
        if (a.phase !== b.phase) {
          if (b.phase === 'story') play(b.wipes > a.wipes ? 'ui_defeat' : 'ui_card', { volume: 0.6, pitch: false });
          if (b.phase === 'fight') play('ui_boss_intro', { volume: 0.6, pitch: false });
          if (b.phase === 'results') { play('ui_victory', { volume: 0.6, pitch: false }); play('tino_yip', { volume: 0.8 }); }
        }
        if (b.phase === 'lobby' || b.phase === 'results') {
          const ready = (s) => Object.values(s.players).filter(p => p.ready).length;
          if (Object.keys(b.players).length > Object.keys(a.players).length || ready(b) > ready(a)) play('ui_select', { volume: 0.6 });
        }
        for (const [id, p] of Object.entries(b.players)) {
          const q = a.players[id]; if (!q) continue;
          if (p.anim !== q.anim) {
            if (p.anim === 'attack') play(p.char + '_attack', { volume: 0.8, min: 100 });
            if (p.anim === 'special') play(p.char + '_special', { volume: 0.8 });
            if (p.anim === 'hurt') { play(variant('hit_light'), { volume: 1 }); play('hurt_player', { volume: 0.7, min: 150 }); }
            if (p.anim === 'down') play('down_player', { volume: 0.9 });
          }
          if (p.hp > q.hp && q.anim !== 'down') play('heal', { volume: 0.8 }); // a respawn also refills hearts, but from down
        }
        const bb = b.boss, ba = a.boss;
        if (bb && ba && bb.id === ba.id) {
          if (bb.anim !== ba.anim || (bb.anim === 'attack' && bb.move !== ba.move)) {
            if (bb.anim === 'attack') play(bossAttack(bb), { volume: 0.8 });
            if (bb.anim === 'hurt') { play(variant('hit_heavy'), { volume: 1, min: 90 }); play(bb.id + '_hurt', { volume: 0.7, min: 700 }); }
            if (bb.anim === 'dead') { play(bb.id + '_defeat', { volume: 0.8, pitch: false }); if (bb.id === 'martino') play('martino_glasses_crack', { volume: 0.8, pitch: false }); }
            if (ba.anim === 'windup' && bb.anim === 'attack') play(variant('whoosh'), { volume: 0.7 });
          } else if (bb.hp < ba.hp) play(variant('hit_light'), { volume: 0.9, min: 90 }); // hits landing while already in the hurt pose
        }
      }
    };
  }

  // Music: one track per phase from content/music.json (menu in the lobby, one per fight, results once from the ending card on), loaded when it is
  // first needed so the page never fetches all five at once: the fight track loads during the story card before it.
  // Looped when the manifest says so, faded out on a phase change, kept through a wipe's retry card, quiet under the effects.
  function createMusic(manifest, enabled, base) {
    const FIGHT = ['fight_nonna', 'fight_peacock', 'fight_martino'], VOLUME = 0.35;
    const tracks = new Map(((manifest && manifest.tracks) || []).map(t => [t.id, t]));
    const requested = new Set();
    let scene = null, current = null, currentId = null, wanted = null;
    const ensure = (id) => {
      if (!scene || !tracks.has(id) || requested.has(id)) return;
      requested.add(id); scene.load.audio(id, base + '/assets/music/' + id + '.mp3'); scene.load.start();
    };
    const apply = () => {
      if (!scene || scene.sound.locked || wanted === currentId) return;
      if (wanted && !scene.cache.audio.exists(wanted)) return; // still loading: the current track carries on
      if (current) { const old = current; scene.tweens.add({ targets: old, volume: 0, duration: 700, onComplete: () => old.stop() }); current = null; currentId = null; }
      if (wanted) { const t = tracks.get(wanted); current = scene.sound.add(wanted, { loop: !!t.loop, volume: VOLUME }); current.play(); currentId = wanted; }
    };
    return {
      bind(s) { scene = s; if (s.sound.locked) s.sound.once('unlocked', apply); },
      sync(a, b) {
        if (!enabled || !scene || !b) return;
        const act = Math.min(b.act, FIGHT.length - 1);
        if (b.phase === 'lobby') { wanted = 'menu_select'; ensure('menu_select'); ensure(FIGHT[0]); }
        else if (b.phase === 'story' && b.story && b.story.kind === 'ending') { wanted = 'results'; ensure('results'); } // the happy ending runs into the results track
        else if (b.phase === 'story') { ensure(FIGHT[act]); if (!(a && a.phase === 'fight' && b.wipes > a.wipes) && !(a && a.phase === 'story')) wanted = null; }
        else if (b.phase === 'fight') { wanted = FIGHT[act]; ensure(wanted); ensure(act < FIGHT.length - 1 ? FIGHT[act + 1] : 'results'); }
        else if (b.phase === 'results') { if (!a || a.phase !== 'results') wanted = 'results'; ensure('results'); }
        apply();
      }
    };
  }

  function fmt(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }
  // placeholder when an atlas is missing: a box with an eye that shows the facing
  function drawBox(g, c, x, y, w, h, facing, anim) {
    g.fillStyle(anim === 'hurt' ? 0xffffff : anim === 'dead' ? 0x666666 : c, 1); g.fillRect(x - w / 2, y - h, w, h);
    g.fillStyle(0x000000, 0.4); g.fillRect(x + (facing > 0 ? w / 4 : -w / 4 - 8), y - h + 18, 8, 8);
    if (anim === 'attack' || anim === 'special') { g.fillStyle(0xffffff, 0.8); g.fillRect(x + (facing > 0 ? w / 2 : -w / 2 - 36), y - h / 2 - 6, 36, 12); }
  }
  return { createRenderer };
})();
