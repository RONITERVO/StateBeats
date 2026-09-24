import { infantryModel } from "./infantry-model.js";
import { UNIT_FORMS } from "./catalog.js";
import { TEAM_COLORS } from "./pencil-palette.js";
import { cannonModel } from "./defense-models.js";
import { PENCIL } from "./pencil-palette.js";
import { chapterPalette } from "./watercolor.js";
import { REST } from "./combat-motion.js";
const INK = PENCIL.ink,
  GRAPHITE = PENCIL.graphite;
function mount(b, dinosaur, color, t, walking, held, motion) {
  const { strike, prepare } = motion;
  b.paint(dinosaur ? PENCIL.leaf : PENCIL.leather);
  b.part("sphere", [-0.012, 0.061, 0], [0.062, 0.035, 0.034], GRAPHITE);
  b.pose(
    [0.024, 0.077, 0],
    [0, 0, -strike * (dinosaur ? 0.65 : 0.2) + prepare * 0.2],
    [0, 0, 0],
    () => {
      b.line([0.024, 0.077, 0], [0.065, 0.116, 0], 0.017, GRAPHITE);
      b.sphere([0.073, 0.125, 0], 0.024, GRAPHITE);
      if (dinosaur)
        b.line(
          [0.078, 0.117, 0.02],
          [0.097, 0.12 - prepare * 0.013, 0.02],
          0.003,
        );
      else
        b.path(
          [
            [0.061, 0.14, 0],
            [0.058, 0.165, -0.008],
            [0.071, 0.143, 0],
          ],
          0.003,
        );
    },
  );
  b.line([-0.063, 0.072, 0], [-0.113, 0.09, 0], 0.007);
  for (const x of [-0.045, 0.03])
    for (const z of [-0.025, 0.025]) {
      const gait = walking
        ? Math.sin(t * 9 + x * 30 + z * 30) * 0.02
        : Math.sign(x) * strike * 0.012;
      b.line([x, 0.064, z], [x + gait, 0.006, z], 0.005);
    }
  b.outlineBall([-0.005, 0.163, 0], 0.019);
  b.line([-0.005, 0.144, 0], [-0.014, 0.089, 0]);
  b.part(
    "box",
    [-0.009, 0.119, 0],
    [0.02, 0.037, 0.026],
    GRAPHITE,
    [0, 0, 0],
    color,
  );
  b.line([-0.014, 0.099, 0], [-0.009, 0.042, 0.039]);
  b.line(
    [-0.012, 0.129, 0.012],
    held
      ? [0.018, 0.226, 0.02]
      : dinosaur
        ? [0.048, 0.116, 0.02]
        : [0.033, 0.109, 0.024],
  );
  b.line([-0.01, 0.137, -0.015], [0.002, 0.13, 0.016], 0.008, color);
  if (!dinosaur)
    b.pose(
      [0.033, 0.109, 0.024],
      [0, 0, prepare * 0.3 - strike * 0.9],
      [0, 0, 0],
      () => b.line([0.033, 0.109, 0.024], [0.117, 0.2, 0.024], 0.003),
    );
  if (dinosaur) {
    // Stegosaur plates, a blunt muzzle and claws distinguish it from the horse.
    for (let i = 0; i < 4; i++) {
      const x = -0.06 + i * 0.022;
      b.path(
        [
          [x, 0.083, 0],
          [x + 0.004, 0.116, 0],
          [x + 0.019, 0.085, 0],
        ],
        0.003,
      );
    }
  } else {
    b.path(
      [
        [0.048, 0.1, -0.014],
        [0.036, 0.079, -0.02],
        [0.053, 0.122, -0.016],
      ],
      0.003,
    );
    b.line([0.073, 0.123, 0.026], [0.005, 0.12, 0.028], 0.002);
  }
}

