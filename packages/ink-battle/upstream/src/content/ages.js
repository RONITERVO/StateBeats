export const AGES = [
    {
        name: "Stone Age", evolveXP: 400, baseHp: 500, baseStyle: "cave",
        theme: { bg: "39 35% 90%", fg: "25 15% 20%", accent: "18 60% 55%" },
        special: { name: "Meteor Shower", cooldown: 60, duration: 4, type: "meteor" },
        units: [
            { name: "Clubman", desc: "Cheap melee screen. Takes half damage from siege shots.", cost: 15, hp: 30, dmg: 8, range: 40, speed: 50, type: 'melee', size: 45, attackSpeed: 1.2, killXp: 5, killGold: 10 },
            { name: "Slinger", desc: "Basic ranged support.", cost: 25, hp: 20, dmg: 5, range: 250, speed: 45, type: 'ranged', size: 40, attackSpeed: 1.5, projType: 'arc', projSpeed: 400, killXp: 8, killGold: 15 },
            { name: "Dino Rider", desc: "Heavy pushing power.", cost: 100, hp: 150, dmg: 35, range: 50, speed: 70, type: 'heavy', size: 80, attackSpeed: 2.0, killXp: 30, killGold: 50 }
        ],
        turrets: [
            { name: "Rock Thrower", desc: "A simple defensive rock flinger.", cost: 100, dmg: 10, range: 350, attackSpeed: 1.5, projType: 'arc', projSpeed: 350 },
            { name: "Egg Slingshot", desc: "Fires volatile dino eggs.", cost: 200, dmg: 25, range: 400, attackSpeed: 2.0, projType: 'arc', projSpeed: 400 },
            { name: "Fire Beryl", desc: "Spits concentrated fireballs.", cost: 400, dmg: 50, range: 450, attackSpeed: 2.5, projType: 'arc', projSpeed: 450 }
        ]
    },
    {
        name: "Castle Age", evolveXP: 1400, baseHp: 1500, baseStyle: "castle",
        theme: { bg: "45 25% 85%", fg: "220 20% 25%", accent: "200 60% 45%" },
        special: { name: "Arrow Volley", cooldown: 60, duration: 3, type: "arrows" },
        units: [
            { name: "Swordsman", desc: "Armored infantry. Takes half damage from siege shots.", cost: 50, hp: 120, dmg: 25, range: 45, speed: 55, type: 'melee', size: 50, attackSpeed: 1.0, killXp: 15, killGold: 25 },
            { name: "Archer", desc: "Sharp-eyed ranged combatant.", cost: 75, hp: 70, dmg: 20, range: 300, speed: 50, type: 'ranged', size: 45, attackSpeed: 1.2, projType: 'arc', projSpeed: 500, killXp: 20, killGold: 35 },
            { name: "Knight", desc: "Mounted terror of the battlefield.", cost: 250, hp: 400, dmg: 55, range: 60, speed: 80, type: 'heavy', size: 90, attackSpeed: 1.5, killXp: 70, killGold: 100 }
        ],
        turrets: [
            { name: "Catapult", desc: "Lobs heavy stones at attackers.", cost: 500, dmg: 40, range: 450, attackSpeed: 1.5, projType: 'arc', projSpeed: 400 },
            { name: "Ballista", desc: "Fires massive piercing bolts.", cost: 750, dmg: 80, range: 500, attackSpeed: 2.5, projType: 'straight', projSpeed: 800 },
            { name: "Hot Oil", desc: "Boiling defense for close range.", cost: 1000, dmg: 150, range: 300, attackSpeed: 3.0, projType: 'arc', projSpeed: 300 }
        ]
    },
    {
        name: "Renaissance", evolveXP: 4500, baseHp: 4000, baseStyle: "fort",
        theme: { bg: "30 20% 88%", fg: "10 30% 25%", accent: "0 50% 50%" },
        special: { name: "Cannon Barrage", cooldown: 60, duration: 4, type: "cannons" },
        units: [
            { name: "Halberdier", desc: "Long-reaching infantry. Takes half damage from siege shots.", cost: 200, hp: 400, dmg: 80, range: 65, speed: 50, type: 'melee', size: 50, attackSpeed: 1.2, killXp: 40, killGold: 60 },
            { name: "Musketeer", desc: "Deadly black powder marksman.", cost: 300, hp: 250, dmg: 100, range: 400, speed: 45, type: 'ranged', size: 45, attackSpeed: 2.0, projType: 'straight', projSpeed: 1200, killXp: 50, killGold: 80 },
            { name: "Field Cannon", splashRadius: 65, siegeMultiplier: 2, desc: "Siege gun: 2x base damage; splashes two nearby troops at 35%.", cost: 900, hp: 1000, dmg: 250, range: 450, speed: 30, type: 'ranged', size: 75, attackSpeed: 3.0, projType: 'arc', projSpeed: 600, killXp: 150, killGold: 300 }
        ],
        turrets: [
            { name: "Swivel Gun", desc: "Fast firing anti-infantry gun.", cost: 1500, dmg: 100, range: 450, attackSpeed: 1.0, projType: 'straight', projSpeed: 1200 },
            { name: "Heavy Cannon", desc: "Slow firing massive damage.", cost: 2500, dmg: 250, range: 500, attackSpeed: 2.5, projType: 'arc', projSpeed: 700 },
            { name: "Mortar", desc: "Extreme range plunging fire.", cost: 4000, dmg: 500, range: 600, attackSpeed: 4.0, projType: 'arc', projSpeed: 500 }
        ]
    },
    {
        name: "Modern Age", evolveXP: 15000, baseHp: 12000, baseStyle: "bunker",
        theme: { bg: "120 10% 85%", fg: "120 20% 20%", accent: "30 70% 50%" },
        special: { name: "Airstrike", cooldown: 60, duration: 5, type: "airstrike" },
        units: [
            { name: "Infantry", desc: "Trench fighter. Takes half damage from siege shots.", cost: 1500, hp: 1200, dmg: 250, range: 50, speed: 60, type: 'melee', size: 50, attackSpeed: 0.8, killXp: 200, killGold: 300 },
            { name: "Marine", desc: "Rapid-fire assault troops.", cost: 2000, hp: 800, dmg: 130, range: 400, speed: 55, type: 'ranged', size: 45, attackSpeed: 0.65, projType: 'straight', projSpeed: 1800, killXp: 250, killGold: 400 },
            { name: "Tank", splashRadius: 80, siegeMultiplier: 2, desc: "Armored siege: 2x base damage; splashes two nearby troops at 35%.", cost: 6500, hp: 4500, dmg: 800, range: 350, speed: 40, type: 'heavy', size: 110, attackSpeed: 2.5, projType: 'straight', projSpeed: 1000, killXp: 800, killGold: 1200 }
        ],
        turrets: [
            { name: "Machine Gun", desc: "Shreds lightly armored units.", cost: 6000, dmg: 80, range: 500, attackSpeed: 0.15, projType: 'straight', projSpeed: 2000 },
            { name: "Rocket Pod", desc: "Fires armor piercing missiles.", cost: 9000, dmg: 600, range: 550, attackSpeed: 2.0, projType: 'straight', projSpeed: 800 },
            { name: "Artillery", desc: "Long range explosive barrage.", cost: 15000, dmg: 1500, range: 700, attackSpeed: 3.5, projType: 'arc', projSpeed: 800 }
        ]
    },
    {
        name: "Future Age", evolveXP: 50000, baseHp: 40000, baseStyle: "dome",
        theme: { bg: "210 30% 25%", fg: "210 60% 85%", accent: "180 80% 60%" },
        special: { name: "Orbital Laser", cooldown: 60, duration: 4, type: "laser" },
        units: [
            { name: "Energy Blade", desc: "Cyber swordsman. Takes half damage from siege shots.", cost: 5000, hp: 5000, dmg: 1000, range: 60, speed: 70, type: 'melee', size: 55, attackSpeed: 1.0, killXp: 800, killGold: 1000 },
            { name: "Blaster", desc: "Fires concentrated energy beams.", cost: 7000, hp: 3000, dmg: 600, range: 420, speed: 60, type: 'ranged', size: 50, attackSpeed: 0.8, projType: 'laser', projSpeed: 3000, killXp: 1000, killGold: 1500 },
            { name: "War Mech", splashRadius: 90, siegeMultiplier: 2, desc: "Siege beams: 2x base damage; splashes two nearby troops at 35%.", cost: 20000, hp: 15000, dmg: 3000, range: 400, speed: 45, type: 'heavy', size: 130, attackSpeed: 2.0, projType: 'laser', projSpeed: 3000, killXp: 3000, killGold: 4000 }
        ],
        turrets: [
            { name: "Laser Gatling", desc: "Unending beam of light.", cost: 20000, dmg: 300, range: 550, attackSpeed: 0.2, projType: 'laser', projSpeed: 3000 },
            { name: "Ion Cannon", desc: "Heavy anti-armor blasts.", cost: 40000, dmg: 2500, range: 600, attackSpeed: 2.0, projType: 'laser', projSpeed: 3000 },
            { name: "Plasma Ray", desc: "Melts organic matter.", cost: 80000, dmg: 6000, range: 800, attackSpeed: 3.0, projType: 'arc', projSpeed: 1200 }
        ]
    },
    {
        name: "Cosmic Age", evolveXP: 9999999, baseHp: 150000, baseStyle: "portal",
        theme: { bg: "260 40% 10%", fg: "280 50% 80%", accent: "300 80% 60%" },
        special: { name: "Void Rift", cooldown: 70, duration: 5, type: "orbital" },
        units: [
            { name: "Hover Drone", desc: "Swift hunter. Takes half damage from siege shots.", cost: 15000, hp: 14000, dmg: 2400, range: 70, speed: 85, type: 'melee', size: 60, attackSpeed: 1.0, killXp: 2000, killGold: 3000 },
            { name: "Void Ray", desc: "Channels antimatter.", cost: 20000, hp: 8000, dmg: 2400, range: 500, speed: 70, type: 'ranged', size: 55, attackSpeed: 1.0, projType: 'laser', projSpeed: 4000, killXp: 3000, killGold: 4500 },
            { name: "Mothership", splashRadius: 140, siegeMultiplier: 2, desc: "Siege orbs: 2x base damage; splashes two nearby troops at 35%.", cost: 65000, hp: 50000, dmg: 8000, range: 550, speed: 35, type: 'heavy', size: 160, attackSpeed: 3.0, projType: 'orb', projSpeed: 600, killXp: 10000, killGold: 15000 }
        ],
        turrets: [
            { name: "Plasma Rep.", cost: 50000, dmg: 1200, range: 600, attackSpeed: 0.3, projType: 'laser', projSpeed: 4000 },
            { name: "Black Hole", cost: 100000, dmg: 6000, range: 650, attackSpeed: 2.5, projType: 'orb', projSpeed: 500 },
            { name: "Antimatter", cost: 200000, dmg: 20000, range: 900, attackSpeed: 4.0, projType: 'laser', projSpeed: 5000 }
        ]
    }
];


// Content is immutable for the lifetime of a rules version.
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
}
freeze(AGES);


