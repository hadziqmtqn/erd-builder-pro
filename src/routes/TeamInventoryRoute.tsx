import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ConfirmModal from "@/components/ConfirmModal";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";

type TeamInventoryItem = {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  memberCount: number;
  activeMemberCount: number;
  canChangeStatus: boolean;
};

type TeamInventory = {
  teams: TeamInventoryItem[];
  usage: { teamCount: number; memberCount: number };
  license: { maxTeams: number | null; maxMembers: number | null } | null;
};

const statusVariant = (status: string) => status === "active"
  ? "default"
  : status === "quarantined" ? "destructive" : "secondary";

const statusLabel = (status: string) => status === "quarantined"
  ? "Quarantined"
  : status.charAt(0).toUpperCase() + status.slice(1);

export function TeamInventoryRoute() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSuperAdmin = Boolean(user?.isSuperAdmin || user?.is_super_admin);
  const [inventory, setInventory] = useState<TeamInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingTeam, setPendingTeam] = useState<TeamInventoryItem | null>(null);
  const [action, setAction] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/teams/inventory");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to load Team workspaces.");
      setInventory(body);
    } catch (cause: any) {
      setError(cause?.message || "Unable to load Team workspaces.");
    } finally {
      setLoading(false);
    }
  }, []);

  const changeStatus = async (team: TeamInventoryItem) => {
    const status = team.status === "active" ? "inactive" : "active";
    setAction(team.id);
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(team.id)}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Team status could not be changed.");
      window.dispatchEvent(new CustomEvent("team-status-changed", { detail: { teamId: team.id, status } }));
      toast.success(status === "active" ? "Team activated" : "Team deactivated; its data was retained.");
      await load();
    } catch (cause: any) {
      toast.error(cause?.message || "Team status could not be changed.");
    } finally { setAction(null); }
  };
  const overCapacity = inventory?.license && (
    (inventory.license.maxTeams !== null && inventory.usage.teamCount > inventory.license.maxTeams)
    || (inventory.license.maxMembers !== null && inventory.usage.memberCount > inventory.license.maxMembers)
  );
  const description = overCapacity
    ? "License capacity exceeded. Deactivate Teams or memberships until active usage fits; data remains stored."
    : inventory && !inventory.license
      ? "Check or activate the instance license in Settings to change Team status."
      : "Review status and manage local Team workspaces.";

  useEffect(() => { if (isSuperAdmin) void load(); }, [isSuperAdmin, load]);

  if (!isSuperAdmin) {
    return <main className="flex flex-1 items-start p-6"><p>Only the SuperAdmin can view Team workspaces.</p></main>;
  }

  return (
    <main className="-m-4 flex-1 overflow-auto bg-background">
      <div className="flex w-full flex-col gap-6 p-6 lg:p-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Back to dashboard"><ArrowLeft /></Button>
            <div>
              <h1 className="text-2xl font-semibold">Team Workspaces</h1>
              <p role={overCapacity ? "alert" : undefined} className={`mt-1 text-sm ${overCapacity ? "text-destructive" : "text-muted-foreground"}`}>{description}</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </Button>
        </header>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Memberships</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-52 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Loading Team workspaces…</TableCell></TableRow>
                : error ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Team workspaces could not be loaded.</TableCell></TableRow>
                  : !inventory?.teams.length ? <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No Team workspaces found.</TableCell></TableRow>
                  : inventory.teams.map((team) => <TableRow key={team.id}>
                    <TableCell className="font-medium">{team.name}</TableCell>
                    <TableCell><Badge variant={statusVariant(team.status)}>{statusLabel(team.status)}</Badge></TableCell>
                    <TableCell>{team.activeMemberCount} active / {team.memberCount} total</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(team.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell><div className="flex justify-end gap-2">
                      {team.canChangeStatus && <Button variant="outline" size="sm" disabled={action !== null || !inventory?.license} onClick={() => setPendingTeam(team)}>{team.status === "active" ? "Deactivate" : "Activate"}</Button>}
                      <Button variant="outline" size="sm" onClick={() => navigate(`/teams/${encodeURIComponent(team.id)}?from=team-workspaces`)}>Review</Button>
                    </div></TableCell>
                  </TableRow>)}
            </TableBody>
          </Table>
        </div>
      </div>
      <ConfirmModal isOpen={Boolean(pendingTeam)} title={pendingTeam?.status === "active" ? "Deactivate this Team?" : "Activate this Team?"}
        message={pendingTeam?.status === "active" ? `${pendingTeam.name} will stop accepting Team access. Its documents and memberships will be retained; inactive Teams do not use an active Team slot.` : `${pendingTeam?.name || "This Team"} will become available to its active members if active Team and member limits allow it.`}
        confirmText={pendingTeam?.status === "active" ? "Deactivate" : "Activate"} cancelText="Cancel" variant="warning"
        onCancel={() => setPendingTeam(null)} onConfirm={() => { const team = pendingTeam; setPendingTeam(null); if (team) void changeStatus(team); }} />
    </main>
  );
}

export default TeamInventoryRoute;
