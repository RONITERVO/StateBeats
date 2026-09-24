import { PENCIL } from "./pencil-palette.js";
import { chapterPalette } from "./watercolor.js";
import { REST } from "./combat-motion.js";
const INK = PENCIL.ink,
  GRAPHITE = PENCIL.graphite;
// Every defense has its own silhouette. Names and prices still come from AGES.
export function cannonModel(
  b,
  age = 0,
  index = 0,
  color = PENCIL.player,
  moving = false,
  motion = REST,
  detailed = true,
) {
  const { strike, recoil, prepare, flash } = motion;
  b.paint(chapterPalette(age).body);
  b.box([0, 0.024, 0], [0.085, 0.022, 0.072]);
  b.part(
    "box",
    [0, 0.026, 0.038],
    [0.066, 0.014, 0.005],
    GRAPHITE,
    [0, 0, 0],
    color,
  );
  if (age < 3 || moving) {
    for (const z of [-0.042, 0.042]) {
      b.part("ring", [-0.016, 0.025, z], [0.023, 0.023, 0.023], INK);
      b.line([-0.039, 0.025, z], [0.007, 0.025, z], 0.0025);
      b.line([-0.016, 0.002, z], [-0.016, 0.048, z], 0.0025);
    }
  } else {
    for (const z of [-0.035, 0.035])
      b.path(
        [
          [-0.043, 0.002, z * 1.4],
          [0, 0.05, z],
          [0.043, 0.002, z * 1.4],
        ],
        0.003,
      );
  }
  const barrel = (x, y, length, slope = 0.12, z = 0, r = 0.01) => {
    const mountX = x + length * 0.3;
    x -= recoil * (age === 3 && index === 0 ? 0.012 : 0.026);
    slope += recoil * 0.08;
    if (age < 4)
      b.line(
        [mountX, 0.034, z],
        [x + length * 0.3, y + slope * length * 0.3, z],
        0.006,
      );
    b.fill(
      "rod",
      [x + length / 2, y + (slope * length) / 2, z],
      [r, length * Math.sqrt(1 + slope * slope), r],
      chapterPalette(age).body,
      [0, 0, -Math.PI / 2 + Math.atan(slope)],
    );
    for (const sign of [-1, 1])
      b.path(
        [
          [x, y + sign * r, z - r],
          [x + length, y + slope * length + sign * r, z - r],
          [x + length, y + slope * length + sign * r, z + r],
          [x, y + sign * r, z + r],
        ],
        0.0038,
      );
    b.part(
      "ring",
      [x + length, y + slope * length, z],
      [r * 1.25, r * 1.25, r * 1.25],
      color,
      [0, Math.PI / 2, 0],
    );
    if (detailed && flash > 0) {
      const tip = [x + length, y + slope * length, z];
      for (const sign of [-1, 1])
        b.line(
          tip,
          [tip[0] + 0.035 * flash, tip[1] + sign * 0.018 * flash, z],
          0.0025,
          PENCIL.paper,
        );
    }
  };
  if ((age === 0 && index === 0) || (age === 1 && index === 0)) {
    // Rock thrower / counterweight catapult.
    b.pose(
      [-0.02, 0.076, 0],
      [0, 0, 0.7 * prepare - 1.05 * strike],
      [0, 0, 0],
      () => {
        b.path(
          [
            [-0.034, 0.034, 0],
            [-0.02, 0.076, 0],
            [0.058, 0.151, 0],
          ],
          0.004,
        );
        if (flash === 0) b.outlineBall([0.058, 0.151, 0], 0.023);
        if (age === 1) b.box([-0.052, 0.056, 0], [0.032, 0.044, 0.036]);
      },
    );
    b.path(
      [
        [-0.02, 0.076, -0.034],
        [-0.047, 0.03, -0.034],
        [0.022, 0.03, -0.034],
        [-0.02, 0.076, -0.034],
      ],
      0.003,
    );
  } else if (age === 0 && index === 1) {
    b.path(
      [
        [-0.02, 0.026, 0],
        [-0.01, 0.075, 0],
        [0, 0.131, -0.045],
      ],
      0.004,
    );
    b.line([-0.01, 0.075, 0], [0, 0.131, 0.045], 0.004);
    b.path(
      [
        [0, 0.131, -0.045],
        [-0.048 - 0.023 * prepare + 0.07 * strike, 0.091 + 0.035 * strike, 0],
        [0, 0.131, 0.045],
      ],
      0.002,
    );
    if (flash === 0)
      b.part(
        "sphere",
        [-0.048 - 0.023 * prepare + 0.07 * strike, 0.097 + 0.035 * strike, 0],
        [0.016, 0.024, 0.016],
      );
  } else if (age === 0 && index === 2) {
    b.part("rod", [0, 0.073, 0], [0.034, 0.065, 0.034]);
    for (let i = 0; i < 3; i++)
      b.path(
        [
          [-0.024 + i * 0.023, 0.103, 0],
          [
            -0.009 + i * 0.018 + 0.03 * strike,
            0.153 + (i % 2) * 0.02 + 0.044 * strike - 0.018 * prepare,
            0,
          ],
          [0.014 + i * 0.015, 0.109, 0],
        ],
        0.0035,
        color,
      );
  } else if (age === 1 && index === 1) {
    b.path(
      [
        [-0.035, 0.047, 0],
        [0.025, 0.081, 0],
        [0.105, 0.084, 0],
      ],
      0.004,
    );
    b.path(
      [
        [0.018, 0.081, -0.066],
        [0.053 - 0.02 * prepare, 0.081, 0],
        [0.018, 0.081, 0.066],
      ],
      0.004,
    );
    b.path(
      [
        [0.018, 0.081, -0.066],
        [-0.022 - 0.034 * prepare + 0.055 * strike, 0.075, 0],
        [0.018, 0.081, 0.066],
      ],
      0.002,
    );
    if (flash === 0)
      b.path(
        [
          [0.088, 0.084, -0.012],
          [0.112, 0.084, 0],
          [0.088, 0.084, 0.012],
        ],
        0.003,
      );
  } else if (age === 1 && index === 2) {
    for (const z of [-0.04, 0.04])
      b.path(
        [
          [-0.04, 0.02, z],
          [-0.022, 0.139, z],
          [0.014, 0.139, z],
          [0.042, 0.02, z],
        ],
        0.0035,
      );
    b.pose(
      [0.02, 0.12, 0],
      [0, 0, 0.14 * prepare - 0.9 * strike],
      [0, 0, 0],
      () => {
        b.part("sphere", [0.02, 0.103, 0], [0.045, 0.032, 0.034]);
        b.part("ring", [0.02, 0.125, 0], [0.043, 0.043, 0.043], color, [
          Math.PI / 2,
          0,
          0,
        ]);
      },
    );
    if (detailed && flash > 0)
      b.line([0.055, 0.12, 0], [0.07, 0.02, 0], 0.004 * flash, PENCIL.income);
  } else if (age === 2) {
    barrel(
      -0.03,
      0.066,
      index === 2 ? 0.075 : 0.13,
      index === 2 ? 1.2 : 0.12,
      0,
      index === 1 ? 0.018 : 0.012,
    );
    if (index === 0) b.line([-0.01, 0.027, 0], [-0.01, 0.064, 0], 0.005);
    if (index === 1) b.box([-0.02, 0.044, 0], [0.071, 0.025, 0.051]);
  } else if (age === 3) {
    if (index === 1) {
      b.line([0, 0.03, 0], [-0.016 * recoil, 0.074, 0], 0.006);
      b.pose(
        [0, 0.05, 0],
        [0, 0, 0.16 * recoil],
        [-0.016 * recoil, 0, 0],
        () => {
          b.box([0, 0.089, 0], [0.09, 0.069, 0.07]);
          for (const y of [0.072, 0.1])
            for (const z of [-0.018, 0.018])
              b.part(
                "ring",
                [0.047, y, z],
                [0.011, 0.011, 0.011],
                detailed && flash > 0.5 ? PENCIL.paper : color,
                [0, Math.PI / 2, 0],
              );
        },
      );
    } else {
      barrel(
        -0.025,
        0.072,
        index === 0 ? 0.12 : 0.17,
        index === 0 ? 0.03 : 0.4,
        0,
        index === 0 ? 0.006 : 0.012,
      );
      if (index === 0) b.box([-0.024, 0.059, 0.031], [0.039, 0.036, 0.019]);
      else b.box([0.006, 0.065, 0], [0.015, 0.085, 0.094]);
    }
  } else if (age === 4) {
    b.part("sphere", [0, 0.057, 0], [0.036, 0.022, 0.033]);
    if (index === 0) {
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI * 2) / 3 + strike * 2.1;
        barrel(
          -0.005,
          0.091 + Math.cos(angle) * 0.02,
          0.094,
          0.1,
          Math.sin(angle) * 0.02,
          0.005,
        );
      }
    } else if (index === 1) {
      barrel(-0.025, 0.086, 0.14, 0.13, 0, 0.015);
      for (let i = 0; i < 3; i++)
        b.part(
          "ring",
          [0.015 + i * 0.027 - 0.026 * recoil, 0.094, 0],
          [
            0.025,
            0.025 + 0.007 * prepare - 0.004 * strike,
            0.025 + 0.007 * prepare - 0.004 * strike,
          ],
          color,
          [0, Math.PI / 2, 0],
        );
    } else {
      for (const z of [-0.036, 0.036])
        b.path(
          [
            [-0.02, 0.05, 0],
            [0.015, 0.11, z],
            [0.1, 0.123, z * (1 + 0.25 * prepare - 0.4 * strike)],
          ],
          0.004,
          color,
        );
      b.outlineBall(
        [0.078, 0.115, 0],
        0.025 + 0.012 * prepare - 0.008 * strike,
        detailed && flash > 0.5 ? PENCIL.paper : color,
      );
    }
  } else {
    b.part("cone", [0, 0.065, 0], [0.027, 0.07, 0.027]);
    if (index === 0) {
      b.part("sphere", [0.01, 0.119, 0], [0.049, 0.025, 0.025]);
      barrel(0.025, 0.119, 0.065, 0, 0, 0.009);
    } else if (index === 1) {
      const outer = 0.047 + 0.008 * prepare - 0.015 * strike;
      const inner = 0.029 + 0.006 * prepare - 0.01 * strike;
      b.part("ring", [0.012, 0.126, 0], [outer, outer, outer], color, [
        strike * 0.8,
        Math.PI / 2,
        0.2,
      ]);
      b.part("ring", [0.012, 0.126, 0], [inner, inner, inner], INK, [
        0.5 - strike * 0.8,
        Math.PI / 2,
        0,
      ]);
    } else {
      for (const z of [-0.036, 0.036])
        b.path(
          [
            [-0.025, 0.08, z],
            [0, 0.148, z],
            [0.036, 0.113, z],
            [
              0.07 + 0.012 * strike,
              0.164,
              z * (1 + 0.3 * prepare - 0.5 * strike),
            ],
          ],
          0.004,
          color,
        );
      const radius = 0.026 + 0.009 * prepare - 0.01 * strike;
      b.part(
        "sphere",
        [0.025, 0.137, 0],
        [radius, radius * 1.2, radius],
        detailed && flash > 0.5 ? PENCIL.paper : color,
      );
    }
  }
  b.line([-0.041, 0.023, 0.039], [0.038, 0.023, 0.039], 0.004, color);
}
