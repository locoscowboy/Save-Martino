// Shared HTML helpers for the laptop and phone screens: atlas frames as plain DOM, and a 960×540 stage that scales to fit.
// Frames come from the same atlases the renderer uses (assets/sprites/<id>.json), so any sheet change shows up here too.
window.RM = (function () {
  const base = window.SERVER || '';
  const atlases = {};
  const atlas = (id) => atlases[id] || (atlases[id] = fetch(base + '/assets/sprites/' + id + '.json').then(r => r.json()).catch(() => null));

  // One frame of an atlas as a <div>, `scale` times its size on the sheet, feet at the element's (left, top).
  // Returns the element at once; the frame paints when the atlas JSON arrives. el.setFrame(name) swaps the pose.
  function frame(id, name, scale = 0.5, { flip = false, cls = '' } = {}) {
    const el = document.createElement('div'); el.className = 'rm-fig ' + cls;
    const inner = document.createElement('div'); inner.className = 'rm-frame'; el.appendChild(inner);
    el.setFrame = (n, s = scale) => {
      atlas(id).then(a => {
        if (!a) return;
        const f = a.frames[n] || a.frames.idle || Object.values(a.frames)[0], r = f.frame, pv = f.pivot || { x: 0.5, y: 1 };
        const W = a.meta.size.w, H = a.meta.size.h;
        Object.assign(inner.style, { width: r.w * s + 'px', height: r.h * s + 'px', backgroundImage: `url(${base}/assets/sprites/${id}.png)`,
          backgroundSize: `${W * s}px ${H * s}px`, backgroundPosition: `${-r.x * s}px ${-r.y * s}px`, marginLeft: (flip ? -(1 - pv.x) : -pv.x) * r.w * s + 'px',
          marginTop: -r.h * s + 'px', transform: flip ? 'scaleX(-1)' : '' });
        el.dataset.frame = n;
      });
    };
    el.setFrame(name);
    return el;
  }
  const at = (el, x, y, z) => { Object.assign(el.style, { left: x + 'px', top: y + 'px', zIndex: z ?? Math.round(y) }); return el; };

  // A fixed 960×540 stage inside `host`, scaled to fit it (letterboxed like the Phaser canvas).
  function stage(host, cls = '') {
    const s = document.createElement('div'); s.className = 'rm-stage ' + cls; host.appendChild(s);
    const fit = () => { const k = Math.min(host.clientWidth / 960, host.clientHeight / 540) || 1; s.style.transform = `translate(-50%, -50%) scale(${k})`; };
    addEventListener('resize', fit); fit(); requestAnimationFrame(fit);
    return s;
  }
  const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (sec) => { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; };
  return { base, atlas, frame, at, stage, el, esc, fmt };
})();
