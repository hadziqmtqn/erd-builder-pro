import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

type Status = { active: boolean; planCode?: string; expiresAt?: string; maxTeams?: number | null; maxMembers?: number | null; usage: { teamCount: number; memberCount: number } };

export function LicenseTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const load = () => apiFetch("/api/license/status").then((response) => response.json()).then(setStatus).catch(() => setError("Failed to load license status."));
  useEffect(() => { load(); }, []);
  const activate = async () => {
    setError("");
    const response = await apiFetch("/api/license/activate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ license_key: key }) });
    const body = await response.json();
    if (!response.ok) return setError(body.error || "License activation failed.");
    setKey(""); setStatus(body);
  };
  return <div className="space-y-6 p-6"><div><h2 className="text-lg font-semibold">Application License</h2><p className="mt-1 text-sm text-muted-foreground">Optional for personal use. Activate it only when you need licensed Team capacity.</p></div>{status && <div className="rounded-lg border p-4 text-sm"><p className="font-medium">{status.active ? `Active: ${status.planCode}` : "No commercial license is active"}</p><p className="mt-1 text-muted-foreground">Teams: {status.usage.teamCount} / {status.maxTeams ?? "—"} · Members: {status.usage.memberCount} / {status.maxMembers ?? "—"}</p></div>}<div className="space-y-2"><Input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Paste instance license key" /><Button onClick={() => void activate()} disabled={!key.trim()}><KeyRound /> Activate license</Button>{error && <p className="text-sm text-destructive">{error}</p>}</div></div>;
}
