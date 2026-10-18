import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (value: unknown) => [value, vi.fn()],
  useEffect: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

import { RenameDocumentDialog } from './RenameDocumentDialog';

function elements(node: ReactNode): ReactElement<any>[] {
  const found: ReactElement<any>[] = [];
  Children.forEach(node, child => {
    if (isValidElement<{ children?: ReactNode }>(child)) found.push(child, ...elements(child.props.children));
  });
  return found;
}

const props = () => ({
  isOpen: true, onOpenChange: vi.fn(), view: 'notes',
  activeDocument: { id: 1, uid: 'qa-file', title: 'QA', project_id: 5 },
  newName: 'QA', setNewName: vi.fn(), projects: [{ id: 5, name: 'QA' }, { id: 6, name: 'Target' }],
  selectedProjectId: '6', setSelectedProjectId: vi.fn(),
});

beforeEach(() => vi.clearAllMocks());

describe('SH-002 Edit dialog creator-only moves', () => {
  it('disables the Project picker without creator permission', async () => {
    const tree = elements(await RenameDocumentDialog(props()));
    expect(tree.find(e => e.type === Select)?.props.disabled).toBe(true);
  });

  it.each([
    ['notes', 'onMoveNoteToProject'], ['drawings', 'onMoveDrawingToProject'],
    ['flowchart', 'onMoveFlowchartToProject'], ['erd', 'onMoveDiagramToProject'],
  ])('blocks stale Project selection for a noncreator %s', async (view, callback) => {
    const move = vi.fn().mockResolvedValue(true);
    const p = { ...props(), view, [callback]: move };
    const save = elements(await RenameDocumentDialog(p)).find(e => e.type === Button && e.props.children === 'Save Changes');
    await save?.props.onClick();
    expect(move).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Only the file creator can move this file.');
    expect(toast.success).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalled();
  });

  it.each([
    ['notes', 'onMoveNoteToProject'], ['drawings', 'onMoveDrawingToProject'],
    ['flowchart', 'onMoveFlowchartToProject'], ['erd', 'onMoveDiagramToProject'],
  ])('does not announce success or close when creator move of %s is refused', async (view, callback) => {
    const move = vi.fn().mockResolvedValue(false);
    const p = { ...props(), view, canMoveProject: true, [callback]: move };
    const save = elements(await RenameDocumentDialog(p)).find(e => e.type === Button && e.props.children === 'Save Changes');
    await save?.props.onClick();
    expect(move).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Failed to update document');
    expect(toast.success).not.toHaveBeenCalled();
    expect(p.onOpenChange).not.toHaveBeenCalled();
  });

  it('keeps creator moves available', async () => {
    const move = vi.fn().mockResolvedValue(true);
    const p = { ...props(), canMoveProject: true, onMoveNoteToProject: move };
    const tree = elements(await RenameDocumentDialog(p));
    expect(tree.find(e => e.type === Select)?.props.disabled).toBe(false);
    await tree.find(e => e.type === Button && e.props.children === 'Save Changes')?.props.onClick();
    expect(move).toHaveBeenCalledWith('qa-file', '6', { silent: true });
    expect(toast.success).toHaveBeenCalledWith('Document updated successfully');
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('still lets a noncreator rename without moving', async () => {
    const rename = vi.fn();
    const p = { ...props(), newName: 'Renamed QA', selectedProjectId: '5', updateNote: rename };
    await elements(await RenameDocumentDialog(p)).find(e => e.type === Button && e.props.children === 'Save Changes')?.props.onClick();
    expect(rename).toHaveBeenCalledWith('qa-file', 'Renamed QA', { silent: true });
    expect(p.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps Project selection available when creating a file', async () => {
    const create = vi.fn();
    const p = { ...props(), mode: 'create' as const, activeDocument: null, onCreate: create };
    const tree = elements(await RenameDocumentDialog(p));
    expect(tree.find(e => e.type === Select)?.props.disabled).toBe(false);
    await tree.find(e => e.type === Button && e.props.children === 'Create')?.props.onClick();
    expect(create).toHaveBeenCalledWith('QA', '6');
  });
});
