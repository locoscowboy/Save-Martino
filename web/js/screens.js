// The laptop's HTML screens on top of the Phaser arena: the title lobby, the manga story cards, the round banner and
// the results with every team's best run. All of them follow the server's snapshot; nothing here changes the game.
window.RMScreens = (function () {
  const { base, frame, at, stage, el, esc, fmt } = window.RM;
  const ARENA = (k) => `url(${base}/assets/arenas/${k}.jpg)`;
  // the cast on the title lawn: [char, pose, x, feet y, scale, flip]
  const CAST = [['carlos', 'special', 95, 455, .5, 0], ['jin', 'front', 205, 457, .59, 0], ['oriana', 'special', 318, 457, .43, 0],
    ['bricciola', 'idle', 412, 457, .2, 1], ['euge', 'front', 507, 457, .5, 0], ['quentin', 'front', 612, 457, .5, 1]];
  const LINES = { euge: 'Good boy, Tino!', quentin: 'He is the real boss.', carlos: 'Picanha for Tino!', jin: 'Tino, sit!', oriana: 'Tino is so zen.', bricciola: 'Meow.' };
  const BOSS_POSE = { nonna: ['attack', .5], peacock: ['idle', .45], martino: ['hero', .45] };

  function create(host, opts) {
    const root = el('div', 'rm-screens', host); Object.assign(root.style, { position: 'fixed', inset: 0, zIndex: 20, pointerEvents: 'none' });
    let view = null, viewKey = '', stageEl = null, refs = {}, last = null;

    const clear = () => { root.innerHTML = ''; view = null; viewKey = ''; refs = {}; };
    const open = (key, cls) => { clear(); viewKey = key; stageEl = stage(root, cls); return stageEl; };
    const shadow = (s, x, y, w) => { const d = el('div', 'rm-shadow', s); Object.assign(d.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: w * .24 + 'px', zIndex: 2 }); };

    // ---------- title lobby ----------
    function title(s) {
      const st = open('title', 'ti'); st.style.backgroundImage = ARENA('farm');
      for (const [w, top, dur, d] of [[210, 35, 70, -10], [150, 95, 95, -60], [260, 60, 120, -30]]) Object.assign(el('div', 'ti-cloud', st).style, { width: w + 'px', height: w * .32 + 'px', top: top + 'px', animationDuration: dur + 's', animationDelay: d + 's' });
      refs.cast = {};
      CAST.forEach(([c, pose, x, y, k, flip], i) => {
        shadow(st, x, y, 80 * k * 2);
        const f = at(frame(c, pose, k, { flip: !!flip, cls: 'rm-breathe' }), x, y); f.style.setProperty('--bd', -i * .7 + 's'); f.style.setProperty('--bt', 2.6 + (i % 3) * .5 + 's'); st.appendChild(f);
        refs.cast[c] = { f, x, y: y - (pose === 'special' && c === 'oriana' ? 110 : c === 'bricciola' ? 60 : 135) };
      });
      for (let i = 0; i < 3; i++) Object.assign(el('div', 'ti-smoke', st).style, { left: '167px', top: '388px', animationDelay: i + 's' });
      const t = el('div', 'ti-title', st, '<span class="r">RESCUE</span><span class="m">MARTINO</span><span class="tag">VIA FALCHI GAME NIGHT</span>');
      Object.assign(el('div', 'ti-spot', st).style, { left: '742px', top: '128px' });
      refs.tino = at(frame('martino', 'tino', .33), 752, 162, 75); st.appendChild(refs.tino);
      for (let i = 0; i < 3; i++) { const h = el('div', 'ti-heart', st, '♥'); Object.assign(h.style, { left: 726 + i * 14 + 'px', top: '70px', animationDelay: i * 1.1 + 's' }); }
      refs.bubble = el('div', 'rm-bubble', st);
      refs.names = el('div', '', st);
      const j = el('div', 'ti-join', st, `<div class="qr"></div><div><div class="lbl">SCAN OR TYPE</div><div class="code"></div><div class="count"></div></div>`);
      refs.code = j.querySelector('.code'); refs.count = j.querySelector('.count'); refs.qr = j.querySelector('.qr');
      if (!opts.mini && window.qrcode) { const qr = qrcode(0, 'M'); qr.addData(opts.phoneUrl); qr.make(); refs.qr.innerHTML = qr.createSvgTag({ cellSize: 3, margin: 2 }); } else refs.qr.remove();
      if (!opts.mini) el('div', 'ti-url', st, esc(opts.phoneUrl));
      refs.msg = el('div', 'ti-msg', st);
      refs.t0 = performance.now();
    }
    function titleUpdate(s) {
      refs.code.textContent = s.code;
      const ps = Object.entries(s.players), n = ps.length;
      refs.count.textContent = `${n}/${s.maxPlayers} IN THE TEAM`;
      // who plays whom: a name tag over each picked character, the others a little dimmed
      const by = {}; for (const [id, p] of ps) (by[p.char] = by[p.char] || []).push({ ...p, host: id === s.host });
      const key = JSON.stringify(ps.map(([id, p]) => [id, p.name, p.char, p.ready, id === s.host]));
      if (refs.namesKey !== key) {
        refs.namesKey = key; refs.names.innerHTML = '';
        for (const [c, r] of Object.entries(refs.cast)) {
          r.f.classList.toggle('ti-dim', n > 0 && !by[c]);
          (by[c] || []).forEach((p, i) => { const t = el('div', 'ti-name' + (p.ready ? ' ready' : ''), refs.names, esc(p.name) + (p.ready ? '<small>READY</small>' : p.host ? '<small>HOST</small>' : '')); Object.assign(t.style, { left: r.x + 'px', top: r.y - i * 26 + 'px' }); });
        }
      }
      const waiting = ps.filter(([, p]) => !p.ready).length;
      refs.msg.textContent = !n ? 'SCAN THE CODE WITH YOUR PHONE TO JOIN' : waiting ? `WAITING FOR ${waiting} TO BE READY` : 'EVERYONE IS READY · THE HOST PRESSES START';
      // Tino hops on the title; the cast takes turns calling him (bubbles only while nobody has joined, so names stay readable)
      const T = (performance.now() - refs.t0) / 1000, c = T % 4, hop = c < .6 ? Math.abs(Math.sin(c / .6 * Math.PI * 2)) * 6 : 0;
      refs.tino.style.top = 162 - hop + 'px'; refs.tino.firstChild.style.transform = Math.floor(T / 4) % 2 ? 'scaleX(-1)' : '';
      const order = Object.keys(refs.cast), who = order[Math.floor(T / 3) % order.length], r = refs.cast[who];
      const on = !n && (T % 3) > .3 && (T % 3) < 2.6;
      refs.bubble.textContent = LINES[who]; Object.assign(refs.bubble.style, { left: r.x + 'px', top: r.y - 4 + 'px' }); refs.bubble.classList.toggle('on', on);
    }

    // ---------- manga story ----------
    const panel = (st, x, y, w, h, { bg, cls = '' } = {}) => { const p = el('div', 'mg-panel ' + cls, st); Object.assign(p.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' }); if (bg) p.style.backgroundImage = ARENA(bg); return p; };
    const put = (p, id, pose, k, x, y, flip) => { const f = at(frame(id, pose, k, { flip }), x, y, 4); p.appendChild(f); return f; };
    const sfx = (p, text, x, y, size = 46, color) => { const d = el('div', 'mg-sfx', p, esc(text)); Object.assign(d.style, { left: x + 'px', top: y + 'px', fontSize: size + 'px' }); if (color) d.style.color = color; return d; };
    const cap = (st, x, y, text, w, up) => { const c = el('div', 'mg-cap', st, [...(text || '')].map(ch => `<span class="c">${ch === ' ' ? ' ' : esc(ch)}</span>`).join('')); Object.assign(c.style, { left: x + 'px', top: y + 'px' }); if (w) c.style.maxWidth = w + 'px'; if (up) c.style.transform = 'translateY(-100%)'; return c; };
    const team = (s) => Object.values(s.players).map(p => p.char);

    // each scene returns one { panel, cap, onShow } per story line, in order
    const SCENES = {
      prologue(st, s) {
        const a = panel(st, 14, 14, 560, 250, { bg: 'farm' }); put(a, 'martino', 'tino', .5, 280, 238);
        const b = panel(st, 588, 14, 358, 250, { cls: 'dark speed' }); b.style.background = 'radial-gradient(circle at 50% 55%, #4ff3ff, #0b3a52 60%, #071018)'; const bt = put(b, 'martino', 'tino', .46, 180, 238); bt.style.filter = 'drop-shadow(0 0 10px #5ff)'; sfx(b, 'BZZT!', 210, 24, 48, '#7ff');
        const c = panel(st, 14, 278, 420, 248, { cls: 'speed' }); c.style.background = 'radial-gradient(circle, #ff6a4a, #6a0f08)'; put(c, 'martino', 'hero', .5, 210, 248); sfx(c, 'GRRR!', 18, 20, 52);
        const d = panel(st, 448, 278, 498, 248, { bg: 'farm' }); put(d, 'nonna', 'attack', .55, 300, 246); sfx(d, '!!', 40, 20, 64, '#ff5a3a');
        return [{ panel: a, cap: cap(st, 26, 200, s.lines[0], 520) }, { panel: b, cap: cap(st, 600, 196, s.lines[1], 330) },
          { panel: c, cap: cap(st, 26, 518, s.lines[2], 400, true) }, { panel: d, cap: cap(st, 462, 518, s.lines[3], 470, true) }];
      },
      woods(st, s) {
        const a = panel(st, 14, 14, 932, 250, { bg: 'woods' }); const m = put(a, 'martino', 'walk1', .22, 760, 200, true); m.style.filter = 'brightness(0)'; sfx(a, '...?', 700, 40, 36, '#fff');
        const b = panel(st, 14, 278, 460, 248, { bg: 'woods' }); put(b, 'peacock', 'idle', .5, 250, 246);
        const c = panel(st, 488, 278, 458, 248, { cls: 'speed' }); c.style.background = 'radial-gradient(circle, #3fd6c8, #0d3f45)'; put(c, 'peacock', 'special', .44, 230, 246); sfx(c, 'VS', 30, 20, 70);
        return [{ panel: a, cap: cap(st, 26, 26, s.lines[0], 560) }, { panel: b, cap: cap(st, 26, 290, s.lines[1], 430) }, { panel: c, cap: cap(st, 500, 518, s.lines[2], 430, true) }];
      },
      venice(st, s) {
        const a = panel(st, 14, 14, 932, 250, { bg: 'venice' });
        const b = panel(st, 14, 278, 460, 248, { bg: 'venice' }); put(b, 'martino', 'attack', .42, 250, 246); sfx(b, 'WOOF!', 300, 24, 46);
        const c = panel(st, 488, 278, 458, 248, { cls: 'speed' }); c.style.background = 'radial-gradient(circle, #ffd34a, #7a2a08)'; put(c, 'martino', 'hero', .78, 230, 380); sfx(c, 'SAVE TINO!', 150, 20, 42);
        return [{ panel: a, cap: cap(st, 26, 26, s.lines[0], 560) }, { panel: b, cap: cap(st, 26, 290, s.lines[1], 430) }, { panel: c, cap: cap(st, 500, 518, s.lines[2], 430, true) }];
      },
      ending(st, s, snap) {
        const a = panel(st, 14, 14, 460, 250, { bg: 'venice' }); put(a, 'martino', 'defeated', .44, 225, 246); sfx(a, 'CRACK!', 240, 30, 52);
        const b = panel(st, 488, 14, 458, 250, { cls: 'dark speed' }); b.style.background = 'radial-gradient(circle, #fff6c9, #f4b63b 45%, #7a3a08)';
        const big = put(b, 'martino', 'hero', .48, 229, 240), small = put(b, 'martino', 'tino', .5, 229, 240), fl = el('div', 'mg-flash', b);
        small.style.opacity = 0;
        const c = panel(st, 14, 278, 932, 248, { bg: 'farm' }); c.style.transition = 'all .9s cubic-bezier(.4,1.2,.5,1), opacity .35s';
        // the villa party: the team in front, the rest of the cast around, Tino in the middle
        const mine = team(snap), cast = ['carlos', 'jin', 'oriana', 'euge', 'quentin', 'bricciola'];
        const crowd = [...new Set([...mine, ...cast])].slice(0, 6), xs = [140, 290, 600, 750, 860, 440];
        const party = [];
        crowd.forEach((id, i) => { const pose = id === 'carlos' ? 'special' : id === 'oriana' ? 'special' : id === 'bricciola' ? 'idle' : 'front'; const k = id === 'bricciola' ? .2 : id === 'oriana' ? .43 : id === 'jin' ? .59 : .5;
          party.push(put(c, id, pose, k, xs[i] || 100 + i * 140, 236, xs[i] > 470)); });
        party.push(put(c, 'martino', 'tino', .45, 470, 238));
        const colors = ['#e2452f', '#f4b63b', '#4fa35a', '#3db5b0', '#fff1d6', '#ff6fa0'];
        for (let i = 0; i < 26; i++) { const k = el('div', 'mg-confetti', c); Object.assign(k.style, { left: Math.random() * 930 + 'px', top: '-20px', background: colors[i % 6], animationDuration: 2.5 + Math.random() * 2.5 + 's', animationDelay: -Math.random() * 4 + 's' }); }
        sfx(c, 'TINO IS SAVED!', 300, 18, 54);
        const capA = cap(st, 264, 179, s.lines[0], 210), capB = cap(st, 500, 26, s.lines[1], 430);
        return [{ panel: a, cap: capA },
          { panel: b, cap: capB, onShow: () => { big.classList.add('mg-shrink'); setTimeout(() => { fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); small.style.opacity = 1; small.classList.add('mg-grow'); }, 50); } },
          { panel: c, cap: cap(st, 26, 454, s.lines[2], 600), onShow: () => setTimeout(() => {
            // the last panel opens up to the whole screen: the party moves down onto the villa lawn, the earlier captions step aside
            Object.assign(c.style, { left: '0px', top: '0px', width: '960px', height: '540px', borderWidth: '0px' });
            for (const f of party) { f.style.transition = 'top .9s cubic-bezier(.4,1.2,.5,1)'; f.style.top = parseFloat(f.style.top) + 219 + 'px'; }
            capA.classList.remove('on'); capB.classList.remove('on');
          }, 2600) }];
      }
    };
    const SCENE_BY_ACT = ['prologue', 'woods', 'venice', 'ending'];

    function story(s) {
      const sto = s.story, key = 'story:' + sto.kind + ':' + sto.act + ':' + sto.start;
      if (sto.kind === 'retry') {
        const st = open(key, ''); const r = el('div', 'mg-retry', st);
        el('div', 'big', r, 'OUCH!'); el('div', 'line', r, esc(sto.text)); return;
      }
      const st = open(key, 'mg');
      const scene = SCENES[sto.scene] || SCENES[SCENE_BY_ACT[sto.act]] || SCENES.prologue;
      // a card split into pages: the panels of earlier pages are already on screen and fully written, this page's lines are timed
      const off = sto.offset || 0;
      // beats before this page are shown at once but dimmed, this page's beats are timed, later pages' beats stay hidden
      const count = (sto.lines || []).length || 1;
      refs.beats = scene(st, { ...sto, lines: sto.allLines || sto.lines }, s).map((b, i) => ({ ...b, shown: i < off, pre: i < off, later: i >= off + count, idx: i - off }));
      refs.beats.forEach(b => { if (b.pre) { b.panel.classList.add('on', 'done'); b.cap.classList.add('on', 'done'); b.cap.querySelectorAll('.c').forEach(c => c.classList.add('v')); } });
      refs.sto = sto; refs.base = { server: s.t, local: performance.now() };
    }
    function storyUpdate(s, fresh) {
      if (!refs.beats) return;
      if (fresh) refs.base = { server: s.t, local: performance.now() };
      const sto = refs.sto, now = (refs.base.server - sto.start) + (performance.now() - refs.base.local) / 1000;
      const dur = sto.until - sto.start, n = Math.max(1, refs.beats.filter(b => !b.pre && !b.later).length), step = Math.max(1.6, (dur - 3) / n);
      refs.beats.forEach((b) => {
        if (b.pre || b.later) return;
        const t0 = 0.4 + b.idx * step;
        if (now >= t0 && !b.shown) { b.shown = true; b.panel.classList.add('on'); b.cap.classList.add('on'); if (b.onShow) b.onShow(); }
        if (b.shown) { const cs = b.cap.querySelectorAll('.c'), vis = Math.floor((now - t0 - .25) / 0.028); cs.forEach((c, k) => c.classList.toggle('v', k < vis)); }
      });
    }

    // ---------- round banner ----------
    function banner(s) {
      const st = open('banner:' + s.act + ':' + s.t, 'rbs'); const b = el('div', 'rb', st);
      el('div', 'k', b, 'ROUND ' + (s.act + 1)); el('div', 'n', b, esc(s.boss ? s.boss.name : '')); el('div', 'f', b, 'FIGHT!');
      refs.until = performance.now() + 2300;
    }

    // ---------- results ----------
    function results(s) {
      const st = open('results', 'rs'); st.style.backgroundImage = ARENA('farm');
      const r = s.result || { players: [] }, ps = r.players || [];
      el('div', 'rs-head', st, `<div class="h">TINO IS SAVED!</div><div class="s">TIME ${fmt(r.time || 0)} · ${r.deaths || 0} DOWN${r.deaths === 1 ? '' : 'S'} · ${r.wipes || 0} WIPE${r.wipes === 1 ? '' : 'S'}</div>`);
      refs.msg = el('div', 'rs-msg', st);
      const slots = [330, 630, 200, 760], tinoX = 480;
      ps.forEach((p, i) => {
        const x = slots[i] ?? 100 + i * 120, y = 330; shadow(st, x, y, 90);
        const pose = p.char === 'oriana' ? 'special' : i === 0 ? 'special' : 'front';
        const k = p.char === 'bricciola' ? .3 : p.char === 'oriana' && pose === 'special' ? .43 : .5;
        st.appendChild(at(frame(p.char, pose, k, { flip: x > tinoX, cls: 'rm-breathe' }), x, y, 10));
        const tag = el('div', 'ti-name' + (i === 0 ? ' ready' : ''), st, esc(p.name) + (i === 0 ? '<small>MVP</small>' : '')); Object.assign(tag.style, { left: x + 'px', top: y - 128 + 'px' });
        if (i === 0) { const c = el('div', 'rs-crown', st, '👑'); Object.assign(c.style, { left: x + 'px', top: y - 154 + 'px' }); }
      });
      shadow(st, tinoX, 345, 60); st.appendChild(at(frame('martino', 'tino', .3), tinoX, 345, 11));
      for (let i = 0; i < 3; i++) { const h = el('div', 'ti-heart', st, '♥'); Object.assign(h.style, { left: tinoX - 14 + i * 14 + 'px', top: '240px', zIndex: 12, animationDelay: i * 1.1 + 's' }); }
      const top = Math.max(1, ...ps.map(p => p.dmg));
      const t = el('div', 'rs-team', st, `<div class="rs-k">YOUR TEAM · ${esc(s.code)}</div>` + ps.map((p, i) =>
        `<div class="rs-p${i === 0 ? ' mvp' : ''}"><span class="face" style="background-image:url(${base}/assets/sprites/${p.char}_front.png)"></span><span>${i === 0 ? '👑 ' : ''}${esc(p.name)}</span><span class="bar"><i style="width:${Math.round(p.dmg / top * 100)}%"></i></span><span class="d">${p.dmg} DMG<br>${p.deaths} DOWN${p.deaths === 1 ? '' : 'S'}</span></div>`).join(''));
      const rows = (s.board || []).map(b => `<div class="rs-row${b.mine ? ' mine' : ''}"><span class="rk">${b.rank}</span><span>${b.team.map(m => esc(m.name)).join(', ')}</span><span class="t">${fmt(b.time)}</span><span class="x">${b.deaths} DOWN${b.deaths === 1 ? '' : 'S'}<br>MVP ${esc(b.mvp)}</span></div>`).join('');
      el('div', 'rs-board', st, `<div class="rs-k">ALL TEAMS · FASTEST RESCUE</div>${rows || '<div class="rs-row"><span></span><span>First team to finish!</span></div>'}`);
    }
    function resultsUpdate(s) {
      const ps = Object.values(s.players), waiting = ps.filter(p => !p.ready).length;
      refs.msg.textContent = waiting ? `ANOTHER RUN? READY UP ON YOUR PHONES · ${waiting} TO GO` : 'EVERYONE IS READY · THE HOST PRESSES START';
    }

    return {
      update(s) {
        const prev = last; last = s;
        if (s.phase === 'lobby') { if (viewKey !== 'title') title(s); titleUpdate(s); }
        else if (s.phase === 'story' && s.story) { const key = 'story:' + s.story.kind + ':' + s.story.act + ':' + s.story.start; if (viewKey !== key) story(s); storyUpdate(s, true); }
        else if (s.phase === 'fight') {
          if (prev && prev.phase === 'story' && prev.story && prev.story.kind === 'act') banner(s);
          else if (viewKey.startsWith('banner') && performance.now() > refs.until) clear();
          else if (viewKey && !viewKey.startsWith('banner')) clear();
        }
        else if (s.phase === 'results') { if (viewKey !== 'results') results(s); resultsUpdate(s); }
      },
      // the title animates between snapshots too
      tick() { if (last && last.phase === 'lobby' && viewKey === 'title') titleUpdate(last); if (last && last.phase === 'story' && refs.beats) storyUpdate(last); }
    };
  }
  return { create };
})();
