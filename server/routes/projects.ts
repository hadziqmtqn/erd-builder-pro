import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, s3Client, R2_BUCKET_NAME } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";
import { handleError, getSafeUpdate } from "../lib/utils.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;
  const q = req.query.q as string;

  let query = supabase
    .from("projects")
    .select(`
      *,
      diagrams(id, uid, name, updated_at, created_at, is_deleted, project_id),
      notes(id, uid, title, content, updated_at, created_at, is_deleted, project_id),
      drawings(id, uid, title, updated_at, created_at, is_deleted, project_id),
      flowcharts(id, uid, title, updated_at, created_at, is_deleted, project_id)
    `, { count: 'exact' })
    .eq("is_deleted", false)
    .eq("user_id", (req as any).user.id);

  if (q && q.trim()) {
    const searchTerm = `%${q.trim()}%`;
    const userId = (req as any).user.id;
    
    // Find project IDs that have matching children
    const [dMatches, nMatches, drMatches, fMatches] = await Promise.all([
      supabase.from("diagrams").select("project_id").ilike("name", searchTerm).eq("user_id", userId).not("project_id", "is", null).eq("is_deleted", false),
      supabase.from("notes").select("project_id").ilike("title", searchTerm).eq("user_id", userId).not("project_id", "is", null).eq("is_deleted", false),
      supabase.from("drawings").select("project_id").ilike("title", searchTerm).eq("user_id", userId).not("project_id", "is", null).eq("is_deleted", false),
      supabase.from("flowcharts").select("project_id").ilike("title", searchTerm).eq("user_id", userId).not("project_id", "is", null).eq("is_deleted", false),
    ]);

    const matchingProjectIds = new Set([
      ...(dMatches.data?.map((m: { project_id: number | null }) => m.project_id) || []),
      ...(nMatches.data?.map((m: { project_id: number | null }) => m.project_id) || []),
      ...(drMatches.data?.map((m: { project_id: number | null }) => m.project_id) || []),
      ...(fMatches.data?.map((m: { project_id: number | null }) => m.project_id) || []),
    ]);

    if (matchingProjectIds.size > 0) {
      query = query.or(`name.ilike.${searchTerm},id.in.(${Array.from(matchingProjectIds).join(",")})`);
    } else {
      query = query.ilike("name", searchTerm);
    }
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("created_at", { foreignTable: "diagrams", ascending: false })
    .order("created_at", { foreignTable: "notes", ascending: false })
    .order("created_at", { foreignTable: "drawings", ascending: false })
    .order("created_at", { foreignTable: "flowcharts", ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return handleError(res, error, "Supabase error fetching projects");
  
  const searchLower = q?.trim().toLowerCase();

  // Filter out deleted items and apply in-memory search filter for nested items
  const projectsWithFiles = (data || []).map((project: any) => {
    let diagrams = (project.diagrams || []).filter((f: any) => !f.is_deleted);
    let notes = (project.notes || []).filter((f: any) => !f.is_deleted);
    let drawings = (project.drawings || []).filter((f: any) => !f.is_deleted);
    let flowcharts = (project.flowcharts || []).filter((f: any) => !f.is_deleted);
    
    if (searchLower) {
      diagrams = diagrams.filter((f: any) => f.name.toLowerCase().includes(searchLower));
      notes = notes.filter((f: any) => f.title.toLowerCase().includes(searchLower));
      drawings = drawings.filter((f: any) => f.title.toLowerCase().includes(searchLower));
      flowcharts = flowcharts.filter((f: any) => f.title.toLowerCase().includes(searchLower));
    }

    return {
      ...project,
      diagrams,
      notes,
      drawings,
      flowcharts,
      files_count: diagrams.length + notes.length + drawings.length + flowcharts.length
    };
  });
  
  // Also fetch Uncategorized files (project_id is null)
  const userId = (req as any).user.id;
  let uDQuery = supabase.from("diagrams").select("id, uid, name, updated_at, is_deleted, project_id").is("project_id", null).eq("is_deleted", false).eq("user_id", userId);
  let uNQuery = supabase.from("notes").select("id, uid, title, updated_at, is_deleted, project_id").is("project_id", null).eq("is_deleted", false).eq("user_id", userId);
  let uDrQuery = supabase.from("drawings").select("id, uid, title, updated_at, is_deleted, project_id").is("project_id", null).eq("is_deleted", false).eq("user_id", userId);
  let uFQuery = supabase.from("flowcharts").select("id, uid, title, updated_at, is_deleted, project_id").is("project_id", null).eq("is_deleted", false).eq("user_id", userId);

  if (searchLower) {
    uDQuery = uDQuery.ilike("name", `%${searchLower}%`);
    uNQuery = uNQuery.ilike("title", `%${searchLower}%`);
    uDrQuery = uDrQuery.ilike("title", `%${searchLower}%`);
    uFQuery = uFQuery.ilike("title", `%${searchLower}%`);
  }

  const [uDiagrams, uNotes, uDrawings, uFlowcharts] = await Promise.all([
    uDQuery.order("created_at", { ascending: false }),
    uNQuery.order("created_at", { ascending: false }),
    uDrQuery.order("created_at", { ascending: false }),
    uFQuery.order("created_at", { ascending: false }),
  ]);
  
  res.json({ 
    data: projectsWithFiles, 
    uncategorized: {
      diagrams: uDiagrams.data || [],
      notes: uNotes.data || [],
      drawings: uDrawings.data || [],
      flowcharts: uFlowcharts.data || []
    },
    total: count
  });
});

router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name } = req.body;
  const { data, error } = await supabase
    .from("projects")
    .insert([{ name, user_id: (req as any).user.id }])
    .select()
    .single();

  if (error) return handleError(res, error, "Failed to create project");
  res.json(data);
});

