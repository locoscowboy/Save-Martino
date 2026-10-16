// Draws one room from server snapshots. Same code for the team laptop and the TV grid.
// Characters and bosses come from the atlases that server/tools/cut-sheets.mjs cuts out of Jin's sheets (assets/sprites/).
// An entity whose atlas did not load falls back to a coloured box, so the game stays playable without the art.
window.SaveMartino = (function () {
  const W = 960, H = 540, PLAYER_H = 96; // PLAYER_H mirrors PLAYER.h in server/game/bosses.js
  const ARENAS = { farm: 'assets/arenas/farm.jpg', woods: 'assets/arenas/woods.jpg', venice: 'assets/arenas/venice.jpg' };
  const CHARS = ['euge', 'quentin', 'jin', 'oriana', 'carlos', 'bricciola'], BOSSES = ['nonna', 'peacock', 'martino'];
  const SHEET_FACING = { bricciola: -1, nonna: -1, peacock: -1, martino: -1 }; // which way the sheet's action row looks; the others look right
  const COLORS = { euge: 0x1f6fb2, quentin: 0xe2c044, jin: 0xd23a2c, oriana: 0x9b6bd6, carlos: 0x2e8b57, bricciola: 0x8a7f78, nonna: 0xd23a2c, peacock: 0x15797a, martino: 0x4a2e22 };
  const PROJ = { pizza: 0xf2b84a, bolognese: 0xb23a2c, plate: 0xffffff, feather: 0x3db5b0, pigeon: 0x9aa0a6, bite: 0x7a3b2e, grill: 0xff7a1a, baguette: 0xd9a030, chopstick: 0x8b5a2b, splash: 0x5fb6e6, om: 0x9b6bd6, ember: 0xff7a1a, default: 0xcccccc };
  // a boss attack shows the pose of the pattern that fired (state.boss.move); a windup telegraphs with another pose
  const BOSS_MOVES = { nonna: { pizza: 'throw', plates: 'throw', bolognese: 'special' }, peacock: { feather: 'throw', screech: 'special' }, martino: { howl: 'special' } };
  const WINDUP = { nonna: 'attack', peacock: 'special', martino: 'hero' };

  function createRenderer(parent, opts) {
    let latest = null, prev = null, prevAt = 0, latestAt = 0;
    const base = opts.base || '';
    const scene = {
      preload() {
        for (const k in ARENAS) this.load.image('arena-' + k, base + '/' + ARENAS[k]);
        for (const id of [...CHARS, ...BOSSES]) this.load.atlas(id, base + '/assets/sprites/' + id + '.png', base + '/assets/sprites/' + id + '.json');
      },
      create() {
        this.add.rectangle(W / 2, H / 2, W, H, 0x1a252c).setDepth(0);
        this.arena = this.add.image(W / 2, H / 2, '__DEFAULT').setDisplaySize(W, H).setVisible(false).setDepth(0);
        this.ground = this.add.graphics().setDepth(1); // shadows and the grill, under everyone
        this.sprites = new Map(); this.labels = new Map(); this.dots = new Map();
        const g = this.make.graphics({ add: false }); g.fillStyle(0xffffff, 1); g.fillCircle(16, 16, 16); g.generateTexture('dot', 32, 32); g.destroy();
        const ui = (t) => t.setDepth(10000);
        this.title = ui(this.add.text(W / 2, 40, '', { fontFamily: 'system-ui', fontSize: '28px', fontStyle: 'bold', color: '#ecf1ee', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5));
        this.sub = ui(this.add.text(W / 2, H / 2, '', { fontFamily: 'system-ui', fontSize: '22px', color: '#ecf1ee', backgroundColor: '#0c1419cc', padding: { x: 18, y: 12 }, wordWrap: { width: 720 }, align: 'center' }).setOrigin(0.5));
        this.bossBar = ui(this.add.graphics());
        this.bossName = ui(this.add.text(W / 2, 70, '', { fontFamily: 'system-ui', fontSize: '16px', color: '#ecf1ee', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5));
        this.clock = ui(this.add.text(W - 16, 12, '', { fontFamily: 'monospace', fontSize: '16px', color: '#ecf1ee', stroke: '#000', strokeThickness: 3 }).setOrigin(1, 0));
        this.bubble = ui(this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '16px', color: '#1a0d0b', backgroundColor: '#f7f7f2', padding: { x: 8, y: 4 }, wordWrap: { width: 260 } }).setOrigin(0.5, 1).setVisible(false));
        this.flash = ui(this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.15).setVisible(false));
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
        const live = new Set(), liveLabels = new Set(), liveDots = new Set();
        const walk = Math.floor(now / 160) % 2 ? 'walk2' : 'walk1';

        const label = (id, text, x, y) => {
          let t = this.labels.get(id);
          if (!t) { t = this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '13px', color: '#ecf1ee', backgroundColor: '#0008', padding: { x: 4, y: 2 } }).setOrigin(0.5, 1); this.labels.set(id, t); }
          t.setText(text).setPosition(x, y).setDepth(9000).setVisible(true); liveLabels.add(id);
        };
        // one sprite per entity: frame from the atlas, feet on (x, y), flipped when the entity faces away from its sheet
        const place = (id, atlas, frame, x, y, facing, h, extra = {}) => {
          if (!this.textures.exists(atlas)) return null;
          const tex = this.textures.get(atlas);
          let sp = this.sprites.get(id);
          if (!sp) { sp = this.add.sprite(x, y, atlas); this.sprites.set(id, sp); }
          if (!tex.has(frame)) frame = 'idle';
          if (sp.texture.key !== atlas) sp.setTexture(atlas, frame); else if (sp.frame.name !== frame) sp.setFrame(frame);
          const pv = (sp.frame.customData && sp.frame.customData.pivot) || { x: 0.5, y: 1 };
          const flip = facing !== (SHEET_FACING[atlas] || 1);
          sp.setOrigin(flip ? 1 - pv.x : pv.x, 1).setFlipX(flip).setScale(h / tex.get('idle').height);
          sp.setPosition(x + (extra.dx || 0), y).setAngle(extra.angle || 0).setAlpha(extra.alpha ?? 1).setDepth(y).setVisible(true);
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
          if (pr.kind === 'grill') { g.fillStyle(PROJ.grill, 0.35); g.fillEllipse(pr.x, pr.y, 180, 60); g.fillStyle(0x333333, 1); g.fillRect(pr.x - 24, pr.y - 20, 48, 16); continue; }
          const pp = prev && prev.projectiles.find(q => q.id === pr.id);
          const x = pp ? lerp(pp.x, pr.x) : pr.x, y = pp ? lerp(pp.y, pr.y) : pr.y, h = pp ? lerp(pp.h || 0, pr.h || 0) : (pr.h || 0);
          g.fillStyle(0x000000, 0.25); g.fillEllipse(x, y, 22, 8);
          let d = this.dots.get(pr.id); if (!d) { d = this.add.image(0, 0, 'dot'); this.dots.set(pr.id, d); }
          d.setPosition(x, y - 40 - h).setScale((pr.kind === 'bolognese' ? 14 : 10) / 16).setTint(PROJ[pr.kind] || PROJ.default).setDepth(y).setVisible(true); liveDots.add(pr.id);
        }

        if (s.phase === 'results') place('tino', 'martino', 'tino', W / 2, 440, -1, 70);
        for (const [id, sp] of this.sprites) if (!live.has(id)) { sp.destroy(); this.sprites.delete(id); }
        for (const [id, d] of this.dots) if (!liveDots.has(id)) { d.destroy(); this.dots.delete(id); }
        for (const [id, t] of this.labels) if (!liveLabels.has(id)) t.setVisible(false);

        // phases (lobby and results details are drawn by the watch page's HTML overlay)
        this.title.setText(s.phase === 'results' ? 'Martino saved!' : '');
        this.sub.setText(s.phase === 'story' && s.story ? s.story.text : '').setVisible(s.phase === 'story' && !!s.story);
        this.clock.setText(s.phase === 'fight' ? fmt(s.clock) : '');
        this.flash.setVisible(!!s.stunned);
      }
    };
    const game = new Phaser.Game({ type: Phaser.AUTO, parent, width: W, height: H, backgroundColor: '#1a252c', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, loader: { crossOrigin: 'anonymous' }, scene });
    return { push(s) { prev = latest; prevAt = latestAt; latest = s; latestAt = performance.now(); }, game };
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
