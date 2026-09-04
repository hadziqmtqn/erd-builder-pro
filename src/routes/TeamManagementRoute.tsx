import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, KeyRound, Loader2, RefreshCw, ShieldCheck, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import type { TeamLicense, TeamSummary } from "@/hooks/useTeams";

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
  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

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
    void fetchTeam();
  }, [fetchTeam]);

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !email.trim()) return;
    setAction("add-member");
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(id)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) throw await responseError(response, "Member could not be added.");
      setTeam(await response.json());
      setEmail("");
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
      setTeam((current) => current && {
        ...current,
        members: current.members.filter((member) => member.id !== userId),
        member_count: Math.max(0, (current.member_count || 0) - 1),
      });
      toast.success("Member removed");
    } catch (cause: any) {
      toast.error(cause?.message || "Member could not be removed.");
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
  const memberLimit = license.max_members ?? "—";

  return (
    <main className="flex-1 overflow-auto bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6 lg:p-8">
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

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="size-4" /> Members</CardTitle>
              <CardDescription>{team.member_count || 0} of {memberLimit} member seats used. The global SuperAdmin is not counted.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {team.can_manage && (
                <form onSubmit={addMember} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Field className="flex-1">
                    <FieldLabel htmlFor="team-member-email">Add existing account</FieldLabel>
                    <Input
                      id="team-member-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="member@example.com"
                      required
                    />
                    <FieldDescription>Invitation email will be added in a later slice.</FieldDescription>
                  </Field>
                  <Button type="submit" disabled={action !== null || !email.trim()}>
                    {action === "add-member" && <Loader2 className="animate-spin" />}
                    Add member
                  </Button>
                </form>
              )}

              <div className="divide-y rounded-lg border">
                {team.members.length === 0 && <p className="p-4 text-sm text-muted-foreground">No members yet.</p>}
                {team.members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {(member.name || member.email || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{member.name || member.email || "Unnamed member"}</p>
                      {member.name && <p className="truncate text-xs text-muted-foreground">{member.email || "No email"}</p>}
                    </div>
                    {team.can_manage && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void removeMember(member.id, member.name || member.email)}
                        disabled={action !== null}
                        aria-label={`Remove ${member.name || member.email || "member"}`}
                      >
                        {action === `remove:${member.id}` ? <Loader2 className="animate-spin" /> : <UserMinus />}
                      </Button>
                    )}
                  </div>
                ))}
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
                  <dt className="text-muted-foreground">Plan</dt><dd className="text-right font-medium">{license.plan_code || "—"}</dd>
                  <dt className="text-muted-foreground">Key</dt><dd className="text-right font-medium">{license.code_last_four ? `••••${license.code_last_four}` : "Not shown"}</dd>
                  <dt className="text-muted-foreground">Members</dt><dd className="text-right font-medium">{memberLimit}</dd>
                  <dt className="text-muted-foreground">Expires</dt><dd className="text-right font-medium">{formatDate(license.expires_at)}</dd>
                </dl>
                {team.can_manage && (
                  <Button variant="outline" className="w-full" onClick={() => void checkLicense()} disabled={action !== null}>
                    {action === "license" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Check license
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" /> Access model</CardTitle>
                <CardDescription>Kept intentionally small for the first Team release.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2"><Badge variant="outline">SuperAdmin</Badge><Badge variant="outline">Member</Badge></div>
                <p className="text-muted-foreground">Only the global SuperAdmin manages the Team, license, and members. Team-level Admin and RBAC are not enabled.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

export default TeamManagementRoute;
