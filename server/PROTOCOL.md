# Protocol

Socket.IO events. Arena is 960×540 virtual pixels. Ground band (where feet can be): y from 300 to 520; y is depth, larger y is closer to the camera.

## Client → server

| event | payload | who |
|---|---|---|
| `join` | `{room, name, char}` | phone. `char` is a roster id from `content/roster.json` |
| `watch` | `{room}` | watch page. Receives state for that room (or `all` for the room list) |
| `input` | `{dx, dy, attack, special}` | phone, on change or every 50 ms. dx, dy in [-1, 1]; attack/special are booleans that the server treats as edge-triggered |
| `start` | `{}` | phone or watch page: starts the run when the room is in the lobby |

## Server → client

| event | payload |
|---|---|
| `joined` | `{id, room}` after a successful join |
| `state` | full snapshot, 20 times a second (below) |
| `hit` | `{id}` to the phone whose player was hit (for vibration) |
| `rooms` | `[{room, phase, players}]` to watchers of `all` |

### state

```json
{
  "t": 123.4,
  "phase": "lobby | story | fight | results",
  "act": 0,
  "story": {"text": "...", "until": 130.0},
  "players": {"<socketId>": {"name": "Jin", "char": "jin", "x": 200, "y": 400, "facing": 1, "anim": "idle|walk|attack|special|hurt|down", "hp": 3, "cd": 0.0, "deaths": 0, "dmg": 120}},
  "boss": {"id": "nonna", "name": "Nonna", "x": 700, "y": 410, "facing": -1, "hp": 300, "maxHp": 300, "anim": "idle|attack|hurt|dead", "phase": 1, "say": {"text": "...", "until": 140.0}},
  "projectiles": [{"id": 1, "kind": "pizza|bolognese|feather|bite|fan|salame", "x": 500, "y": 400, "h": 0, "owner": "boss|<socketId>"}],
  "clock": 45.2,
  "result": {"time": 180.4, "deaths": 2, "mvp": "Jin"}
}
```

`h` is height above the ground for arcing projectiles; everything collides on (x, y) with a depth tolerance of 28 px.
