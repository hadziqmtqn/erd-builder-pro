import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, KeyRound, Loader2, RefreshCw, UserCheck, UserMinus, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type { TeamLicense, TeamSummary } from "@/hooks/useTeams";
import { useAuth } from "@/hooks/useAuth";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/providers/WorkspaceContext";

type TeamDetail = TeamSummary & {
  members: NonNullable<TeamSummary["members"]>;
  license: TeamLicense;
};

function licenseLabel(license?: TeamLicense): string {
  if (license?.valid) return "Active";
  if (license?.status === "expired") return "Expired";
  if (license?.status === "not_activated") return "Not activated";
  return "Unavailable";
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
  const [isLoading, setIsLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [password, setPassword] = useState("");
  const [createAccount, setCreateAccount] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [error, setError] = useState("");
  const isSuperAdmin = Boolean(user?.isSuperAdmin || user?.is_super_admin);
  const { setBreadcrumbLabel } = useWorkspace();

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

  useEffect(() => {
    if (isSuperAdmin) void fetchTeam();
  }, [fetchTeam, isSuperAdmin]);

  useEffect(() => {
    setBreadcrumbLabel(team?.name || "Team management");
    return () => setBreadcrumbLabel(null);
  }, [setBreadcrumbLabel, team?.name]);

  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !email.trim()) return;
    setAction("add-member");
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(id)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          ...(createAccount ? { name: memberName.trim(), password } : {}),
        }),
      });
      if (!response.ok) throw await responseError(response, "Member could not be added.");
      setTeam(await response.json());
      setEmail("");
      setMemberName("");
      setPassword("");
      setCreateAccount(false);
      setMemberDialogOpen(false);
      toast.success("Member added");
    } catch (cause: any) {
      toast.error(cause?.message || "Member could not be added.");
    } finally {
      setAction(null);
    }
  };

  const removeMember = async (userId: string, memberName: string | null) => {
    if (!id || !window.confirm(`Remove ${memberName || "this member"} from the Team?`)) return;
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

  const checkLicense = async () => {
    if (!id) return;
    setAction("license");
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(id)}/license/check`, { method: "POST" });
      if (!response.ok) throw await responseError(response, "License could not be checked.");
      setTeam(await response.json());
      toast.success("License checked");
    } catch (cause: any) {
      toast.error(cause?.message || "License could not be checked.");
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

  const license = team.license;
  const memberLimit = license.maxMembers ?? "—";

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
                <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
                <Badge variant={license.valid ? "secondary" : "destructive"}>{licenseLabel(license)}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Team management</p>
            </div>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="min-w-0">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2"><Users className="size-4" /> Members</CardTitle>
              <CardDescription>{team.memberCount || 0} of {memberLimit} member seats used. The global SuperAdmin is not counted.</CardDescription>
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
                        <TableCell><Badge variant="outline">Member</Badge></TableCell>
                        <TableCell><Badge variant="secondary">{member.status === "active" ? "Active" : member.status}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(member.joinedAt)}</TableCell>
                        <TableCell className="text-right">
                      {member.status === "active" ? <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void removeMember(member.id, member.name || member.email)}
                        disabled={action !== null}
                        aria-label={`Deactivate ${member.name || member.email || "member"}`}
                      >
                        {action === `remove:${member.id}` ? <Loader2 className="animate-spin" /> : <UserMinus />}
                      </Button> : <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => member.email && void reactivateMember(member.email)}
                        disabled={action !== null || !member.email}
                        aria-label={`Reactivate ${member.name || member.email || "member"}`}
                      >
                        {action === `reactivate:${member.email}` ? <Loader2 className="animate-spin" /> : <UserCheck />}
                      </Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><KeyRound className="size-4" /> License</CardTitle>
                <CardDescription>Self-host entitlement for this Team.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <dt className="text-muted-foreground">Plan</dt><dd className="text-right font-medium">{license.planCode || "—"}</dd>
                  <dt className="text-muted-foreground">Key</dt><dd className="text-right font-medium">{license.codeLastFour ? `••••${license.codeLastFour}` : "Not shown"}</dd>
                  <dt className="text-muted-foreground">Members</dt><dd className="text-right font-medium">{memberLimit}</dd>
                  <dt className="text-muted-foreground">Expires</dt><dd className="text-right font-medium">{formatDate(license.expiresAt)}</dd>
                </dl>
                {team.canManage && (
                  <Button variant="outline" className="w-full" onClick={() => void checkLicense()} disabled={action !== null}>
                    {action === "license" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Check license
                  </Button>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
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
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={createAccount} onCheckedChange={(checked) => setCreateAccount(checked === true)} />
                Create a new account
              </label>
              {createAccount && <>
                <Field><FieldLabel htmlFor="team-member-name">Name</FieldLabel><Input id="team-member-name" value={memberName} onChange={(event) => setMemberName(event.target.value)} required /></Field>
                <Field><FieldLabel htmlFor="team-member-password">Temporary password</FieldLabel><Input id="team-member-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /><FieldDescription>Share this password securely. The member can change it after signing in.</FieldDescription></Field>
              </>}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMemberDialogOpen(false)} disabled={action !== null}>Cancel</Button>
              <Button type="submit" disabled={action !== null || !email.trim() || (createAccount && (!memberName.trim() || password.length < 8))}>{action === "add-member" && <Loader2 className="animate-spin" />} Add member</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

export default TeamManagementRoute;
