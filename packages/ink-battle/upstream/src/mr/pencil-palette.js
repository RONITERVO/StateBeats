/** A small colored-pencil set. Color reinforces a silhouette or glyph; it never
 * replaces one. The same swatches work for shop pieces and deployed models. */
export const PENCIL = Object.freeze({
  paper: "#fff0d2",
  wood: "#c89d65",
  leaf: "#8fb882",
  leather: "#bd865c",
  ink: "#342d2b",
  graphite: "#514b45",
  soft: "#756b5c",
  player: "#2b8d88",
  enemy: "#b64f42",
  damage: "#d37768",
  health: "#70b392",
  income: "#d7b750",
  evolution: "#859ac1",
  special: "#ce8260",
});

export const TEAM_COLORS = Object.freeze({ 1: PENCIL.player, "-1": PENCIL.enemy });
