import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export function ForcePasswordChange({ user, onComplete }: { user: any; onComplete: (user: any) => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [saving, setSaving] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPassword.length < 8 || newPassword !== confirmPassword) return;
    setSaving(true);
    try {
      const response = await apiFetch("/api/account", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Unable to change password.");
      onComplete({ ...user, ...body.user, mustChangePassword: false });
      toast.success("Password updated");
    } catch (error: any) { toast.error(error?.message || "Unable to change password."); }
    finally { setSaving(false); }
  };
  const passwordType = showPasswords ? "text" : "password";
  const visibilityButton = <button type="button" aria-label={showPasswords ? "Hide passwords" : "Show passwords"} onClick={() => setShowPasswords(value => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{showPasswords ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>;

  return <main className="flex min-h-screen items-center justify-center bg-background p-6"><form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-5 rounded-xl border bg-card p-6 shadow-sm"><div className="flex flex-col gap-2"><KeyRound className="size-6 text-primary" /><h1 className="text-xl font-semibold">Change your password</h1><p className="text-sm text-muted-foreground">Use the temporary password provided by your Team administrator, then set a new password before continuing.</p></div><Field><FieldLabel htmlFor="temporary-password">Temporary password</FieldLabel><div className="relative"><Input id="temporary-password" type={passwordType} className="pr-10" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />{visibilityButton}</div></Field><Field><FieldLabel htmlFor="new-password">New password</FieldLabel><div className="relative"><Input id="new-password" type={passwordType} className="pr-10" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />{visibilityButton}</div><FieldDescription>At least 8 characters.</FieldDescription></Field><Field data-invalid={confirmPassword.length > 0 && confirmPassword !== newPassword}><FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel><div className="relative"><Input id="confirm-password" type={passwordType} className="pr-10" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} aria-invalid={confirmPassword.length > 0 && confirmPassword !== newPassword} required />{visibilityButton}</div></Field><Button type="submit" disabled={saving || newPassword.length < 8 || newPassword !== confirmPassword}>{saving && <Loader2 className="animate-spin" />} Save new password</Button></form></main>;
}
