import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Loader2, RefreshCw, Search, UserCog } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import ConfirmModal from "@/components/ConfirmModal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";

type Membership = { team: { id: string; name: string }; role: string; status: string; joinedAt: string };
type ManagedUser = { id: string; name: string; email: string; createdAt?: string | null; created_at?: string | null; teamMemberships?: Membership[]; team_memberships?: Membership[] };
type Invitation = { id: string; email: string; createdAt: string; expiresAt: string; acceptedAt: string | null; team: { id: string; name: string } };
type Tab = "all" | "no-team" | "former" | "invitations";
type PaginationInfo = { page: number; pageSize: number; total: number; totalPages: number };

const date = (value?: string | null) => {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? "—" : new Date(timestamp).toLocaleDateString();
};
const memberships = (user: ManagedUser) => {
  const values = Array.isArray(user.teamMemberships) ? user.teamMemberships : [];
  return values.length ? values.map((member) => `${member.team?.name || "Unknown Team"} (${member.status})`).join(", ") : "No Team";
};
const emptyPagination: PaginationInfo = { page: 1, pageSize: 20, total: 0, totalPages: 1 };
const normalizeUser = (user: ManagedUser): ManagedUser => ({
  ...user,
  createdAt: user.createdAt ?? user.created_at ?? null,
  teamMemberships: user.teamMemberships ?? user.team_memberships ?? [],
});

