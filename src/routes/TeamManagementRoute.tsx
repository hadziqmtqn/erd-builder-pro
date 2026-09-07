import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Loader2, MoreHorizontal, RefreshCw, UserCheck, UserMinus, UserPlus, UserX, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type { TeamSummary } from "@/hooks/useTeams";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/providers/WorkspaceContext";
import ConfirmModal from "@/components/ConfirmModal";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type TeamDetail = TeamSummary & {
  members: NonNullable<TeamSummary["members"]>;
};

const TEAM_ROLE_LABELS = { manager: "Manager", staff: "Staff" } as const;
const TEMPORARY_PASSWORD_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
type PendingMemberAction = { kind: "remove" | "ban"; userId: string; name: string | null };

function createTemporaryPassword(): string {
  const values = new Uint32Array(18);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => TEMPORARY_PASSWORD_CHARACTERS[value % TEMPORARY_PASSWORD_CHARACTERS.length]).join("");
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  return new Error(typeof body.error === "string" ? body.error : fallback);
}

export function TeamManagementRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [teamName, setTeamName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showMemberPassword, setShowMemberPassword] = useState(false);
  const [showMemberConfirmPassword, setShowMemberConfirmPassword] = useState(false);
  const [memberRole, setMemberRole] = useState<"manager" | "staff">("staff");
  const [createAccount, setCreateAccount] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [pendingMemberAction, setPendingMemberAction] = useState<PendingMemberAction | null>(null);
  const [error, setError] = useState("");
  const isSuperAdmin = Boolean(user?.isSuperAdmin || user?.is_super_admin);
  const { setBreadcrumbLabel } = useWorkspace();
  const passwordMismatch = createAccount && confirmPassword.length > 0 && password !== confirmPassword;

  const closeMemberDialog = () => {
    setMemberDialogOpen(false);
    setEmail("");
    setMemberName("");
    setPassword("");
    setConfirmPassword("");
    setShowMemberPassword(false);
    setShowMemberConfirmPassword(false);
    setCreateAccount(false);
    setMemberRole("staff");
  };

  const generateTemporaryPassword = () => {
    setPassword(createTemporaryPassword());
    setConfirmPassword("");
    setShowMemberPassword(false);
    setShowMemberConfirmPassword(false);
  };

  const handleCreateAccountChange = (checked: boolean) => {
    setCreateAccount(checked);
    if (checked) generateTemporaryPassword();
    else {
      setPassword("");
      setConfirmPassword("");
      setShowMemberPassword(false);
      setShowMemberConfirmPassword(false);
    }
  };

  const fetchTeam = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError("");
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(id)}`);
      if (!response.ok) throw await responseError(response, "Team could not be loaded.");
      setTeam(await response.json());
    } catch (cause: any) {
      setError(cause?.message || "Team could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { void fetchTeam(); }, [fetchTeam]);

  useEffect(() => {
    setBreadcrumbLabel(team?.name || "Team management");
    return () => setBreadcrumbLabel(null);
  }, [setBreadcrumbLabel, team?.name]);

  useEffect(() => { setTeamName(team?.name || ""); }, [team?.name]);

  if (!isSuperAdmin && team && !team.canManage) return <Navigate to="/" replace />;

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !email.trim()) return;
    if (createAccount && password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setAction("add-member");
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(id)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          ...(createAccount ? { name: memberName.trim(), password, confirmPassword } : {}),
          role: memberRole,
        }),
      });
      if (!response.ok) throw await responseError(response, "Member could not be added.");
      setTeam(await response.json());
      closeMemberDialog();
      toast.success("Member added");
    } catch (cause: any) {
      toast.error(cause?.message || "Member could not be added.");
    } finally {
      setAction(null);
    }
  };

  const updateMemberRole = async (userId: string, role: "manager" | "staff") => {
    if (!id) return;
    setAction(`role:${userId}`);
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      if (!response.ok) throw await responseError(response, "Member role could not be updated.");
      setTeam(await response.json());
      toast.success("Member role updated");
    } catch (cause: any) { toast.error(cause?.message || "Member role could not be updated."); }
    finally { setAction(null); }
  };

  const renameTeam = async () => {
    if (!id || !teamName.trim() || teamName.trim() === team?.name) return;
    setAction("rename-team");
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: teamName.trim() }) });
      if (!response.ok) throw await responseError(response, "Team name could not be updated.");
      setTeam(await response.json());
      toast.success("Team name updated");
    } catch (cause: any) { toast.error(cause?.message || "Team name could not be updated."); }
    finally { setAction(null); }
  };

  const removeMember = async (userId: string, memberName: string | null) => {
    if (!id) return;
    setAction(`remove:${userId}`);
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw await responseError(response, "Member could not be removed.");
      await fetchTeam();
      toast.success("Member deactivated");
    } catch (cause: any) {
      toast.error(cause?.message || "Member could not be removed.");
    } finally {
      setAction(null);
    }
  };

  const banMember = async (userId: string, memberName: string | null) => {
    if (!id) return;
    setAction(`ban:${userId}`);
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/ban`, { method: "POST" });
      if (!response.ok) throw await responseError(response, "Member could not be banned.");
      await fetchTeam();
      toast.success("Member banned");
    } catch (cause: any) { toast.error(cause?.message || "Member could not be banned."); }
    finally { setAction(null); }
  };

  const reactivateMember = async (memberEmail: string) => {
    if (!id) return;
    setAction(`reactivate:${memberEmail}`);
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(id)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: memberEmail }),
      });
      if (!response.ok) throw await responseError(response, "Member could not be reactivated.");
      setTeam(await response.json());
      toast.success("Member reactivated");
    } catch (cause: any) {
      toast.error(cause?.message || "Member could not be reactivated.");
    } finally {
      setAction(null);
    }
  };

  if (isLoading) {
    return <main className="flex flex-1 items-center justify-center"><Loader2 className="size-5 animate-spin" aria-label="Loading Team" /></main>;
  }

  if (!team) {
    return (
      <main className="flex flex-1 flex-col items-start gap-4 p-6">
        <Button variant="ghost" onClick={() => navigate("/")}><ArrowLeft /> Back</Button>
        <div>
          <h1 className="text-xl font-semibold">Team unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">{error || "This Team does not exist or is not accessible."}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="-m-4 flex-1 overflow-auto bg-background">
      <div className="flex w-full flex-col gap-6 p-6 lg:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Back to dashboard">
              <ArrowLeft />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Input value={teamName} onChange={(event) => setTeamName(event.target.value)} className="h-9 w-64 text-xl font-semibold" aria-label="Team name" />
                <Button variant="outline" size="sm" onClick={() => void renameTeam()} disabled={action !== null || !teamName.trim() || teamName.trim() === team.name}>Save name</Button>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Manage members, roles, and this Team's projects.</p>
            </div>
          </div>
        </header>

        <div className="grid gap-4">
          <Card className="min-w-0">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2"><Users className="size-4" /> Members</CardTitle>
              <CardDescription>{team.memberCount || 0} active members. The global SuperAdmin is not counted.</CardDescription>
              </div>
              <Button onClick={() => setMemberDialogOpen(true)}><UserPlus /> Add member</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border">
                <Table>
                  <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Joined</TableHead><TableHead className="w-16 text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {team.members.length === 0 && <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No members have been added.</TableCell></TableRow>}
                    {team.members.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name || "Unnamed member"}</TableCell>
                        <TableCell className="text-muted-foreground">{member.email || "—"}</TableCell>
                        <TableCell><Select value={member.role} onValueChange={(value) => value && void updateMemberRole(member.id, value as "manager" | "staff")} disabled={action !== null || member.status !== "active"}><SelectTrigger size="sm" className="w-28"><SelectValue>{TEAM_ROLE_LABELS[member.role]}</SelectValue></SelectTrigger><SelectContent><SelectItem value="manager">{TEAM_ROLE_LABELS.manager}</SelectItem><SelectItem value="staff">{TEAM_ROLE_LABELS.staff}</SelectItem></SelectContent></Select></TableCell>
                        <TableCell><Badge variant="secondary">{member.status === "active" ? "Active" : member.status}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(member.joinedAt)}</TableCell>
                        <TableCell className="text-right"><DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.name || member.email || "member"}`} disabled={action !== null}><MoreHorizontal /></Button>} /><DropdownMenuContent align="end" className="w-48"><DropdownMenuGroup><DropdownMenuLabel>Member actions</DropdownMenuLabel>{member.status === "active" ? <><DropdownMenuItem onClick={() => setPendingMemberAction({ kind: "remove", userId: member.id, name: member.name || member.email })}><UserMinus /> Deactivate member</DropdownMenuItem>{isSuperAdmin && <DropdownMenuItem variant="destructive" onClick={() => setPendingMemberAction({ kind: "ban", userId: member.id, name: member.name || member.email })}><UserX /> Ban member</DropdownMenuItem>}</> : <DropdownMenuItem disabled={!member.email} onClick={() => member.email && void reactivateMember(member.email)}><UserCheck /> Reactivate member</DropdownMenuItem>}</DropdownMenuGroup></DropdownMenuContent></DropdownMenu></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      <Dialog open={memberDialogOpen} onOpenChange={(open) => open ? setMemberDialogOpen(true) : closeMemberDialog()}>
        <DialogContent size="md">
          <form onSubmit={addMember}>
            <DialogHeader>
              <DialogTitle>Add member</DialogTitle>
              <DialogDescription>Add an existing account, or create a new account for this Team.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <Field>
                <FieldLabel htmlFor="team-member-email">Email</FieldLabel>
                <Input id="team-member-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" required autoFocus />
              </Field>
              <Field>
                <FieldLabel>Role</FieldLabel>
                <div role="radiogroup" aria-label="Member role" className="grid gap-2 sm:grid-cols-2">
                  {(["manager", "staff"] as const).map((role) => (
                    <label key={role} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                      <input type="radio" name="team-member-role" value={role} checked={memberRole === role} onChange={() => setMemberRole(role)} className="mt-0.5 size-4 accent-primary" />
                      <span><span className="block text-sm font-medium capitalize">{role}</span><span className="block text-xs text-muted-foreground">{role === "manager" ? "Can manage this Team and its members." : "Can collaborate on this Team's work."}</span></span>
                    </label>
                  ))}
                </div>
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={createAccount} onCheckedChange={(checked) => handleCreateAccountChange(checked === true)} />
                Create a new account
              </label>
              {createAccount && <>
                <Field><FieldLabel htmlFor="team-member-name">Name</FieldLabel><Input id="team-member-name" value={memberName} onChange={(event) => setMemberName(event.target.value)} required /></Field>
                <Field>
                  <FieldLabel htmlFor="team-member-password">Temporary password</FieldLabel>
                  <div className="flex items-start gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Input id="team-member-password" type={showMemberPassword ? "text" : "password"} value={password} readOnly aria-readonly="true" minLength={8} required className="pr-10" />
                      <Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowMemberPassword((visible) => !visible)} aria-label={showMemberPassword ? "Hide temporary password" : "Show temporary password"} aria-pressed={showMemberPassword}>
                        {showMemberPassword ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={generateTemporaryPassword}>
                      <RefreshCw data-icon="inline-start" /> Generate new
                    </Button>
                  </div>
                  <FieldDescription>Generated automatically. Share it securely; the member must change it after signing in.</FieldDescription>
                </Field>
                <Field data-invalid={passwordMismatch}>
                  <FieldLabel htmlFor="team-member-confirm-password">Confirm password</FieldLabel>
                  <div className="relative">
                    <Input id="team-member-confirm-password" type={showMemberConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required aria-invalid={passwordMismatch} className="pr-10" />
                    <Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setShowMemberConfirmPassword((visible) => !visible)} aria-label={showMemberConfirmPassword ? "Hide confirm password" : "Show confirm password"} aria-pressed={showMemberConfirmPassword}>
                      {showMemberConfirmPassword ? <EyeOff /> : <Eye />}
                    </Button>
                  </div>
                  {passwordMismatch ? <FieldDescription className="text-destructive">Passwords do not match.</FieldDescription> : <FieldDescription>Enter the same password again.</FieldDescription>}
                </Field>
              </>}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeMemberDialog} disabled={action !== null}>Cancel</Button>
              <Button type="submit" disabled={action !== null || !email.trim() || (createAccount && (!memberName.trim() || password.length < 8 || confirmPassword.length < 8 || password !== confirmPassword))}>{action === "add-member" && <Loader2 className="animate-spin" />} Add member</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmModal isOpen={Boolean(pendingMemberAction)} title={pendingMemberAction?.kind === "ban" ? "Ban member?" : "Deactivate member?"} message={pendingMemberAction?.kind === "ban" ? `${pendingMemberAction.name || "This member"} cannot be added to this Team again.` : `${pendingMemberAction?.name || "This member"} will lose access to this Team.`} confirmText={pendingMemberAction?.kind === "ban" ? "Ban member" : "Deactivate member"} cancelText="Cancel" variant="danger" onCancel={() => setPendingMemberAction(null)} onConfirm={() => { const pending = pendingMemberAction; setPendingMemberAction(null); if (pending) void (pending.kind === "ban" ? banMember(pending.userId, pending.name) : removeMember(pending.userId, pending.name)); }} />
    </main>
  );
}

export default TeamManagementRoute;
