import { describe, expect, it } from 'vitest'
import { collectProjectFiles, mergeProjectFiles } from './ProjectFileTabs'

describe('ProjectFileTabs metadata', () => {
  it('shows cached project files immediately without deleted or production ERDs', () => {
    const files = collectProjectFiles(1, {
      notes: [{ uid: 'note-1', title: 'Active note', project_id: 1 }],
      diagrams: [
        { uid: 'erd-1', name: 'Schema', project_id: 1 },
        { uid: 'prod-1', name: 'Production', project_id: 1, source_type: 'production_db' },
      ],
      flowcharts: [{ uid: 'flow-1', title: 'Flow', project_id: 2 }],
      drawings: [{ uid: 'draw-1', title: 'Deleted', project_id: 1, is_deleted: true }],
    })

    expect(files.map(file => file.uid)).toEqual(['note-1', 'erd-1'])
  })

  it('deduplicates server metadata while keeping newer local labels', () => {
    const files = mergeProjectFiles(
      [{ type: 'notes', uid: 'note-1', title: 'Old title' }],
      [{ type: 'notes', uid: 'note-1', title: 'Current title' }],
    )

    expect(files).toEqual([{ type: 'notes', uid: 'note-1', title: 'Current title' }])
  })
})
