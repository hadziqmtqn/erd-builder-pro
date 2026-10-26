import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '@/providers/WorkspaceContext';
import { DiscussionsPanel, type CollaborationContext, type CollaborationFeatureType } from './diagram/DiscussionsPanel';
import type { PaneFile } from '@/lib/file-panes';
import { noteAnchorText } from '@/lib/noteAnchorMerge';

export function FileSessionDiscussions({ file, active, target, teamId }: { file: PaneFile; active: boolean; target: HTMLElement | null; teamId?: string | null }) {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const document = workspace.activeDocument;
  const projectId = document?.project_id ?? document?.projectId;
  const project = workspace.projects.find(project => String(project.id) === String(projectId));
  const projectTeam = project?.team_id ?? project?.teamId;
  if (!target || !document || workspace.isGuest || !projectTeam || String(projectTeam) !== String(teamId)) return null;
  const featureType: CollaborationFeatureType = file.type === 'erd' ? 'diagram' : file.type === 'notes' ? 'note' : file.type === 'drawings' ? 'drawing' : 'flowchart';
  const onContextSelected = (context: CollaborationContext) => {
    if (context.featureType === featureType && String(context.fileId) === file.uid) {
      if (featureType === 'diagram' && context.anchorId) window.dispatchEvent(new CustomEvent('erd-discussion-anchor-selected', { detail: { fileId: file.uid, type: context.anchorType, id: context.anchorId } }));
      return;
    }
    const paths = { diagram: 'diagrams', note: 'notes', drawing: 'drawings', flowchart: 'flowcharts' };
    navigate(`/${paths[context.featureType]}/${encodeURIComponent(context.fileId)}`);
  };
  const anchor = workspace.selectedEdgeId ? { type: 'relationship' as const, id: workspace.selectedEdgeId }
    : workspace.selectedNodeId ? { type: 'table' as const, id: workspace.selectedNodeId } : null;
  return createPortal(<span hidden={!active}>
    <DiscussionsPanel projectId={String(projectId)} teamId={String(teamId)} fileContext={{ featureType, fileId: file.uid, label: document.title || document.name || file.title }}
      userId={workspace.user?.id ? String(workspace.user.id) : undefined} userName={workspace.user?.name || workspace.user?.email}
      readOnly={workspace.getFileAccessRole(document) === 'viewer'} anchorContext={anchor} onContextSelected={onContextSelected}
      anchorPreview={featureType === 'note' ? id => noteAnchorText(document.content, id) : undefined} />
  </span>, target);
}
