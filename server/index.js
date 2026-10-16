// Save Martino game server. The only place the game is simulated.
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { Room } from './game/room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(ROOT, 'web')));
app.use('/content', express.static(path.join(ROOT, 'content')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: [...rooms.keys()] }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const roster = JSON.parse(readFileSync(path.join(ROOT, 'content/roster.json'), 'utf8'));
const script = JSON.parse(readFileSync(path.join(ROOT, 'content/script.json'), 'utf8'));

const rooms = new Map();
const slug = (s) => String(s || 'bacaro').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'bacaro';
function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, new Room(name, { roster, script }));
  return rooms.get(name);
}

io.on('connection', (socket) => {
  let room = null;

  socket.on('join', ({ room: r, name, char } = {}) => {
    const rn = slug(r);
    room = getRoom(rn);
    socket.join(rn);
    room.addPlayer(socket.id, { name: String(name || 'Player').slice(0, 16), char: roster.some(c => c.id === char) ? char : roster[0].id });
    socket.emit('joined', { id: socket.id, room: rn });
  });

  socket.on('watch', ({ room: r } = {}) => {
    const rn = slug(r);
    if (rn === 'all') { socket.join('__all'); return; }
    socket.join(rn);
    getRoom(rn);
  });

  socket.on('input', (inp) => { if (room) room.setInput(socket.id, inp || {}); });
  socket.on('start', () => {
    const rn = [...socket.rooms].find(x => x !== socket.id && x !== '__all');
    if (rn) getRoom(rn).start();
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
    for (const [name, r] of rooms) io.to(name).emit('state', r.snapshot());
    io.to('__all').emit('rooms', [...rooms.values()].map(r => r.summary()));
    sendAcc = 0;
  }
}, 1000 / 60);

// Idle rooms disappear after 10 minutes without players.
setInterval(() => {
  for (const [name, r] of rooms) if (r.idleFor() > 600) rooms.delete(name);
}, 30000);

httpServer.listen(PORT, () => console.log(`Save Martino server on http://localhost:${PORT}`));
