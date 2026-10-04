import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { TeamSummary } from "@/hooks/useTeams";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const TEMPORARY_PASSWORD_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
function createTemporaryPassword(): string {
  const values = new Uint32Array(18);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => TEMPORARY_PASSWORD_CHARACTERS[value % TEMPORARY_PASSWORD_CHARACTERS.length]).join("");
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => ({}));
  return new Error(typeof body.error === "string" ? body.error : fallback);
}

export function TeamMemberDialog({ teamId, open: memberDialogOpen, onOpenChange: setMemberDialogOpen, onAdded }: {
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (team: TeamSummary & { members: NonNullable<TeamSummary["members"]> }) => void;
}) {
  const [action, setAction] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [memberName, setMemberName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showMemberPassword, setShowMemberPassword] = useState(false);
  const [showMemberConfirmPassword, setShowMemberConfirmPassword] = useState(false);
  const [memberRole, setMemberRole] = useState<"manager" | "staff">("staff");
  const [createAccount, setCreateAccount] = useState(false);
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

  const addMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!teamId || !email.trim()) return;
    if (createAccount && password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setAction("add-member");
    try {
      const response = await apiFetch(`/api/teams/${encodeURIComponent(teamId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          ...(createAccount ? { name: memberName.trim(), password, confirmPassword } : {}),
          role: memberRole,
        }),
      });
      if (!response.ok) throw await responseError(response, "Member could not be added.");
      onAdded(await response.json());
      closeMemberDialog();
      toast.success("Member added");
    } catch (cause: any) {
      toast.error(cause?.message || "Member could not be added.");
    } finally {
      setAction(null);
    }
  };

  return (
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
                    <label key={role} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-primary/5">
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
                  <FieldDescription>Generated automatically. Share it securely; changing this password after signing in is optional.</FieldDescription>
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
  );
}
