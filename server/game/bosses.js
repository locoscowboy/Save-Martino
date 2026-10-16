// Bosses as data. Patterns are functions of (room, boss, dt) that schedule attacks; keep them small.
// Arena: 960×540, ground band y 300..520. Boss stands on the right by default.
// hp is for a full team of three (room.js scales it down for smaller teams); check changes with `npm run sim`.

export const BOSSES = [
  {
    id: 'nonna', name: 'Nonna', hp: 2000, speed: 60, w: 90, h: 150,
    arena: 'farm',
    patterns: {
      1: [
        { kind: 'pizza', every: 3.5, speed: 420 },        // fast, straight, at the target's depth
        { kind: 'bolognese', every: 6.5, flight: 1.0, splash: 60 } // slow arc that splashes
      ],
      2: [
        { kind: 'pizza', every: 2.5, speed: 460 },
        { kind: 'bolognese', every: 5.0, flight: 0.9, splash: 70 },
        { kind: 'plates', every: 7.0, count: 4 }          // rain from above over the players
      ]
    }
  },
  {
    id: 'peacock', name: 'The Peacock', hp: 2400, speed: 90, w: 120, h: 160,
    arena: 'woods',
    patterns: {
      1: [
        { kind: 'feather', every: 5.0, spread: 3, speed: 380 },
        { kind: 'charge', every: 7.0, speed: 520 }
      ],
      2: [
        { kind: 'feather', every: 3.5, spread: 5, speed: 400 },
        { kind: 'screech', every: 10.0, stun: 1.0 },
        { kind: 'charge', every: 6.0, speed: 560 }
      ]
    }
  },
  {
    id: 'martino', name: 'Monster Martino', hp: 2800, speed: 110, w: 140, h: 170,
    arena: 'venice',
    patterns: {
      1: [
        { kind: 'lunge', every: 6.0, speed: 600 },
        { kind: 'howl', every: 8.0, push: 260 }
      ],
      2: [
        { kind: 'lunge', every: 5.0, speed: 680 },
        { kind: 'pigeons', every: 5.0, count: 3, speed: 340 },
        { kind: 'howl', every: 7.0, push: 300 }
      ]
    }
  }
];

// Player specials: five mechanics under the hood, one per character in content/roster.json.
export const MECHANICS = {
  burst: { cooldown: 8,  dmg: 12, count: 3, speed: 520 },        // three projectiles forward (Quentin, baguette chunks)
  slam:  { cooldown: 10, dmg: 30, radius: 110 },                 // area hit around the player (Euge, paddle sweep)
  dash:  { cooldown: 7,  dmg: 18, dist: 260 },                   // dash forward, hits what it crosses (Jin, chopsticks)
  heal:  { cooldown: 14, hearts: 2, sit: 1.0 },                  // teammate with the fewest hearts gets two back (Oriana, zen sitting)
  zone:  { cooldown: 12, dmg: 6, every: 0.5, duration: 4, radius: 90 } // grill on the ground, burns the boss standing in it (Carlos, picanha)
};

// charges (peacock) and lunges (martino) telegraph for windup seconds before the boss moves
export const PLAYER = { speed: 230, hp: 5, attackDmg: 10, attackReach: 70, depthTol: 28, invuln: 1.5, respawn: 5.0, w: 48, h: 96, windup: 0.6 };
