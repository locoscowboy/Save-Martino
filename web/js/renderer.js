// Draws one room from server snapshots. Same code for the team laptop and the TV grid.
// Placeholder art: coloured boxes with names. Swap drawPlayer/drawBoss/drawProjectile for sprites when the art lands.
window.SaveMartino = (function () {
  const W = 960, H = 540;
  const ARENAS = { farm: 'assets/arenas/farm.jpg', woods: 'assets/arenas/woods.jpg', venice: 'assets/arenas/venice.jpg' };
  const COLORS = { euge: 0x1f6fb2, quentin: 0xe2c044, jin: 0xd23a2c, oriana: 0x9b6bd6, carlos: 0x2e8b57 };
  const PROJ = { pizza: 0xf2b84a, bolognese: 0xb23a2c, plate: 0xffffff, feather: 0x3db5b0, pigeon: 0x9aa0a6, bite: 0x7a3b2e, grill: 0xff7a1a, baguette: 0xd9a030, chopstick: 0x8b5a2b, splash: 0x5fb6e6, om: 0x9b6bd6, ember: 0xff7a1a, default: 0xcccccc };

  function createRenderer(parent, opts) {
    let latest = null, prev = null, prevAt = 0, latestAt = 0;
    const scene = {
      preload() { for (const k in ARENAS) this.load.image('arena-' + k, (opts.base || '') + '/' + ARENAS[k]); },
      create() {
        this.bg = this.add.rectangle(W / 2, H / 2, W, H, 0x1a252c);
        this.arena = this.add.image(W / 2, H / 2, 'arena-venice').setDisplaySize(W, H).setVisible(false);
        this.gfx = this.add.graphics();
        this.texts = {}; this.layer = this.add.container();
        this.title = this.add.text(W / 2, 40, '', { fontFamily: 'system-ui', fontSize: '28px', fontStyle: 'bold', color: '#ecf1ee' }).setOrigin(0.5);
        this.sub = this.add.text(W / 2, H / 2, '', { fontFamily: 'system-ui', fontSize: '22px', color: '#ecf1ee', wordWrap: { width: 760 }, align: 'center' }).setOrigin(0.5);
        this.bossBar = this.add.graphics();
        this.bossName = this.add.text(W / 2, 70, '', { fontFamily: 'system-ui', fontSize: '16px', color: '#ecf1ee' }).setOrigin(0.5);
        this.clock = this.add.text(W - 16, 12, '', { fontFamily: 'monospace', fontSize: '16px', color: '#9fb1b6' }).setOrigin(1, 0);
        this.bubble = this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '16px', color: '#1a0d0b', backgroundColor: '#f7f7f2', padding: { x: 8, y: 4 }, wordWrap: { width: 260 } }).setOrigin(0.5, 1).setVisible(false);
        this.labels = new Map();
      },
      update() {
        if (!latest) return;
        const s = latest, now = performance.now();
        // interpolate between the two latest snapshots for smooth motion at 20 Hz
        const span = Math.max(1, latestAt - prevAt); const k = prev ? Math.min(1, (now - latestAt) / span) : 1;
        const lerp = (a, b) => a + (b - a) * k;
        const g = this.gfx; g.clear(); this.bossBar.clear();
        const arenaKey = s.boss ? s.boss.arena : null;
        if (arenaKey && this.textures.exists('arena-' + arenaKey)) { this.arena.setTexture('arena-' + arenaKey).setDisplaySize(W, H).setVisible(true); }
        else this.arena.setVisible(false);
        // ground band guide
        g.fillStyle(0x000000, 0.12); g.fillRect(0, 300, W, 220);
        const used = new Set();
        const label = (id, text, x, y, color) => { let t = this.labels.get(id); if (!t) { t = this.add.text(0, 0, '', { fontFamily: 'system-ui', fontSize: '13px', color: '#ecf1ee', backgroundColor: '#0008', padding: { x: 4, y: 2 } }).setOrigin(0.5, 1); this.labels.set(id, t); } t.setText(text).setPosition(x, y).setVisible(true); used.add(id); };
        // draw order by depth (y)
        const items = [];
        for (const [id, p] of Object.entries(s.players)) { const pp = prev && prev.players[id]; items.push({ y: p.y, draw: () => drawPlayer(g, label, id, p, pp ? lerp(pp.x, p.x) : p.x, pp ? lerp(pp.y, p.y) : p.y) }); }
        if (s.boss) { const pb = prev && prev.boss; items.push({ y: s.boss.y, draw: () => drawBoss(g, s.boss, pb ? lerp(pb.x, s.boss.x) : s.boss.x, pb ? lerp(pb.y, s.boss.y) : s.boss.y) }); }
        for (const pr of s.projectiles) items.push({ y: pr.y, draw: () => drawProjectile(g, pr) });
        items.sort((a, b) => a.y - b.y).forEach(i => i.draw());
        for (const [id, t] of this.labels) if (!used.has(id)) t.setVisible(false);
        // boss bar
        if (s.boss) { const w = 520, x = (W - w) / 2; this.bossBar.fillStyle(0x000000, 0.6).fillRect(x, 80, w, 14); this.bossBar.fillStyle(s.boss.phase === 2 ? 0xf05a4c : 0xd23a2c, 1).fillRect(x, 80, w * s.boss.hp / s.boss.maxHp, 14); this.bossName.setText(s.boss.name + (s.boss.anim === 'dead' ? ' · defeated' : '')); }
        else this.bossName.setText('');
        if (s.boss && s.boss.say) { this.bubble.setText(s.boss.say.text).setPosition(s.boss.x, s.boss.y - s.boss.h - 10).setVisible(true); } else this.bubble.setVisible(false);
        // phases
        this.title.setText(s.phase === 'lobby' ? `Room ${s.room} · waiting for players` : s.phase === 'results' ? 'Martino saved!' : '');
        this.sub.setText(s.phase === 'story' && s.story ? s.story.text : s.phase === 'lobby' ? `${Object.keys(s.players).length} joined. Press Start on a phone (or Enter here).` : s.phase === 'results' && s.result ? `${s.result.time}s · ${s.result.deaths} deaths · MVP ${s.result.mvp}` : '');
        this.clock.setText(s.phase === 'fight' ? fmt(s.clock) : '');
        if (s.stunned) { g.fillStyle(0xffffff, 0.15); g.fillRect(0, 0, W, H); }
      }
    };
    const game = new Phaser.Game({ type: Phaser.AUTO, parent, width: W, height: H, backgroundColor: '#1a252c', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene });
    return { push(s) { prev = latest; prevAt = latestAt; latest = s; latestAt = performance.now(); }, game };
  }

  function fmt(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; }
  function drawPlayer(g, label, id, p, x, y) {
    const c = COLORS[p.char] || 0xcccccc, w = 48, h = 96;
    g.fillStyle(0x000000, 0.3); g.fillEllipse(x, y, 50, 14); // shadow on the ground
    if (p.anim === 'down') { g.fillStyle(c, 0.5); g.fillRect(x - h / 2, y - 24, h, 24); label(id, `${p.name} ✕`, x, y - 30); return; }
    const flash = p.anim === 'hurt' ? 0xffffff : c;
    g.fillStyle(flash, 1); g.fillRect(x - w / 2, y - h, w, h);
    g.fillStyle(0x000000, 0.4); g.fillRect(x + (p.facing > 0 ? 8 : -16), y - h + 18, 8, 8); // eye, shows facing
    if (p.anim === 'attack' || p.anim === 'special') { g.fillStyle(0xffffff, 0.8); g.fillRect(x + (p.facing > 0 ? w / 2 : -w / 2 - 36), y - h / 2 - 6, 36, 12); }
    label(id, `${p.name} ${'♥'.repeat(Math.max(0, p.hp))}`, x, y - h - 6);
  }
  function drawBoss(g, b, x, y) {
    const w = b.w, h = b.h; const c = b.anim === 'hurt' ? 0xffffff : b.anim === 'dead' ? 0x666666 : (b.id === 'nonna' ? 0xd23a2c : b.id === 'peacock' ? 0x15797a : 0x4a2e22);
    g.fillStyle(0x000000, 0.3); g.fillEllipse(x, y, w + 10, 18);
    g.fillStyle(c, 1); g.fillRect(x - w / 2, y - h, w, h);
    g.fillStyle(0xff3b2f, 1); g.fillRect(x + (b.facing > 0 ? w / 4 : -w / 4 - 12), y - h + 30, 12, 12);
    if (b.anim === 'attack') { g.fillStyle(0xffffff, 0.6); g.fillRect(x + (b.facing > 0 ? w / 2 : -w / 2 - 50), y - h / 2 - 10, 50, 20); }
  }
  function drawProjectile(g, pr) {
    const c = PROJ[pr.kind] || PROJ.default;
    if (pr.kind === 'grill') { g.fillStyle(c, 0.35); g.fillEllipse(pr.x, pr.y, 180, 60); g.fillStyle(0x333333, 1); g.fillRect(pr.x - 24, pr.y - 20, 48, 16); return; }
    g.fillStyle(0x000000, 0.25); g.fillEllipse(pr.x, pr.y, 22, 8);
    g.fillStyle(c, 1); g.fillCircle(pr.x, pr.y - 40 - (pr.h || 0), pr.kind === 'bolognese' ? 14 : 10);
  }
  return { createRenderer };
})();
