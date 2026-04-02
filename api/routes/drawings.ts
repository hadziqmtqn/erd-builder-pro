import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, s3Client, R2_BUCKET_NAME } from "../lib/config";
import { authenticate } from "../lib/middleware";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

const router = Router();

router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("drawings")
    .select("*, projects!left(*)")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Supabase error fetching drawings:", error);
    return res.status(500).json({ error: error.message });
  }
  
  const filteredData = (data || []).filter((drawing: any) => !drawing.projects || !drawing.projects.is_deleted);
  res.json(filteredData);
});

router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, data, project_id } = req.body;
  const { data: inserted, error } = await supabase
    .from("drawings")
    .insert([{ title, data: data || "[]", project_id: project_id || null }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(inserted);
});

router.get("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { data, error } = await supabase
    .from("drawings")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error || !data) return res.status(404).json({ error: "Drawing not found" });
  res.json(data);
});

router.put("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { title, data, project_id } = req.body;
  const { error } = await supabase
    .from("drawings")
    .update({ title, data, project_id: project_id || null, updated_at: new Date().toISOString() })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.delete("/:id", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("drawings")
    .update({ is_deleted: true })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.post("/:id/restore", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const { error } = await supabase
    .from("drawings")
    .update({ is_deleted: false })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

router.delete("/:id/permanent", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  try {
    // 1. Fetch the drawing data to find associated R2 files
    const { data: drawing } = await supabase
      .from("drawings")
      .select("data")
      .eq("id", req.params.id)
      .single();

    if (drawing && drawing.data && s3Client && R2_BUCKET_NAME) {
      try {
        const parsedData = JSON.parse(drawing.data);
        const files = parsedData.files || {};
        
        // Find all R2 URLs in the files map
        const r2Keys: string[] = [];
        for (const fileId in files) {
          const dataURL = files[fileId].dataURL;
          if (typeof dataURL === "string" && dataURL.includes("erd-builder-pro/")) {
            // Extract the S3 key from the URL
            const key = dataURL.substring(dataURL.indexOf("erd-builder-pro/"));
            r2Keys.push(key);
          }
        }

        // 2. Delete objects from R2 in parallel
        if (r2Keys.length > 0) {
          console.log(`Deleting ${r2Keys.length} images from R2 for drawing ${req.params.id}`);
          await Promise.all(r2Keys.map(key => 
            s3Client.send(new DeleteObjectCommand({
              Bucket: R2_BUCKET_NAME,
              Key: key,
            })).catch(err => {
              console.error(`Failed to delete R2 object ${key}:`, err);
            })
          ));
        }
      } catch (e) {
        console.error("Failed to parse drawing data for R2 cleanup:", e);
      }
    }

    // 3. Delete the record from Supabase
    const { error } = await supabase
      .from("drawings")
      .delete()
      .eq("id", req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
