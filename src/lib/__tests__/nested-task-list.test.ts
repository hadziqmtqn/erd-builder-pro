import { describe, expect, it } from 'vitest';
import { resolveNestedTaskChecks, NestedTaskItemState } from '../tiptap/nested-task-list';

const task = (pos: number, checked: boolean, children: NestedTaskItemState[] = []): NestedTaskItemState => ({
  pos,
  checked,
  children,
});

describe('resolveNestedTaskChecks', () => {
  it('checks every descendant when a parent is checked', () => {
    const child = task(2, false);
    const parent = task(1, true, [child]);

    expect(resolveNestedTaskChecks([parent, child], new Set([1]))).toEqual(new Map([[1, true], [2, true]]));
  });

  it('checks the parent when the last child is checked', () => {
    const firstChild = task(2, true);
    const lastChild = task(3, true);
    const parent = task(1, false, [firstChild, lastChild]);

    expect(resolveNestedTaskChecks([parent, firstChild, lastChild], new Set([3]))).toEqual(
      new Map([[1, true], [2, true], [3, true]]),
    );
  });
});
