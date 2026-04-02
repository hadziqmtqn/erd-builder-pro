import { getEdgeSupabase } from "./lib/edge-config";
import { parseCookies, verifyEdgeToken } from "./lib/edge-auth";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  const cookies = parseCookies(req);
  const token = cookies.token;

  if (!token || !(await verifyEdgeToken(token))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const supabase = getEdgeSupabase();
    
    // Perform parallel fetches using Promise.all
    const [filesRes, notesRes, drawingsRes, projectsRes] = await Promise.all([
      supabase.from("files").select("*").eq("is_deleted", true),
      supabase.from("notes").select("*").eq("is_deleted", true),
      supabase.from("drawings").select("*").eq("is_deleted", true),
      supabase.from("projects").select("*").eq("is_deleted", true),
    ]);

    return new Response(JSON.stringify({
      files: filesRes.data || [],
      notes: notesRes.data || [],
      drawings: drawingsRes.data || [],
      projects: projectsRes.data || [],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "External API error: " + err.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
