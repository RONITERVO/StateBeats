// SPDX-License-Identifier: Apache-2.0
// Separate browser entry: importing the headless collaboration never imports Three.js or DOM APIs.
export { InkBatch } from '../upstream/src/mr/ink-batch.js';
export { BookPaper } from '../upstream/src/mr/book-paper.js';
export { bookPaths, landscapePaths, pencilMesh, CHAPTERS } from '../upstream/src/mr/sketchbook.js';
export {
  baseModel,
  unitModel,
  cannonModel,
  projectileModel,
  specialModel,
  TEAM_COLORS,
} from '../upstream/src/mr/models.js';
export { dockPosition } from '../upstream/src/mr/defense-layout.js';
export { unitMotion, attackMotion, REST } from '../upstream/src/mr/combat-motion.js';
export { chapterPalette } from '../upstream/src/mr/watercolor.js';