export function UserManagementRoute() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>(emptyPagination);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null);

  const load = useCallback(async (nextTab: Tab, nextPage: number, nextSearch: string) => {
    setLoading(true);
    setError("");
    try {
      if (nextTab === "invitations") {
        const response = await apiFetch("/api/users/invitations");
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Unable to load invitations.");
        setInvitations(Array.isArray(body.data) ? body.data : []);
      } else {
        const params = new URLSearchParams({ kind: nextTab, page: String(nextPage), pageSize: "20" });
        if (nextSearch.trim()) params.set("search", nextSearch.trim());
        const response = await apiFetch(`/api/users?${params.toString()}`);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Unable to load users.");
        setUsers(Array.isArray(body.data) ? body.data.map(normalizeUser) : []);
        setPagination(body.pagination || emptyPagination);
      }
    } catch (error: any) { const message = error?.message || "Unable to load user management."; setError(message); toast.error(message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(tab, pagination.page, search), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, pagination.page, search, tab]);
  if (!Boolean(user?.isSuperAdmin || user?.is_super_admin)) return null;
  if (error && !loading) return <main className="flex flex-1 flex-col items-start gap-4 p-6"><Button variant="ghost" onClick={() => navigate("/")}><ArrowLeft /> Back</Button><div><h1 className="text-xl font-semibold">User Management unavailable</h1><p className="mt-1 text-sm text-muted-foreground">{error}</p></div></main>;

  const resetPassword = async (target: ManagedUser) => {
    setAction(target.id);
    try {
      const response = await apiFetch(`/api/users/${encodeURIComponent(target.id)}/reset-password`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to reset password.");
      const password = [body.temporaryPassword, body.temporary_password, body.data?.temporaryPassword, body.data?.temporary_password].find((value): value is string => typeof value === "string" && value.length > 0);
      if (!password) throw new Error("The temporary password was not returned. Restart the server and reset the password again.");
      setTemporaryPassword(password);
      toast.success("Temporary password generated");
    } catch (error: any) { toast.error(error?.message || "Unable to reset password."); }
    finally { setAction(null); }
  };

  const copyPassword = async () => {
    if (!temporaryPassword) return;
    await navigator.clipboard.writeText(temporaryPassword);
    toast.success("Temporary password copied");
  };

  return <main className="-m-4 flex-1 overflow-auto bg-background"><div className="flex w-full flex-col gap-6 p-6 lg:p-8">
    <header className="flex items-start gap-3"><Button variant="ghost" size="icon" onClick={() => navigate("/")} aria-label="Back to dashboard"><ArrowLeft /></Button><div><h1 className="flex items-center gap-2 text-2xl font-semibold"><UserCog className="size-5" /> User Management</h1><p className="mt-1 text-sm text-muted-foreground">Manage commercial Team accounts. Personal SuperAdmin access is not listed here.</p></div></header>
    <Card><CardHeader><CardTitle>Users</CardTitle><CardDescription>Removed and banned members remain visible only to the SuperAdmin.</CardDescription></CardHeader><CardContent>
      <Tabs value={tab} onValueChange={(value) => { setTab(value as Tab); setPagination((current) => ({ ...current, page: 1 })); }}><div className="flex flex-wrap items-center justify-between gap-3"><TabsList><TabsTrigger value="all">All users</TabsTrigger><TabsTrigger value="no-team">No Team</TabsTrigger><TabsTrigger value="former">Former members</TabsTrigger><TabsTrigger value="invitations">Invitations</TabsTrigger></TabsList>{tab !== "invitations" && <div className="relative w-full sm:ml-auto sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPagination((current) => ({ ...current, page: 1 })); }} placeholder="Search name or email" aria-label="Search users by name or email" className="pl-9" /></div>}</div>
        {(["all", "no-team", "former"] as Tab[]).map((value) => <TabsContent key={value} value={value} className="mt-4"><UsersTable users={users} loading={loading} action={action} onReset={(target) => setResetTarget(target)} pagination={pagination} onPageChange={(page) => setPagination((current) => ({ ...current, page }))} /></TabsContent>)}
        <TabsContent value="invitations" className="mt-4"><InvitationsTable invitations={invitations} loading={loading} /></TabsContent>
      </Tabs>
    </CardContent></Card>
  </div>
    <Dialog open={Boolean(temporaryPassword)} onOpenChange={(open) => !open && setTemporaryPassword(null)}><DialogContent size="sm"><DialogHeader><DialogTitle>Temporary password</DialogTitle><DialogDescription>Copy and share this once through a secure channel. It will not be shown again.</DialogDescription></DialogHeader><DialogBody><div className="flex gap-2"><Input value={temporaryPassword || ""} readOnly /><Button type="button" variant="outline" size="icon" onClick={() => void copyPassword()} aria-label="Copy temporary password"><Copy /></Button></div></DialogBody><DialogFooter><Button onClick={() => setTemporaryPassword(null)}>Done</Button></DialogFooter></DialogContent></Dialog>
    <ConfirmModal isOpen={Boolean(resetTarget)} title="Reset member password?" message={`A new temporary password will be created for ${resetTarget?.email || "this member"}. Existing sessions will be signed out.`} confirmText="Reset password" cancelText="Cancel" variant="warning" onCancel={() => setResetTarget(null)} onConfirm={() => { const target = resetTarget; setResetTarget(null); if (target) void resetPassword(target); }} />
  </main>;
}

function UsersTable({ users, loading, action, onReset, pagination, onPageChange }: { users: ManagedUser[]; loading: boolean; action: string | null; onReset: (user: ManagedUser) => void; pagination: PaginationInfo; onPageChange: (page: number) => void }) {
  const first = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const last = Math.min(pagination.page * pagination.pageSize, pagination.total);
  return <div className="rounded-lg border"><Table><TableHeader><TableRow><TableHead>User</TableHead><TableHead>Team history</TableHead><TableHead>Created</TableHead><TableHead className="w-36 text-right">Action</TableHead></TableRow></TableHeader><TableBody>
    {loading ? <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="mx-auto size-4 animate-spin" /></TableCell></TableRow> : users.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No users found.</TableCell></TableRow> : users.map((user) => <TableRow key={user.id}><TableCell><div className="font-medium">{user.name || "Unnamed member"}</div><div className="text-xs text-muted-foreground">{user.email}</div></TableCell><TableCell className="text-muted-foreground">{memberships(user)}</TableCell><TableCell className="text-muted-foreground">{date(user.createdAt)}</TableCell><TableCell className="text-right"><Button variant="outline" size="sm" disabled={action !== null} onClick={() => onReset(user)}>{action === user.id ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reset password</Button></TableCell></TableRow>)}
  </TableBody></Table>{pagination.totalPages > 1 && <div className="flex items-center justify-between gap-3 border-t px-3 py-3 text-xs text-muted-foreground"><span>{first}–{last} of {pagination.total}</span><div className="flex items-center gap-2"><Button variant="outline" size="icon-xs" aria-label="Previous page" disabled={loading || pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}><ChevronLeft /></Button><span className="min-w-20 text-center">Page {pagination.page} of {pagination.totalPages}</span><Button variant="outline" size="icon-xs" aria-label="Next page" disabled={loading || pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)}><ChevronRight /></Button></div></div>}</div>;
}

function InvitationsTable({ invitations, loading }: { invitations: Invitation[]; loading: boolean }) {
  return <div className="rounded-lg border"><Table><TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Team</TableHead><TableHead>Status</TableHead><TableHead>Sent</TableHead></TableRow></TableHeader><TableBody>
    {loading ? <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="mx-auto size-4 animate-spin" /></TableCell></TableRow> : invitations.length === 0 ? <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No invitations found.</TableCell></TableRow> : invitations.map((invitation) => <TableRow key={invitation.id}><TableCell>{invitation.email}</TableCell><TableCell>{invitation.team.name}</TableCell><TableCell><Badge variant="secondary">{invitation.acceptedAt ? "Accepted" : new Date(invitation.expiresAt) < new Date() ? "Expired" : "Pending"}</Badge></TableCell><TableCell className="text-muted-foreground">{date(invitation.createdAt)}</TableCell></TableRow>)}
  </TableBody></Table></div>;
}

export default UserManagementRoute;
