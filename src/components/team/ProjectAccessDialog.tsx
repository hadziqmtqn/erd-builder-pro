import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AccessRole = "owner" | "manager" | "editor" | "commenter" | "viewer";
type AccessMember = { userId: string; name: string | null; email: string | null; teamRole: string; role: AccessRole; isCreator: boolean; canChange: boolean };

export const ACCESS_ROLE_LABEL: Record<AccessRole, string> = {
  owner: "Creator",
  manager: "Manager",
  editor: "Editor",
  commenter: "Commenter",
  viewer: "Viewer",
};

const CHANGEABLE: ReadonlyArray<Exclude<AccessRole, "owner" | "manager">> = ["editor", "commenter", "viewer"];
const ROLE_HELP: Record<(typeof CHANGEABLE)[number] | "owner", string> = {
  owner: "Full access as the Project creator.",
  editor: "Can change the files.",
  commenter: "Can read and comment.",
  viewer: "Can read only.",
};

type Props = { project: { id: number | string; name: string } | null; onOpenChange: (open: boolean) => void };

/** The API converts field names to snake_case, so accept either spelling. */
export function normalizeAccessMember(raw: any): AccessMember {
  return {
    userId: String(raw.user_id ?? raw.userId),
    name: raw.name ?? null,
    email: raw.email ?? null,
    teamRole: String(raw.team_role ?? raw.teamRole ?? "staff"),
    role: raw.role,
    isCreator: (raw.is_creator ?? raw.isCreator) === true,
    canChange: (raw.can_change ?? raw.canChange) === true,
  };
}

/** Owners and Team Managers choose what each Team member may do in one Project (COL-004). The server re-checks every change. */
export function ProjectAccessDialog({ project, onOpenChange }: Props) {
  const [members, setMembers] = useState<AccessMember[] | null>(null);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const projectId = project?.id;

  const load = useCallback(async () => {
    if (projectId === undefined) return;
    setError("");
    try {
      const response = await apiFetch(`/api/projects/${encodeURIComponent(String(projectId))}/access`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load access.");
      setMembers((body.members ?? []).map(normalizeAccessMember));
    } catch (err) {
      setMembers(null);
      setError(err instanceof Error ? err.message : "Could not load access.");
    }
  }, [projectId]);

  useEffect(() => {
    setMembers(null);
    if (projectId !== undefined) void load();
  }, [projectId, load]);

  const change = async (member: AccessMember, role: string) => {
    if (role === member.role || projectId === undefined) return;
    setSavingId(member.userId);
    try {
      const url = `/api/projects/${encodeURIComponent(String(projectId))}/access/${encodeURIComponent(member.userId)}`;
      // Each default (Commenter, or Creator for the Project creator) removes the explicit role instead of storing a copy of it.
      const response = role === (member.isCreator ? "owner" : "commenter")
        ? await apiFetch(url, { method: "DELETE" })
        : await apiFetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not change access.");
      setMembers((current) => current?.map((item) => item.userId === member.userId ? { ...item, role: role as AccessRole } : item) ?? current);
      toast.success(`${member.name || member.email || "Member"} is now ${ACCESS_ROLE_LABEL[role as AccessRole]}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change access.");
      await load();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={project !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Project access</DialogTitle>
          <DialogDescription>
            Choose what each Team member can do in {project?.name}. Team Managers always have full access; only a Manager can limit the Project creator.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {!error && members === null && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading members…
            </div>
          )}
          {members && members.length === 0 && <p className="text-sm text-muted-foreground">This Team has no other active members.</p>}
          {members && members.length > 0 && !members.some((member) => member.canChange) && (
            <p className="mb-3 text-sm text-muted-foreground">
              Everyone here already has full access as the Project creator or a Team Manager, so there is no role to change. Roles apply to other Staff members of the Team.
            </p>
          )}
          {members && members.length > 0 && (
            <ul className="divide-y rounded-lg border" aria-label="Project members">
              {members.map((member) => (
                <li key={member.userId} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{member.name || member.email || "Member"}</p>
                    {member.name && member.email && <p className="truncate text-xs text-muted-foreground">{member.email}</p>}
                  </div>
                  {member.canChange ? (
                    <Select value={member.role} onValueChange={(value) => { if (value) void change(member, value); }} disabled={savingId === member.userId}>
                      <SelectTrigger className="w-36" aria-label={`Access for ${member.name || member.email || "member"}`}>
                        <SelectValue>{ACCESS_ROLE_LABEL[member.role]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="min-w-72">
                        <SelectGroup>
                          {(member.isCreator ? (["owner", ...CHANGEABLE] as const) : CHANGEABLE).map((role) => (
                            <SelectItem key={role} value={role}>
                              <span className="flex flex-col">
                                <span>{ACCESS_ROLE_LABEL[role]}</span>
                                <span className="text-xs text-muted-foreground">{ROLE_HELP[role]}{role === (member.isCreator ? "owner" : "commenter") ? " Default." : ""}</span>
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="w-36 px-3 text-sm text-muted-foreground">{ACCESS_ROLE_LABEL[member.role]}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