router.put("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { name } = req.body;
  const { error } = await supabase
    .from("projects")
    .update({ name })
    .eq("id", req.params.id)
    .eq("user_id", (req as any).user.id);

  if (error) return handleError(res, error, "Failed to update project");
  res.json({ success: true });
});

router.delete("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const projectId = req.params.id;
  const update = getSafeUpdate(true);
  
  const { error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", projectId)
    .eq("user_id", (req as any).user.id);

  if (error) return handleError(res, error, "Failed to delete project");

  // Cascading soft delete
  try {
    await Promise.all([
      supabase.from("diagrams").update(update).eq("project_id", projectId),
      supabase.from("notes").update(update).eq("project_id", projectId),
      supabase.from("drawings").update(update).eq("project_id", projectId),
      supabase.from("flowcharts").update(update).eq("project_id", projectId),
    ]);
  } catch (err) {
    console.error("Cascading soft delete failed:", err);
  }

  res.json({ success: true });
});

router.post("/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const projectId = req.params.id;
  const update = getSafeUpdate(false);

  const { error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", projectId)
    .eq("user_id", (req as any).user.id);

  if (error) return handleError(res, error, "Failed to restore project");

  // Cascading restore
  try {
    await Promise.all([
      supabase.from("diagrams").update(update).eq("project_id", projectId),
      supabase.from("notes").update(update).eq("project_id", projectId),
      supabase.from("drawings").update(update).eq("project_id", projectId),
      supabase.from("flowcharts").update(update).eq("project_id", projectId),
    ]);
  } catch (err) {
    console.error("Cascading restore failed:", err);
  }

  res.json({ success: true });
});

router.delete("/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const projectId = req.params.id;
  
  try {
    const { data: diagrams } = await supabase.from("diagrams").select("id").eq("project_id", projectId);
    const diagramIds = diagrams?.map((f: { id: number }) => f.id) || [];

    if (diagramIds.length > 0) {
      await supabase.from("relationships").delete().in("diagram_id", diagramIds);
      const { data: entities } = await supabase.from("entities").select("id").in("diagram_id", diagramIds);
      const entityIds = entities?.map((e: { id: number }) => e.id) || [];
      if (entityIds.length > 0) {
        await supabase.from("columns").delete().in("entity_id", entityIds);
      }
      await supabase.from("entities").delete().in("diagram_id", diagramIds);
      await supabase.from("diagrams").delete().in("id", diagramIds);
    }
    
    // Delete images from notes before deleting notes
    const { data: notes } = await supabase.from("notes").select("content").eq("project_id", projectId);
    if (notes && notes.length > 0 && s3Client && R2_BUCKET_NAME) {
      for (const note of notes) {
        if (note.content) {
          const regex = /<img[^>]+src="([^">]+)"/g;
          let match;
          while ((match = regex.exec(note.content)) !== null) {
            const url = match[1];
            if (url.includes('erd-builder-pro/')) {
              const key = url.substring(url.indexOf('erd-builder-pro/'));
              try {
                await s3Client.send(new DeleteObjectCommand({
                  Bucket: R2_BUCKET_NAME,
                  Key: key,
                }));
              } catch (err) {
                console.error("Failed to delete image from R2 during project deletion:", err);
              }
            }
          }
        }
      }
    }

    await supabase.from("notes").delete().eq("project_id", projectId);
    await supabase.from("drawings").delete().eq("project_id", projectId);
    await supabase.from("projects").delete().eq("id", projectId).eq("user_id", (req as any).user.id);

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
