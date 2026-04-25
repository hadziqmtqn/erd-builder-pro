import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, s3Client, R2_BUCKET_NAME } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";

const router = Router();

// Get backups (paginated)
router.get("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const user = (req as any).user;
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const { data, error, count } = await supabase
      .from('backups')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ data, total: count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Download backup file (Proxy through server for privacy)
router.get("/:id/download", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const user = (req as any).user;
  const { id } = req.params;

  try {
    // 1. Fetch record and verify ownership
    const { data: backup, error } = await supabase
      .from('backups')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !backup) {
      return res.status(404).json({ error: "Backup record not found" });
    }

    if (!backup.file_path) {
      return res.status(400).json({ error: "File has not been uploaded yet" });
    }

    if (!s3Client || !R2_BUCKET_NAME) {
      return res.status(500).json({ error: "Storage is not configured on the server" });
    }

    // 2. Fetch from R2
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: backup.file_path,
    });

    try {
      const response = await s3Client.send(command);
      
      // 3. Stream to response
      res.setHeader('Content-Disposition', `attachment; filename="${backup.name}.sql.gz"`);
      res.setHeader('Content-Type', 'application/gzip');
      
      if (response.Body) {
        (response.Body as any).pipe(res);
      } else {
        throw new Error("Empty response body from storage");
      }
    } catch (s3Error: any) {
      console.error("S3 Get Error:", s3Error);
      return res.status(404).json({ 
        error: `File not found in storage.`,
        details: {
          bucket: R2_BUCKET_NAME,
          key: backup.file_path,
          message: s3Error.message
        }
      });
    }

  } catch (error: any) {
    console.error("Download Error:", error);
    res.status(500).json({ error: `Failed to download file: ${error.message}` });
  }
});

// Create backup record and trigger GitHub Action
router.post("/", authenticate, async (req: ExpressRequest, res: ExpressResponse) => {
  const user = (req as any).user;
  const { name } = req.body;

  try {
    // 1. Create record in Supabase
    const { data: backupRecord, error } = await supabase
      .from('backups')
      .insert([{
        user_id: user.id,
        name: name,
        status: 'pending'
      }])
      .select()
      .single();

    if (error) throw error;

    // 2. Trigger GitHub Action via Repository Dispatch
    if (GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME) {
      await fetch(
        `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'ERD-Builder-Pro'
          },
          body: JSON.stringify({
            event_type: 'database-backup',
            client_payload: {
              backup_id: backupRecord.id,
              user_id: user.id
            }
          })
        }
      ).catch(err => console.error("==> GitHub Trigger Failed:", err));
    }

    res.json(backupRecord);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
