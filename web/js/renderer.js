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

  function createRenderer(parent, opts) {
    let latest = null, prev = null, prevAt = 0, latestAt = 0;
    const base = opts.base || '';
    const sfx = createSfx(opts.sfx, !!opts.sound);
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
        const g = this.make.graphics({ add: false }); g.fillStyle(0xffffff, 1); g.fillCircle(16, 16, 16); g.generateTexture('dot', 32, 32); g.destroy();
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
        this.bossName = ui(this.add.text(W / 2, 70, '', { fontFamily: 'system-ui', fontSize: '16px', color: '#ecf1ee', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5));
        this.clock = ui(this.add.text(W - 16, 12, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ecf1ee', stroke: '#000', strokeThickness: 3 }).setOrigin(1, 0));
        this.bubble = ui(this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '16px', color: '#1a0d0b', backgroundColor: '#f7f7f2', padding: { x: 8, y: 4 }, wordWrap: { width: 260 } }).setOrigin(0.5, 1).setVisible(false));
        this.flash = ui(this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.15).setVisible(false));
        sfx.bind(this);
        if (opts.sound && opts.onSound) { if (this.sound.locked) this.sound.once('unlocked', () => opts.onSound(true)); else opts.onSound(true); }
      },
      update() {
        if (!latest) return;
        const s = latest, now = performance.now();
        // interpolate between the two latest snapshots for smooth motion at 20 Hz
        const span = Math.max(1, latestAt - prevAt); const k = prev ? Math.min(1, (now - latestAt) / span) : 1;
        const lerp = (a, b) => a + (b - a) * k;
        const g = this.ground; g.clear(); this.bossBar.clear();
        const arenaKey = s.boss ? s.boss.arena : 'farm';
        if (this.textures.exists('arena-' + arenaKey)) this.arena.setTexture('arena-' + arenaKey).setDisplaySize(W, H).setVisible(true); else this.arena.setVisible(false);
        const live = new Set(), liveLabels = new Set();
        const walk = Math.floor(now / 160) % 2 ? 'walk2' : 'walk1';

        const label = (id, text, x, y) => {
          let t = this.labels.get(id);
          if (!t) { t = this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '13px', color: '#ecf1ee', backgroundColor: '#0008', padding: { x: 4, y: 2 } }).setOrigin(0.5, 1); this.labels.set(id, t); }
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

        for (const [id, p] of Object.entries(s.players)) {
          const pp = prev && prev.players[id]; const x = pp ? lerp(pp.x, p.x) : p.x, y = pp ? lerp(pp.y, p.y) : p.y;
          g.fillStyle(0x000000, 0.3); g.fillEllipse(x, y, 50, 14);
          const down = p.anim === 'down';
          const frame = down ? 'hurt' : p.anim === 'walk' ? walk : p.anim;
          const sp = place('p:' + id, p.char, frame, x, y, p.facing, PLAYER_H, down ? { angle: p.facing > 0 ? -80 : 80, alpha: 0.9 } : {});
          if (!sp) drawBox(g, COLORS[p.char] || 0xcccccc, x, y, 48, PLAYER_H, p.facing, p.anim);
          const top = sp ? sp.getBounds().top : y - PLAYER_H;
          label('p:' + id, down ? `${p.name} ✕ ${p.down || ''}` : `${p.name} ${'♥'.repeat(Math.max(0, p.hp))}`, x, Math.min(top, y - 24) - 6);
        }

        if (s.boss) {
          const b = s.boss, pb = prev && prev.boss; const x = pb ? lerp(pb.x, b.x) : b.x, y = pb ? lerp(pb.y, b.y) : b.y;
          g.fillStyle(0x000000, 0.3); g.fillEllipse(x, y, b.w + 10, 18);
          const moves = BOSS_MOVES[b.id] || {};
          const frame = b.anim === 'dead' ? 'defeated' : b.anim === 'windup' ? (WINDUP[b.id] || 'idle') : b.anim === 'intro' ? 'hero'
            : b.anim === 'attack' ? (moves[b.move] || 'attack') : b.anim === 'walk' ? walk : b.anim;
          const windup = b.anim === 'windup';
          const sp = place('boss', b.id, frame, x, y, b.facing, b.h, { dx: windup ? (Math.random() - 0.5) * 10 : 0, tint: windup ? 0xffd080 : 0 });
          if (!sp) drawBox(g, COLORS[b.id] || 0x4a2e22, x, y, b.w, b.h, b.facing, b.anim);
          const w = 520, bx = (W - w) / 2;
          this.bossBar.fillStyle(0x000000, 0.6).fillRect(bx, 80, w, 14); this.bossBar.fillStyle(b.phase === 2 ? 0xf05a4c : 0xd23a2c, 1).fillRect(bx, 80, w * b.hp / b.maxHp, 14);
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

        if (s.phase === 'results') place('tino', 'martino', 'tino', W / 2, 440, 1, 70);
        for (const [id, sp] of this.sprites) if (!live.has(id)) { sp.destroy(); this.sprites.delete(id); }
        for (const [id, t] of this.labels) if (!liveLabels.has(id)) t.setVisible(false);

        // phases (lobby and results details are drawn by the watch page's HTML overlay)
        this.title.setText(s.phase === 'results' ? 'Martino saved!' : '');
        this.sub.setText(s.phase === 'story' && s.story ? s.story.text : '').setVisible(s.phase === 'story' && !!s.story);
        this.clock.setText(s.phase === 'fight' ? fmt(s.clock) : '');
        this.flash.setVisible(!!s.stunned);
      }
    };
    const game = new Phaser.Game({ type: Phaser.AUTO, parent, width: W, height: H, backgroundColor: '#1a252c', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, loader: { crossOrigin: 'anonymous' }, scene });
    return { push(s) { prev = latest; prevAt = latestAt; latest = s; latestAt = performance.now(); sfx.diff(prev, s); }, game };
  }

  // Sound: plays the clip for every change between two snapshots (an attack frame, a landed hit, a phase change), the way
  // content/sfx.json asks: hits loud, specials 0.8, UI stingers 0.6, a random _b variant and a ±5 % pitch so nothing loops.
  function createSfx(manifest, enabled) {
    const ids = ((manifest && manifest.sounds) || []).map(s => s.id), has = new Set(ids), last = new Map();
    let scene = null;
    const play = (id, { volume = 1, pitch = true, min = 0 } = {}) => {
      if (!enabled || !scene || !has.has(id)) return;
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

  function fmt(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }
  // placeholder when an atlas is missing: a box with an eye that shows the facing
  function drawBox(g, c, x, y, w, h, facing, anim) {
    g.fillStyle(anim === 'hurt' ? 0xffffff : anim === 'dead' ? 0x666666 : c, 1); g.fillRect(x - w / 2, y - h, w, h);
    g.fillStyle(0x000000, 0.4); g.fillRect(x + (facing > 0 ? w / 4 : -w / 4 - 8), y - h + 18, 8, 8);
    if (anim === 'attack' || anim === 'special') { g.fillStyle(0xffffff, 0.8); g.fillRect(x + (facing > 0 ? w / 2 : -w / 2 - 36), y - h / 2 - 6, 36, 12); }
  }
  return { createRenderer };
})();