export function unitModel(
  b,
  age,
  index,
  {
    x = 0,
    y = 0,
    z = 0,
    scale = 1,
    team = 1,
    yaw = 0,
    time = 0,
    walking = false,
    held = false,
    motion = REST,
    detailed = true,
  } = {},
) {
  b.model(x, y, z, scale, team, yaw);
  b.paint(chapterPalette(age).body);
  const form = UNIT_FORMS[age]?.[index] || "club",
    color = TEAM_COLORS[team];
  if (held) motion = REST;
  const { strike, recoil, prepare, flash } = motion;
  if (form === "dinosaur" || form === "horse")
    mount(b, form === "dinosaur", color, time, walking, held, motion);
  else if (form === "cannon")
    cannonModel(b, age, 1, color, true, motion, detailed);
  else if (form === "tank") {
    b.box([0, 0.053, 0], [0.14, 0.049, 0.091], GRAPHITE);
    b.pose([0, 0.07, 0], [0, 0, recoil * 0.08], [-0.018 * recoil, 0, 0], () => {
      b.box([0, 0.091, 0], [0.072, 0.036, 0.065], color);
      b.line([0.018, 0.096, 0], [0.15 - recoil * 0.018, 0.105, 0], 0.008);
      if (detailed && flash > 0)
        b.path(
          [
            [0.157, 0.09, 0],
            [0.157 + 0.03 * flash, 0.105, 0],
            [0.157, 0.12, 0],
          ],
          0.003,
          PENCIL.income,
        );
    });
    for (const z0 of [-0.054, 0.054]) {
      b.box([0, 0.026, z0], [0.16, 0.034, 0.024], GRAPHITE);
      for (const xx of [-0.052, -0.017, 0.019, 0.055])
        b.part("ring", [xx, 0.026, z0 * 1.2], [0.016, 0.016, 0.014], GRAPHITE, [
          0,
          0,
          walking ? -time * 6 : 0,
        ]);
    }
  } else if (form === "mech") {
    const step = walking ? Math.sin(time * 8) * 0.025 : 0;
    b.pose(
      [0, 0.112, 0],
      [0, 0, recoil * 0.13],
      [-recoil * 0.009, -strike * 0.008, 0],
      () => {
        b.box([0, 0.133, 0], [0.074, 0.065, 0.062], GRAPHITE);
        b.outlineBall([0.025, 0.175, 0], 0.023, GRAPHITE);
        for (const s of [-1, 1])
          b.line(
            [0, 0.147, s * 0.049],
            [0.096 - recoil * 0.025, 0.138 + prepare * 0.009, s * 0.049],
            0.011,
            flash > 0.5 ? PENCIL.paper : color,
          );
      },
    );
    for (const s of [-1, 1]) {
      b.line([0, 0.112, s * 0.027], [-step * s, 0.056, s * 0.04], 0.009);
      b.line([-step * s, 0.056, s * 0.04], [step * s, 0.006, s * 0.05], 0.008);
    }
  } else if (["drone", "ray", "mothership"].includes(form)) {
    b.pose(
      [0, 0.095, 0],
      [
        0,
        0,
        form === "drone" ? -strike * 0.38 + prepare * 0.18 : recoil * 0.15,
      ],
      [form === "drone" ? strike * 0.027 : -recoil * 0.015, 0, 0],
      () => {
        const size = form === "mothership" ? 0.077 : 0.041,
          lift =
            0.095 +
            (detailed ? Math.sin(time * 2) * 0.006 : 0) +
            prepare * 0.009 -
            strike * 0.006;
        b.part(
          "sphere",
          [0, lift, 0],
          [size, size * 0.45, size * 0.75],
          GRAPHITE,
        );
        b.part(
          "ring",
          [0, lift, 0],
          [size * 1.3, size * 1.3, size * 0.8],
          INK,
          [Math.PI / 2, 0, 0.1 + prepare * 0.3 - strike * 0.25],
        );
        b.outlineBall(
          [0.035, lift + 0.008, 0],
          0.013 + 0.01 * prepare,
          flash > 0.5 ? PENCIL.paper : color,
        );
        for (const s of [-1, 1]) {
          if (form === "drone") {
            for (const xx of [-0.04, 0.04]) {
              b.line([0, lift, 0], [xx, lift, s * 0.067], 0.003);
              b.part(
                "ring",
                [xx, lift, s * 0.067],
                [0.024, 0.024, 0.024],
                INK,
                [Math.PI / 2, 0, 0],
              );
            }
          } else if (form === "ray") {
            b.pose(
              [0, lift, 0],
              [s * (prepare * 0.45 - strike * 0.55), 0, 0],
              [0, 0, 0],
              () => {
                b.panel(
                  [
                    [0.04, lift, s * 0.015],
                    [-0.015, lift + 0.015, s * 0.13],
                    [-0.064, lift, s * 0.047],
                    [-0.04, lift, 0],
                  ],
                  color,
                );
                b.path(
                  [
                    [0.04, lift, s * 0.015],
                    [-0.015, lift + 0.015, s * 0.13],
                    [-0.064, lift, s * 0.047],
                    [-0.04, lift, 0],
                  ],
                  0.004,
                  color,
                );
                b.line([0, lift, 0], [-0.015, lift + 0.015, s * 0.13], 0.0025);
              },
            );
          } else {
            b.path(
              [
                [-0.025, lift, s * 0.06],
                [-0.072, lift - 0.035, s * 0.094],
                [-0.052, lift - 0.045, s * 0.116],
              ],
              0.004,
            );
          }
        }
        if (form === "ray")
          b.path(
            [
              [-0.03, lift, 0],
              [-0.11, lift + 0.009, 0],
              [-0.14, lift + 0.039, 0],
            ],
            0.003,
          );
        if (form === "drone") {
          for (const s of [-1, 1])
            b.path(
              [
                [-0.02, lift - 0.009, s * 0.02],
                [-0.03, lift - 0.038, s * 0.024],
                [0.025, lift - 0.038, s * 0.024],
              ],
              0.003,
            );
          b.line([0, lift + 0.013, 0], [0.008, lift + 0.039, 0], 0.003);
        }
        if (form === "mothership") {
          b.part(
            "cone",
            [0, lift + 0.045, 0],
            [
              0.029 + prepare * 0.015,
              0.054 + prepare * 0.02 - strike * 0.015,
              0.029 + prepare * 0.015,
            ],
            color,
          );
          b.line([0, lift + 0.071, 0], [0, lift + 0.12, 0], 0.003);
        }
      },
    );
  } else
    infantryModel(b, form, age, color, time, walking, held, motion, detailed);
}
