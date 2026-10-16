# Protocol

Socket.IO events. Arena is 960×540 virtual pixels. Ground band (where feet can be): y from 300 to 520; y is depth, larger y is closer to the camera.

A game is a room keyed by a 4-letter code (no I or O). The first phone in is the host. Up to `maxPlayers` (3) phones per room.

## Client → server

| event | payload | who |
|---|---|---|
| `host` | `{name, char}` | phone: creates a room and joins it as host. `char` is a roster id from `content/roster.json` |
| `solo` | `{name, char}` | phone: creates a room, joins it and starts the run at once |
| `join` | `{room, name, char}` | phone: joins the room with that code. Also used to rejoin after a dropped connection |
| `ready` | `{ready}` | phone: toggles the player's ready flag in the lobby |
| `start` | `{}` | host phone: starts the run when every player is ready. From a watch page it starts regardless (the organiser's override) |
| `input` | `{dx, dy, attack, special}` | phone, on change or every 50 ms. dx, dy in [-1, 1]; attack/special are booleans that the server treats as edge-triggered |
| `watch` | `{room}` | watch page. Receives `state` for that room, or `rooms` when room is `all` |

## Server → client

| event | payload |
|---|---|
| `joined` | `{id, room, host}` after a successful join; `room` is the code |
| `fail` | `{reason: "nocode" \| "full", message}` when a join or watch is refused |
| `state` | full snapshot, 20 times a second (below) |
| `hit` | `{id}` to the phone whose player was hit (for vibration) |
| `rooms` | `[{code, phase, act, clock, players: [{name, char, ready}], result}]` to watchers of `all` |

### state

```json
{
  "t": 123.4,
  "code": "BKRT", "host": "<socketId>", "maxPlayers": 3, "maxHp": 5, "canStart": false,
  "phase": "lobby | story | fight | results",
  "act": 0,
  "story": {"text": "...", "until": 130.0},
  "players": {"<socketId>": {"name": "Jin", "char": "jin", "x": 200, "y": 400, "facing": 1, "anim": "idle|walk|attack|special|hurt|down", "hp": 3, "cd": 0.0, "deaths": 0, "dmg": 120, "ready": true, "down": 0}},
  "boss": {"id": "nonna", "name": "Nonna", "x": 700, "y": 410, "facing": -1, "hp": 300, "maxHp": 300, "anim": "intro|idle|walk|windup|attack|hurt|dead", "move": "pizza", "phase": 1, "w": 90, "h": 150, "say": {"text": "...", "until": 140.0}, "arena": "farm"},
  "projectiles": [{"id": 1, "kind": "pizza|bolognese|plate|feather|pigeon|baguette|chopstick|splash|om|ember|grill", "x": 500, "y": 400, "h": 0, "owner": "boss|player"}],
  "clock": 45.2, "wipes": 0,
  "result": {"time": 180.4, "deaths": 2, "wipes": 0, "mvp": "Jin"}
}
```

`h` is height above the ground for arcing projectiles; everything collides on (x, y) with a depth tolerance of 28 px. `down` is the seconds left before a downed player gets back up. The boss strikes an `intro` pose for 2 s when it appears, `windup` is the telegraph before a charge or lunge, and `move` names the pattern behind the current `attack` (pizza, bolognese, plates, feather, charge, screech, lunge, howl, pigeons) so the renderer can pick the pose.

When every player is down at once the room goes back to `story` for a few seconds (the retry card) and the boss comes back at its last checkpoint: full hp, or half if phase 2 had been reached. `wipes` counts those.
