// Save Martino game server. The only place the game is simulated.
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { Room, MAX_PLAYERS } from './game/room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

const app = express();
// The Netlify pages fetch content and textures from here: without this header the roster fetch fails and WebGL refuses the images.
app.use((_req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });
app.use(express.static(path.join(ROOT, 'web')));
app.use('/content', express.static(path.join(ROOT, 'content')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: [...rooms.keys()] }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const roster = JSON.parse(readFileSync(path.join(ROOT, 'content/roster.json'), 'utf8'));
const script = JSON.parse(readFileSync(path.join(ROOT, 'content/script.json'), 'utf8'));

// Rooms are keyed by a 4-letter code the host reads out to the team. No I or O: they look like 1 and 0 on a TV.
const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => { let c; do c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); while (rooms.has(c)); return c; };
const codeOf = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
function createRoom() { const r = new Room(newCode(), { roster, script }); rooms.set(r.code, r); return r; }

io.on('connection', (socket) => {
  let room = null; // the room this socket plays in (watchers stay null)

  const enter = (r, { name, char } = {}) => {
    const ok = r.addPlayer(socket.id, { name: String(name || 'Player').trim().slice(0, 16) || 'Player', char: roster.some(c => c.id === char) ? char : roster[0].id });
    if (!ok) { socket.emit('fail', { reason: 'full', message: `Game ${r.code} is full (${MAX_PLAYERS} players).` }); return false; }
    room = r; socket.join(r.code);
    socket.emit('joined', { id: socket.id, room: r.code, host: r.hostId === socket.id });
    return true;
  };

  socket.on('host', (p) => { if (!room) enter(createRoom(), p); });
  socket.on('solo', (p) => { if (room) return; const r = createRoom(); if (enter(r, p)) { r.setReady(socket.id, true); r.start(); } });
  socket.on('join', (p = {}) => {
    if (room) return;
    const r = rooms.get(codeOf(p.room));
    if (!r) { socket.emit('fail', { reason: 'nocode', message: 'No game with that code.' }); return; }
    enter(r, p);
  });
  socket.on('ready', ({ ready } = {}) => { if (room) room.setReady(socket.id, ready !== false); });

  socket.on('watch', ({ room: r } = {}) => {
    const c = codeOf(r);
    if (c === 'ALL') { socket.join('__all'); return; }
    if (!rooms.has(c)) { socket.emit('fail', { reason: 'nocode', message: 'No game with that code.' }); return; }
    socket.join(c);
  });

  socket.on('input', (inp) => { if (room) room.setInput(socket.id, inp || {}); });
  socket.on('start', () => {
    if (room) { if (room.hostId === socket.id) room.start(); return; } // phones: the host, once everyone is ready
    const c = [...socket.rooms].find(x => rooms.has(x)); // watch page: the organiser's override, no ready check
    if (c) rooms.get(c).start(true);
  });

  socket.on('disconnect', () => { if (room) room.removePlayer(socket.id); });
});

// Fixed-timestep simulation at 30 Hz, broadcast at 20 Hz.
const TICK = 1 / 30;
let acc = 0, last = process.hrtime.bigint(), sendAcc = 0;
setInterval(() => {
  const now = process.hrtime.bigint();
  const dt = Number(now - last) / 1e9; last = now;
  acc += dt; sendAcc += dt;
  while (acc >= TICK) {
    for (const r of rooms.values()) {
      const events = r.step(TICK);
      for (const ev of events) if (ev.type === 'hit') io.to(ev.id).emit('hit', { id: ev.id });
    }
    acc -= TICK;
  }
  if (sendAcc >= 1 / 20) {
    for (const [code, r] of rooms) io.to(code).emit('state', r.snapshot());
    io.to('__all').emit('rooms', [...rooms.values()].map(r => r.summary()));
    sendAcc = 0;
  }
}, 1000 / 60);

// Idle rooms disappear after 10 minutes without players, which frees their code.
setInterval(() => {
  for (const [code, r] of rooms) if (r.idleFor() > 600) rooms.delete(code);
}, 30000);

httpServer.listen(PORT, () => console.log(`Save Martino server on http://localhost:${PORT}`));
