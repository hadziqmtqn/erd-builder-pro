import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { apiFetch, getApiBaseUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface SsoLoginProps {
  configured: boolean;
  loginUrl: string;
  onLogin: (userData?: unknown) => void;
}

export function SsoLogin({ configured, loginUrl, onLogin }: SsoLoginProps) {
  const [linkRequired, setLinkRequired] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    setLinkRequired(url.searchParams.get("sso_link") === "required");
    const error = url.searchParams.get("error");
    if (!error) return;
    toast.error(error);
    url.searchParams.delete("error");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
  }, []);

  const clearLinkState = () => {
    setLinkRequired(false);
    setPassword("");
    const url = new URL(window.location.href);
    url.searchParams.delete("sso_link");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
  };

  const handleLink = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await apiFetch("/api/sso/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.error || "Unable to link the existing Cloud account");
        return;
      }
      clearLinkState();
      onLogin(data.user);
      toast.success("Existing Cloud account linked successfully");
    } catch {
      toast.error("Unable to link the existing Cloud account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{linkRequired ? "Link your existing Cloud account" : "Sign in to ERD Builder Pro Cloud"}</CardTitle>
          <CardDescription>
            {linkRequired
              ? "This verified SSO email already belongs to a Cloud account. Enter that account's current password to confirm ownership."
              : "Your account and subscription are managed by ERDBPro SaaS."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {linkRequired ? (
            <form onSubmit={handleLink}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sso-link-password">Current Cloud password</FieldLabel>
                  <Input id="sso-link-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
                  <FieldDescription>Your ERDBPro SaaS password is not requested here.</FieldDescription>
                </Field>
                <Field className="flex flex-col gap-3">
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Verifying account..." : "Verify and link account"}
                  </Button>
                  <Button type="button" variant="outline" className="w-full" onClick={clearLinkState}>Cancel</Button>
                </Field>
              </FieldGroup>
            </form>
          ) : (
            <>
              <Button className="w-full" disabled={!configured} onClick={() => window.location.assign(`${getApiBaseUrl()}${loginUrl}`)}>
                <LogIn data-icon="inline-start" />
                Continue with ERDBPro SSO
              </Button>
              {!configured && <p className="mt-3 text-center text-sm text-destructive">SSO configuration is incomplete.</p>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
