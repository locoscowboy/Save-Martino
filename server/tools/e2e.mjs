// End-to-end check over real sockets: host, join, full room, ready, start, play a little, drop and rejoin.
// Usage: npm start in another terminal, then node tools/e2e.mjs [http://localhost:3000]
import { io } from 'socket.io-client';

const URL = process.argv[2] || 'http://localhost:3000';
const open = () => io(URL, { transports: ['websocket'] });
const once = (s, ev, ms = 3000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), ms); s.once(ev, v => { clearTimeout(t); res(v); }); });
const until = (s, pred, ms = 15000) => new Promise((res, rej) => { const t = setTimeout(() => { s.off('state', h); rej(new Error('timeout waiting for state')); }, ms); const h = st => { if (pred(st)) { clearTimeout(t); s.off('state', h); res(st); } }; s.on('state', h); });
const check = (cond, what) => { if (!cond) throw new Error('FAILED: ' + what); console.log('ok  ' + what); };

const host = open(), p2 = open(), p3 = open(), p4 = open(), watch = open(), tv = open();
await Promise.all([host, p2, p3, p4, watch, tv].map(s => once(s, 'connect')));

host.emit('host', { name: 'Quentin', char: 'quentin' });
const j = await once(host, 'joined');
check(j.host === true && /^[A-HJ-NP-Z]{4}$/.test(j.room), `host gets a 4-letter code (${j.room})`);
const code = j.room;

p2.emit('join', { room: code.toLowerCase(), name: 'Jin', char: 'jin' });
check((await once(p2, 'joined')).host === false, 'second phone joins with the code, lower case accepted');
p3.emit('join', { room: code, name: 'Euge', char: 'euge' });
await once(p3, 'joined');
p4.emit('join', { room: code, name: 'Late', char: 'oriana' });
check((await once(p4, 'fail')).reason === 'full', 'fourth phone is refused: room full');
p4.emit('join', { room: 'ZZZZ', name: 'Lost', char: 'jin' });
check((await once(p4, 'fail')).reason === 'nocode', 'unknown code is refused');

watch.emit('watch', { room: code });
let st = await until(watch, s => Object.keys(s.players).length === 3);
check(st.phase === 'lobby' && st.canStart === false && st.host === j.id, 'watch page sees 3 players in the lobby, start not allowed yet');
tv.emit('watch', { room: 'all' });
const rooms = await once(tv, 'rooms');
check(rooms.some(r => r.code === code && r.players.length === 3), 'TV grid lists the room');

p2.emit('start');
await new Promise(r => setTimeout(r, 300));
check((await once(watch, 'state')).phase === 'lobby', 'a non-host cannot start');
host.emit('start');
await new Promise(r => setTimeout(r, 300));
check((await once(watch, 'state')).phase === 'lobby', 'the host cannot start before everyone is ready');
for (const s of [host, p2, p3]) s.emit('ready', { ready: true });
st = await until(watch, s => s.canStart);
check(Object.values(st.players).every(p => p.ready), 'everyone ready, start allowed');
host.emit('start');
st = await until(watch, s => s.phase === 'story');
check(st.story && st.story.text.length > 0, 'run starts with the first story card');
st = await until(watch, s => s.phase === 'fight');
check(st.boss && st.boss.id === 'nonna' && st.boss.maxHp === 2000, `fight begins against ${st.boss.name} at full-team hp`);

// walk right and mash attack for a while: the boss should lose hp
const tick = setInterval(() => { for (const s of [host, p2, p3]) s.emit('input', { dx: 1, dy: 0, attack: Math.random() < 0.5, special: true }); }, 50);
st = await until(watch, s => s.boss && s.boss.hp < s.boss.maxHp, 15000);
clearInterval(tick);
check(true, `boss took damage (${st.boss.hp}/${st.boss.maxHp})`);
await new Promise(r => setTimeout(r, 1000)); // let the hit event, if any, arrive

p2.disconnect();
st = await until(watch, s => Object.keys(s.players).length === 2);
check(true, 'a dropped phone leaves the room');
const p2b = open(); await once(p2b, 'connect');
p2b.emit('join', { room: code, name: 'Jin', char: 'jin' });
await once(p2b, 'joined');
st = await until(watch, s => Object.keys(s.players).length === 3);
check(st.phase === 'fight', 'it rejoins the same game mid-fight');

const solo = open(); await once(solo, 'connect');
solo.emit('solo', { name: 'Solo', char: 'carlos' });
const sj = await once(solo, 'joined');
st = await until(solo, s => s.phase === 'story');
check(sj.room !== code && st.code === sj.room, `solo gets its own room (${sj.room}) and starts at once`);

console.log('all good');
process.exit(0);
