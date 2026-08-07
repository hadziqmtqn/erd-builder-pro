import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface NestedTaskItemState {
  pos: number;
  checked: boolean;
  children: NestedTaskItemState[];
}

interface TaskItemEntry extends NestedTaskItemState {
  pos: number;
  node: ProseMirrorNode;
  parent: TaskItemEntry | null;
}

export function resolveNestedTaskChecks(
  items: NestedTaskItemState[],
  changedPositions: ReadonlySet<number>,
): Map<number, boolean> {
  const checkedByPos = new Map(items.map(item => [item.pos, item.checked]));
  const setDescendants = (item: NestedTaskItemState, checked: boolean) => {
    for (const child of item.children) {
      checkedByPos.set(child.pos, checked);
      setDescendants(child, checked);
    }
  };

  for (const item of items) {
    if (changedPositions.has(item.pos)) setDescendants(item, item.checked);
  }

  for (const item of [...items].reverse()) {
    if (item.children.length) {
      checkedByPos.set(item.pos, item.children.every(child => checkedByPos.get(child.pos)));
    }
  }

  return checkedByPos;
}

function collectTaskItems(
  node: ProseMirrorNode,
  nodeStart = -1,
  parent: TaskItemEntry | null = null,
  items: TaskItemEntry[] = [],
): TaskItemEntry[] {
  node.forEach((child, offset) => {
    const pos = nodeStart + 1 + offset;
    const item = child.type.name === 'taskItem'
      ? { pos, node: child, checked: Boolean(child.attrs.checked), parent, children: [] }
      : null;
    if (item) {
      parent?.children.push(item);
      items.push(item);
    }
    collectTaskItems(child, pos, item ?? parent, items);
  });
  return items;
}

export const NestedTaskList = Extension.create({
  name: 'nestedTaskListCascade',

  addProseMirrorPlugins() {
    const pluginKey = new PluginKey(this.name);

    return [new Plugin({
      key: pluginKey,
      appendTransaction: (transactions, oldState, newState) => {
        if (!transactions.some(transaction => transaction.docChanged && !transaction.getMeta(pluginKey))) {
          return;
        }

        const items = collectTaskItems(newState.doc);
        const changedItems = items.filter(item => {
          const oldNode = oldState.doc.nodeAt(item.pos);
          return oldNode?.type.name === 'taskItem' && oldNode.attrs.checked !== item.node.attrs.checked;
        });
        const checkedByPos = resolveNestedTaskChecks(items, new Set(changedItems.map(item => item.pos)));

        const tr = newState.tr;
        let changed = false;
        for (const item of items) {
          const checked = checkedByPos.get(item.pos);
          if (checked === undefined || checked === item.node.attrs.checked) continue;
          tr.setNodeMarkup(item.pos, undefined, { ...item.node.attrs, checked });
          changed = true;
        }

        return changed ? tr.setMeta(pluginKey, true) : undefined;
      },
    })];
  },
});
