/** Canvas state is immutable; unchanged items retain their references across unrelated renders. */
export function sameCanvasItems<T>(before: T[], after: T[]): boolean {
  return before === after || (before.length === after.length && before.every((item, index) => item === after[index]));
}
