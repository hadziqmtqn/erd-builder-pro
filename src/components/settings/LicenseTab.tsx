import { useCallback, useEffect, useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type Status = { active: boolean; planCode?: string; expiresAt?: string; lastCheckedAt?: string; maxTeams?: number | null; maxMembers?: number | null; usage: { teamCount: number; memberCount: number } };

type ApiStatus = { active?: boolean; planCode?: string; plan_code?: string; expiresAt?: string; expires_at?: string; lastCheckedAt?: string; last_checked_at?: string; maxTeams?: number | null; max_teams?: number | null; maxMembers?: number | null; max_members?: number | null; usage?: { teamCount?: number; team_count?: number; memberCount?: number; member_count?: number }; error?: string; code?: string };

function normalizeStatus(body: ApiStatus): Status {
  return {
    active: body.active === true,
    planCode: body.planCode ?? body.plan_code,
    expiresAt: body.expiresAt ?? body.expires_at,
    lastCheckedAt: body.lastCheckedAt ?? body.last_checked_at,
    maxTeams: body.maxTeams ?? body.max_teams,
    maxMembers: body.maxMembers ?? body.max_members,
    usage: {
      teamCount: body.usage?.teamCount ?? body.usage?.team_count ?? 0,
      memberCount: body.usage?.memberCount ?? body.usage?.member_count ?? 0,
    },
  };
}

async function responseBody(response: Response) {
  return response.json().catch(() => ({})) as Promise<ApiStatus>;
}

export function LicenseTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await apiFetch("/api/license/status");
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || "Failed to load license status.");
      setStatus(normalizeStatus(body));
    } catch (cause: any) { setError(cause?.message || "Failed to load license status."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const activate = async () => {
    setError("");
    try {
      const response = await apiFetch("/api/license/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ license_key: key }) });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || body.code || "License activation failed.");
      setKey("");
      setStatus(normalizeStatus(body));
      toast.success("License activated");
    } catch (cause: any) { setError(cause?.message || "License activation failed."); }
  };
  const check = async () => {
    setError("");
    setIsChecking(true);
    try {
      const response = await apiFetch("/api/license/check", { method: "POST" });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || body.code || "License check failed.");
      setStatus(normalizeStatus(body));
      toast.success("License checked successfully");
    } catch (cause: any) { setError(cause?.message || "License check failed."); }
    finally { setIsChecking(false); }
  };

  return <div className="space-y-6 p-6"><div><h2 className="text-lg font-semibold">Application License</h2><p className="mt-1 text-sm text-muted-foreground">This instance license controls commercial Team capacity. Personal use does not require activation.</p></div>{status && <div className="rounded-lg border p-4 text-sm"><p className="font-medium">{status.active ? `Active: ${status.planCode}` : "No commercial license is active"}</p><p className="mt-1 text-muted-foreground">Teams: {status.usage.teamCount} / {status.maxTeams ?? "—"} · Members: {status.usage.memberCount} / {status.maxMembers ?? "—"}</p>{status.active && <><Button variant="outline" size="sm" className="mt-3" onClick={() => void check()} disabled={isChecking}>{isChecking ? <RefreshCw className="animate-spin" /> : <RefreshCw />} Check license</Button>{status.lastCheckedAt && <p className="mt-2 text-xs text-muted-foreground">Last checked: {new Date(status.lastCheckedAt).toLocaleString()}</p>}</>}</div>}<div className="space-y-2"><Input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Paste instance license key" /><Button onClick={() => void activate()} disabled={!key.trim() || isChecking}><KeyRound /> Activate license</Button>{error && <p className="text-sm text-destructive">{error}</p>}</div></div>;
}
