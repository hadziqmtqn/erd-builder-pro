import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type AuthorizationDetails = {
  authorization_id: string;
  redirect_uri: string;
  scope: string;
  client: { id: string; name: string; uri?: string };
  user: { id: string; email: string };
};

export function OAuthConsent() {
  const authorizationId = new URLSearchParams(window.location.search).get("authorization_id") || "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState(authorizationId ? "" : "Authorization ID is missing.");
  const [loading, setLoading] = useState(Boolean(authorizationId));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authorizationId) return;
    apiFetch(`/api/oauth/authorizations/${encodeURIComponent(authorizationId)}`, { cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Authorization request could not be loaded.");
        if (data.redirect_url) {
          window.location.assign(data.redirect_url);
          return;
        }
        setDetails(data);
      })
      .catch(reason => setError(reason instanceof Error ? reason.message : "Authorization request could not be loaded."))
      .finally(() => setLoading(false));
  }, [authorizationId]);

  async function decide(action: "approve" | "deny") {
    setSubmitting(true);
    setError("");
    try {
      const response = await apiFetch(`/api/oauth/authorizations/${encodeURIComponent(authorizationId)}/${action}`, { method: "POST" });
      const data = await response.json();
      if (!response.ok || !data.redirect_url) throw new Error(data.error || "Authorization decision failed.");
      window.location.assign(data.redirect_url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authorization decision failed.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <CardTitle>Authorize MCP access</CardTitle>
          <CardDescription>
            {details ? `${details.client.name} wants read-only access to your ERD Builder Pro Web App workspace.` : "Reviewing the authorization request…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {loading && <p className="text-muted-foreground">Loading authorization details…</p>}
          {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">{error}</p>}
          {details && (
            <>
              <div>
                <p className="font-medium">Requesting client</p>
                <p className="mt-1 text-muted-foreground">{details.client.name}</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Redirect: {details.redirect_uri}</p>
              </div>
              <div>
                <p className="font-medium">This client can read</p>
                <p className="mt-1 text-muted-foreground">Projects, regular ERDs, Notes, Flowcharts, Drawings, and document history owned by {details.user.email}.</p>
              </div>
              <div>
                <p className="font-medium">It cannot access</p>
                <p className="mt-1 text-muted-foreground">DB Client, production database diagrams, SQL execution, database credentials, local files, or write operations.</p>
              </div>
              <div>
                <p className="font-medium">OAuth scopes</p>
                <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{details.scope || "email"}</p>
              </div>
            </>
          )}
        </CardContent>
        {details && (
          <CardFooter className="justify-end gap-2">
            <Button variant="outline" disabled={submitting} onClick={() => decide("deny")}>Deny</Button>
            <Button disabled={submitting} onClick={() => decide("approve")}>{submitting ? "Submitting…" : "Allow read-only access"}</Button>
          </CardFooter>
        )}
      </Card>
    </main>
  );
}
