import { Router, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { supabase, GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME } from "../lib/config.js";
import { authenticate } from "../lib/middleware.js";

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
    console.log("==> GitHub Config Check:", {
      owner: GITHUB_REPO_OWNER,
      repo: GITHUB_REPO_NAME,
      hasToken: !!GITHUB_TOKEN
    });

    if (GITHUB_TOKEN && GITHUB_REPO_OWNER && GITHUB_REPO_NAME) {
      console.log(`==> Triggering GitHub Action for backup: ${backupRecord.id}`);
      
      const githubRes = await fetch(
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
            event_type: 'manual-backup',
            client_payload: {
              backup_id: backupRecord.id,
              user_id: user.id
            }
          })
        }
      );

      console.log(`==> GitHub Response Status: ${githubRes.status} ${githubRes.statusText}`);

      if (!githubRes.ok) {
        const errText = await githubRes.text();
        console.error("==> GitHub API Error Detail:", errText);
      } else {
        console.log("==> GitHub Action triggered successfully!");
      }
    } else {
      console.warn("==> GitHub configuration is incomplete. Missing:", 
        !GITHUB_REPO_OWNER ? "OWNER " : "", 
        !GITHUB_REPO_NAME ? "REPO " : "", 
        !GITHUB_TOKEN ? "TOKEN" : ""
      );
    }

    res.json(backupRecord);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
