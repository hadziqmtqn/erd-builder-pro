import React from 'react';
import { 
  Trash, 
  Folder, 
  Database, 
  StickyNote, 
  PenTool, 
  Network,
  RefreshCcw, 
  Trash2 as TrashIcon 
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface TrashViewProps {
  trashData: {
    projects: any[];
    diagrams: any[];
    notes: any[];
    drawings: any[];
    flowcharts: any[];
  };
  restoreProject: (id: number) => Promise<void>;
  restoreDiagram: (id: number) => Promise<void>;
  restoreNote: (id: number) => Promise<void>;
  restoreDrawing: (id: number) => Promise<void>;
  restoreFlowchart: (id: number) => Promise<void>;
  fetchTrash: () => void;
  handleProjectPermanentDelete: (id: number) => void;
  handleDiagramPermanentDelete: (id: number) => void;
  handleNotePermanentDelete: (id: number) => void;
  handleDrawingPermanentDelete: (id: number) => void;
  handleFlowchartPermanentDelete: (id: number) => void;
}

export function TrashView({
  trashData,
  restoreProject,
  restoreDiagram,
  restoreNote,
  restoreDrawing,
  restoreFlowchart,
  fetchTrash,
  handleProjectPermanentDelete,
  handleDiagramPermanentDelete,
  handleNotePermanentDelete,
  handleDrawingPermanentDelete,
  handleFlowchartPermanentDelete
}: TrashViewProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 border rounded-xl bg-background overflow-hidden">
      <div className="p-6 border-b shrink-0">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Trash size={24} className="text-muted-foreground" />
          Trash Bin
        </h2>
        <p className="text-sm text-muted-foreground">Manage your deleted files and projects. Items can be restored or permanently deleted.</p>
      </div>
      <div className="flex-1 h-0 overflow-y-auto custom-scrollbar">
        <div className="p-6 space-y-12">
          {/* Projects Table */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Folder size={18} className="text-orange-400" />
                Projects
              </h3>
              <Badge variant="outline">{trashData.projects.length} Items</Badge>
            </div>
            {trashData.projects.length === 0 ? (
              <div className="text-center py-12 border rounded-lg border-dashed text-muted-foreground">No deleted projects</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project Name</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trashData.projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium flex items-center gap-2">
                          <Folder size={14} className="text-muted-foreground" />
                          {project.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {new Date(project.deleted_at || project.updated_at || project.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={async () => { await restoreProject(project.id); fetchTrash(); }}>
                              <RefreshCcw size={14} className="mr-1" /> Restore
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleProjectPermanentDelete(project.id)}>
                              <TrashIcon size={14} className="mr-1" /> Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Diagrams Table */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Database size={18} className="text-blue-400" />
                Diagrams
              </h3>
              <Badge variant="outline">{trashData.diagrams.length} Items</Badge>
            </div>
            {trashData.diagrams.length === 0 ? (
              <div className="text-center py-12 border rounded-lg border-dashed text-muted-foreground">No deleted diagrams</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Diagram Name</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trashData.diagrams.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell className="font-medium flex items-center gap-2">
                          <Database size={14} className="text-muted-foreground" />
                          {file.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs font-semibold">
                          {file.projects?.name || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {new Date(file.deleted_at || file.updated_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={async () => { await restoreDiagram(file.id); fetchTrash(); }}>
                              <RefreshCcw size={14} className="mr-1" /> Restore
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleDiagramPermanentDelete(file.id)}>
                              <TrashIcon size={14} className="mr-1" /> Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Notes Table */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <StickyNote size={18} className="text-yellow-400" />
                Notes
              </h3>
              <Badge variant="outline">{trashData.notes.length} Items</Badge>
            </div>
            {trashData.notes.length === 0 ? (
              <div className="text-center py-12 border rounded-lg border-dashed text-muted-foreground">No deleted notes</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Note Title</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trashData.notes.map((note) => (
                      <TableRow key={note.id}>
                        <TableCell className="font-medium flex items-center gap-2">
                          <StickyNote size={14} className="text-muted-foreground" />
                          {note.title}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs font-semibold">
                          {note.projects?.name || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {new Date(note.deleted_at || note.updated_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={async () => { await restoreNote(note.id); fetchTrash(); }}>
                              <RefreshCcw size={14} className="mr-1" /> Restore
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleNotePermanentDelete(note.id)}>
                              <TrashIcon size={14} className="mr-1" /> Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Drawings Table */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <PenTool size={18} className="text-purple-400" />
                Drawings
              </h3>
              <Badge variant="outline">{trashData.drawings.length} Items</Badge>
            </div>
            {trashData.drawings.length === 0 ? (
              <div className="text-center py-12 border rounded-lg border-dashed text-muted-foreground">No deleted drawings</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Drawing Title</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trashData.drawings.map((drawing) => (
                      <TableRow key={drawing.id}>
                        <TableCell className="font-medium flex items-center gap-2">
                          <PenTool size={14} className="text-muted-foreground" />
                          {drawing.title}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs font-semibold">
                          {drawing.projects?.name || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {new Date(drawing.deleted_at || drawing.updated_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={async () => { await restoreDrawing(drawing.id); fetchTrash(); }}>
                              <RefreshCcw size={14} className="mr-1" /> Restore
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleDrawingPermanentDelete(drawing.id)}>
                              <TrashIcon size={14} className="mr-1" /> Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
          {/* Flowcharts Table */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Network size={18} className="text-green-400" />
                Flowcharts
              </h3>
              <Badge variant="outline">{trashData.flowcharts?.length || 0} Items</Badge>
            </div>
            {!trashData.flowcharts || trashData.flowcharts.length === 0 ? (
              <div className="text-center py-12 border rounded-lg border-dashed text-muted-foreground">No deleted flowcharts</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Flowchart Title</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trashData.flowcharts.map((flowchart) => (
                      <TableRow key={flowchart.id}>
                        <TableCell className="font-medium flex items-center gap-2">
                          <Network size={14} className="text-muted-foreground" />
                          {flowchart.title}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs font-semibold">
                          {flowchart.projects?.name || '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {new Date(flowchart.deleted_at || flowchart.updated_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={async () => { await restoreFlowchart(flowchart.id); fetchTrash(); }}>
                              <RefreshCcw size={14} className="mr-1" /> Restore
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => handleFlowchartPermanentDelete(flowchart.id)}>
                              <TrashIcon size={14} className="mr-1" /> Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
