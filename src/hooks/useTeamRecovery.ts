import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

export type RecoveryType = "erd" | "notes" | "drawings" | "flowchart";
export type RecoveryFile = {
  type: RecoveryType; id: number; name: string; projectId: number; projectName: string; updatedAt: string | null;
  recovery: { at: string; teamName: string } | null;
};
type Inventory = { files: RecoveryFile[]; destinations: { id: string; name: string }[] };
export const recoveryFileKey = (file: { type: RecoveryType; id: number }) => `${file.type}:${file.id}`;

export function useTeamRecovery(teamId: string) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetTeamId, setTargetTeamId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const operationId = useRef(crypto.randomUUID());
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(teamId)}/recovery`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Files could not be loaded.");
      setInventory(body);
      setSelected((previous) => new Set([...previous].filter((value) => body.files.some((file: RecoveryFile) => recoveryFileKey(file) === value))));
      setTargetTeamId((previous) => body.destinations.some((team: { id: string }) => team.id === previous) ? previous : null);
    } catch (cause) {
      setInventory(null);
      setSelected(new Set());
      setTargetTeamId(null);
      setError(cause instanceof Error ? cause.message : "Files could not be loaded.");
    }
    finally { setLoading(false); }
  }, [teamId]);

  useEffect(() => { void load(); }, [load]);

  const select = (keys: string[], checked: boolean) => {
    operationId.current = crypto.randomUUID();
    setSelected((previous) => {
      const next = new Set(previous);
      for (const key of keys) { if (checked) next.add(key); else next.delete(key); }
      return next;
    });
  };
  const chooseTarget = (id: string | null) => {
    operationId.current = crypto.randomUUID();
    setTargetTeamId(id);
  };
  const recover = async () => {
    if (inFlight.current || !targetTeamId || selected.size === 0) return;
    inFlight.current = true;
    setProcessing(true);
    try {
      const files = (inventory?.files || []).filter((file) => selected.has(recoveryFileKey(file))).map(({ id, type }) => ({ id, type }));
      const response = await apiFetch(`/api/teams/${encodeURIComponent(teamId)}/recovery`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId: operationId.current, targetTeamId, files }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Files could not be recovered.");
      toast.success(`${body.fileCount} ${body.fileCount === 1 ? "file" : "files"} recovered into ${body.projectCount} ${body.projectCount === 1 ? "project" : "projects"}.`);
      setSelected(new Set());
      operationId.current = crypto.randomUUID();
      window.dispatchEvent(new CustomEvent("team-files-recovered", { detail: { teamId: targetTeamId } }));
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Files could not be recovered."); }
    finally { inFlight.current = false; setProcessing(false); }
  };
  return { inventory, loading, error, selected, targetTeamId, processing, load, select, chooseTarget, recover };
}
