import { PENCIL } from "./pencil-palette.js";
const INK = PENCIL.ink,
  GRAPHITE = PENCIL.graphite;

function weapon(b, form, color, motion, detailed) {
  const { prepare, flash } = motion;
  if (["sword", "halberd", "blade"].includes(form)) {
    b.line([0, 0, 0], [0.028, 0.09, 0], 0.005, color);
    b.line([-0.016, 0.016, 0], [0.018, 0.007, 0], 0.004);
    if (form === "halberd") b.box([0.025, 0.071, 0], [0.027, 0.028, 0.007]);
    if (form === "blade")
      b.path(
        [
          [0, 0.03, 0],
          [0.009, 0.11, 0],
          [0.029, 0.09, 0],
          [0, 0.03, 0],
        ],
        0.003,
        color,
      );
  } else if (["rifle", "soldier", "musket", "blaster"].includes(form)) {
    b.box([-0.006, 0, 0], [0.035, 0.012, 0.012]);
    const reach = form === "musket" ? 0.093 : 0.06;
    b.line(
      [0, 0, 0],
      [reach, 0.012, 0],
      0.0048,
      form === "blaster" ? color : INK,
    );
    if (form === "rifle") b.box([-0.019, 0.018, 0.004], [0.029, 0.009, 0.008]);
    if (form === "blaster")
      b.part("ring", [0.047, 0.011, 0], [0.013, 0.013, 0.013], color, [
        0,
        Math.PI / 2,
        0,
      ]);
    // Infantry is a melee fighter: its rifle is a buttstroke, not a phantom shot.
    if (detailed && flash > 0 && form !== "soldier") {
      const spread = 0.012 * flash;
      b.path(
        [
          [reach + 0.007, 0.012 - spread, 0],
          [reach + 0.03 * flash, 0.012, 0],
          [reach + 0.007, 0.012 + spread, 0],
        ],
        0.003,
        form === "blaster" ? color : PENCIL.income,
      );
    }
  } else if (form === "bow") {
    const top = [0.01, 0.046, 0],
      bottom = [0.009, -0.041, 0],
      nock = [-0.024 * prepare, 0.004, 0];
    b.path([top, [0.024 - prepare * 0.005, 0.004, 0], bottom], 0.003);
    b.path([top, nock, bottom], 0.0017, GRAPHITE);
    if (flash === 0) b.line(nock, [0.069, 0.004, 0], 0.0018);
  } else if (form === "sling") {
    b.path(
      [
        [0, 0, 0],
        [0.033, 0.02, 0.003],
        [0.023, 0.065, 0.001],
        [-0.01, 0.028, 0.001],
        [0, 0, 0],
      ],
      0.0023,
    );
    if (flash === 0) b.outlineBall([0.023, 0.047, 0.001], 0.006);
  } else {
    b.path(
      [
        [0, 0, 0],
        [0.006, 0.061, 0.002],
        [0.021, 0.071, 0.002],
        [0.034, 0.057, 0.002],
        [0.01, 0, 0.002],
      ],
      0.004,
    );
    b.line([0.014, 0.018, 0.004], [0.023, 0.055, 0.004], 0.002);
  }
}

/** The arm, grip and weapon share a joint; a sword sweeps, a bow draws and a
 * firearm recoils. Feet brace while the shoulders follow through. */
