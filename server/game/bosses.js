// Bosses as data. Patterns are functions of (room, boss, dt) that schedule attacks; keep them small.
// Arena: 960×540, ground band y 300..520. Boss stands on the right by default.

export const BOSSES = [
  {
    id: 'nonna', name: 'Nonna', hp: 300, speed: 60, w: 90, h: 150,
    arena: 'farm',
    patterns: {
      1: [
        { kind: 'pizza', every: 1.6, speed: 420 },        // fast, straight, at the target's depth
        { kind: 'bolognese', every: 2.8, flight: 1.0, splash: 60 } // slow arc that splashes
      ],
      2: [
        { kind: 'pizza', every: 1.1, speed: 460 },
        { kind: 'bolognese', every: 2.0, flight: 0.9, splash: 70 },
        { kind: 'plates', every: 3.5, count: 4 }          // rain from above over the players
      ]
    }
  },
  {
    id: 'peacock', name: 'The Peacock', hp: 360, speed: 90, w: 120, h: 160,
    arena: 'woods',
    patterns: {
      1: [
        { kind: 'feather', every: 1.8, spread: 3, speed: 380 },
        { kind: 'charge', every: 4.5, speed: 520 }
      ],
      2: [
        { kind: 'feather', every: 1.3, spread: 5, speed: 400 },
        { kind: 'screech', every: 6.0, stun: 1.0 },
        { kind: 'charge', every: 3.5, speed: 560, repeat: 2 }
      ]
    }
  },
  {
    id: 'martino', name: 'Monster Martino', hp: 420, speed: 110, w: 140, h: 170,
    arena: 'venice',
    patterns: {
      1: [
        { kind: 'lunge', every: 2.5, speed: 600 },
        { kind: 'howl', every: 5.0, push: 260 }
      ],
      2: [
        { kind: 'lunge', every: 1.8, speed: 680, repeat: 2 },
        { kind: 'pigeons', every: 3.0, count: 3, speed: 340 },
        { kind: 'howl', every: 4.5, push: 300 }
      ]
    }
  }
];

// Player specials: five mechanics under the hood, one per character in content/roster.json.
export const MECHANICS = {
  burst: { cooldown: 8,  dmg: 12, count: 3, speed: 520 },        // three projectiles forward (Quentin, baguette chunks)
  slam:  { cooldown: 10, dmg: 30, radius: 110 },                 // area hit around the player (Euge, paddle sweep)
  dash:  { cooldown: 7,  dmg: 18, dist: 260 },                   // dash forward, hits what it crosses (Jin, chopsticks)
  heal:  { cooldown: 14, hearts: 1, sit: 1.0 },                  // teammate with the fewest hearts gets one back (Oriana, zen sitting)
  zone:  { cooldown: 12, dmg: 6, every: 0.5, duration: 4, radius: 90 } // grill on the ground, burns the boss standing in it (Carlos, picanha)
};

export const PLAYER = { speed: 230, hp: 3, attackDmg: 10, attackReach: 70, depthTol: 28, invuln: 1.0, respawn: 5.0, w: 48, h: 96 };