export function infantryModel(
  b,
  form,
  age,
  color,
  time,
  walking,
  held,
  motion,
  detailed,
) {
  const { strike, recoil, prepare } = motion;
  const gait = walking && !held ? Math.sin(time * 10) * 0.026 : 0.002;
  const hip = [0, 0.071, 0];
  for (const side of [-1, 1]) {
    const brace = side * strike * 0.008;
    const foot = [side * gait + brace, 0.006, side * 0.02];
    const knee = [-side * gait * 0.5 + brace, 0.038, side * 0.013];
    b.line(hip, knee);
    b.line(knee, foot);
    b.line(foot, [foot[0] + 0.014, 0.004, foot[2]], 0.005);
  }
  const melee = ["club", "sword", "halberd", "blade", "soldier"].includes(form);
  const lean = held
    ? 0
    : melee
      ? -strike * 0.13 + prepare * 0.08
      : recoil * 0.08;
  const breathing = detailed && !held ? Math.sin(time * 2.4) * 0.0015 : 0;
  b.pose(hip, [0, 0, lean], [0, breathing, 0], () => {
    const neck = [0, 0.13, 0];
    b.line(hip, neck, 0.0045);
    b.part(
      "box",
      [0, 0.103, 0],
      [0.021, 0.041, 0.025],
      GRAPHITE,
      [0, 0, 0],
      color,
    );
    b.outlineBall([0, 0.158, 0], 0.025);
    for (const z of [-0.012, 0.012])
      b.line([0.021, 0.16, z], [0.023, 0.163, z], 0.0035);
    b.line([-0.01, 0.127, -0.017], [0.017, 0.119, 0.024], 0.009, color);
    const scarf = [
      [-0.012, 0.126, 0.023],
      [-0.036, 0.119, 0.024],
      [-0.028, 0.108, 0.025],
    ];
    b.panel(scarf, color);
    b.path(scarf, 0.004, color);

    const hand = held
      ? [0.018, 0.226, 0.02]
      : melee
        ? [
            0.061 + strike * 0.026 - prepare * 0.027,
            0.099 + prepare * 0.044 - strike * 0.012,
            0.02,
          ]
        : form === "sling"
          ? [
              0.061 + strike * 0.018 - prepare * 0.04,
              0.099 + prepare * 0.05,
              0.02,
            ]
          : [0.061 - recoil * 0.024, 0.099, 0.02];
    b.line(neck, [0.018 + (hand[0] - 0.061) * 0.6, held ? 0.17 : 0.105, 0.019]);
    b.line([0.018 + (hand[0] - 0.061) * 0.6, held ? 0.17 : 0.105, 0.019], hand);
    const support =
      form === "bow" && !held
        ? [hand[0] - 0.024 * prepare, 0.103, 0.021]
        : [0.016, 0.079, -0.025];
    b.line(neck, [-0.024, 0.097, -0.018]);
    b.line([-0.024, 0.097, -0.018], support);
    const angle = held
      ? 0
      : form === "soldier"
        ? prepare * 0.2 - strike * 0.28
        : melee
          ? prepare * 0.7 - strike * (form === "halberd" ? 1.15 : 1.55)
          : form === "sling"
            ? prepare * 1.3 - strike * 1.8
            : recoil * 0.13;
    b.pose([0, 0, 0], [0, 0, angle], hand, () =>
      weapon(b, form, color, motion, detailed),
    );
    if (form === "sword") {
      const shield = [
        [-0.027, 0.12, -0.034],
        [0.008, 0.119, -0.034],
        [0.009, 0.08, -0.034],
        [-0.009, 0.063, -0.034],
        [-0.029, 0.082, -0.034],
      ];
      b.panel(shield, color);
      b.path([...shield, shield[0]], 0.0038, color);
      b.line([-0.009, 0.111, -0.035], [-0.009, 0.08, -0.035], 0.0025);
    }
    if (form === "musket")
      b.path(
        [
          [-0.026, 0.179, 0],
          [0, 0.199, -0.027],
          [0.033, 0.181, 0.008],
          [-0.026, 0.179, 0],
        ],
        0.003,
      );
    if (form === "soldier")
      b.box([-0.018, 0.105, -0.014], [0.02, 0.035, 0.034]);
    if (age === 1) b.part("cone", [0, 0.183, 0], [0.028, 0.025, 0.028]);
    if (age === 2) b.part("cone", [0, 0.185, 0], [0.031, 0.025, 0.024]);
    if (age === 3) b.part("sphere", [0, 0.175, 0], [0.028, 0.012, 0.028]);
    if (age === 4) {
      b.box([0, 0.11, 0], [0.023, 0.033, 0.029]);
      b.line([0.024, 0.166, -0.017], [0.024, 0.166, 0.017], 0.004);
    }
  });
}
