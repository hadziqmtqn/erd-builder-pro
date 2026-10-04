import { useCallback, useEffect, useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";

import ConfirmModal from "@/components/ConfirmModal";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

type Status = {
  active: boolean;
  planCode?: string;
  expiresAt?: string;
  lastCheckedAt?: string;
  maxTeams?: number | null;
  maxMembers?: number | null;
  usage: { teamCount: number; memberCount: number };
};

type ApiStatus = {
  active?: boolean;
  planCode?: string;
  plan_code?: string;
  expiresAt?: string;
  expires_at?: string;
  lastCheckedAt?: string;
  last_checked_at?: string;
  maxTeams?: number | null;
  max_teams?: number | null;
  maxMembers?: number | null;
  max_members?: number | null;
  usage?: {
    teamCount?: number;
    team_count?: number;
    memberCount?: number;
    member_count?: number;
  };
  error?: string;
  code?: string;
};

type LicenseTabError = {
  message: string;
  code?: string;
};

function normalizeStatus(body: ApiStatus): Status {
  return {
    active: body.active === true,
    planCode: body.planCode ?? body.plan_code,
    expiresAt: body.expiresAt ?? body.expires_at,
    lastCheckedAt: body.lastCheckedAt ?? body.last_checked_at,
    maxTeams: body.maxTeams ?? body.max_teams,
    maxMembers: body.maxMembers ?? body.max_members,
    usage: {
      teamCount: body.usage?.teamCount ?? body.usage?.team_count ?? 0,
      memberCount: body.usage?.memberCount ?? body.usage?.member_count ?? 0,
    },
  };
}

function responseError(body: ApiStatus, fallback: string): LicenseTabError {
  return {
    message: body.error || fallback,
    ...(body.code ? { code: body.code } : {}),
  };
}

async function responseBody(response: Response) {
  return response.json().catch(() => ({})) as Promise<ApiStatus>;
}

export function LicenseTab() {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState("");
  const [activationGrant, setActivationGrant] = useState("");
  const [error, setError] = useState<LicenseTabError | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [showActivateConfirm, setShowActivateConfirm] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch("/api/license/status");
      const body = await responseBody(response);
      if (!response.ok) {
        setError(responseError(body, "Failed to load license status."));
        return;
      }
      setStatus(normalizeStatus(body));
    } catch (cause) {
      setError({
        message:
          cause instanceof Error
            ? cause.message
            : "Failed to load license status.",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activate = async () => {
    setError(null);
    setIsActivating(true);

    try {
      const payload: { license_key: string; activation_grant?: string } = {
        license_key: key.trim(),
      };
      const grant = activationGrant.trim();
      if (grant) payload.activation_grant = grant;

      const response = await apiFetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(responseError(body, "License activation failed."));
        return;
      }

      setKey("");
      setActivationGrant("");
      setStatus(normalizeStatus(body));
      toast.success("License activated");
    } catch (cause) {
      setError({
        message:
          cause instanceof Error ? cause.message : "License activation failed.",
      });
    } finally {
      setIsActivating(false);
    }
  };

  const check = async () => {
    setError(null);
    setIsChecking(true);

    try {
      const response = await apiFetch("/api/license/check", { method: "POST" });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(responseError(body, "License check failed."));
        return;
      }

      setStatus(normalizeStatus(body));
      toast.success("License checked successfully");
    } catch (cause) {
      setError({
        message: cause instanceof Error ? cause.message : "License check failed.",
      });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <>
      <div className="space-y-6 p-6">
        <div>
          <h2 className="text-lg font-semibold">Application License</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This instance license controls commercial Team capacity. Personal
            use does not require activation.
          </p>
        </div>

        {status && (
          <div className="rounded-lg border p-4 text-sm">
            <p className="font-medium">
              {status.active
                ? `Active: ${status.planCode}`
                : "No commercial license is active"}
            </p>
            <p className="mt-1 text-muted-foreground">
              Active Teams: {status.usage.teamCount} /{" "}
              {status.maxTeams ?? (status.active ? "No limit" : "N/A")} · Active
              members: {status.usage.memberCount} /{" "}
              {status.maxMembers ?? (status.active ? "No limit" : "N/A")}
            </p>
            {status.active && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void check()}
                  disabled={isChecking || isActivating}
                >
                  {isChecking ? (
                    <RefreshCw className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  Check license
                </Button>
                {status.lastCheckedAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last checked: {new Date(status.lastCheckedAt).toLocaleString()}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="instance-license-key">
              Instance license key
            </FieldLabel>
            <Input
              id="instance-license-key"
              type="password"
              autoComplete="off"
              disabled={isActivating}
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
                setError(null);
              }}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="instance-activation-grant">
              Activation grant
            </FieldLabel>
            <Input
              id="instance-activation-grant"
              type="password"
              autoComplete="off"
              disabled={isActivating}
              aria-describedby="activation-grant-description"
              value={activationGrant}
              onChange={(event) => {
                setActivationGrant(event.target.value);
                setError(null);
              }}
            />
            <FieldDescription id="activation-grant-description">
              Only needed after resetting a deployment binding. Enter the
              one-time grant from SaaS with the same license key.
            </FieldDescription>
          </Field>
        </FieldGroup>

        <div className="space-y-2">
          <Button
            onClick={() => setShowActivateConfirm(true)}
            disabled={!key.trim() || isChecking || isActivating}
          >
            <KeyRound />
            {isActivating ? "Activating..." : "Activate license"}
          </Button>
          {error && (
            <div id="license-activation-error" role="alert">
              <p className="text-sm text-destructive">{error.message}</p>
              {error.code && (
                <p className="font-mono text-xs text-muted-foreground">
                  Code: {error.code}
                </p>
              )}
              {error.code === "LICENSE_ALREADY_BOUND" && (
                <p className="text-sm text-muted-foreground">
                  Reset the old deployment binding in SaaS, then enter its
                  activation grant above.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showActivateConfirm}
        title="Activate license?"
        message="This will activate the license for this Self-host instance and update its Team and member capacity."
        confirmText="Activate license"
        cancelText="Cancel"
        variant="info"
        onCancel={() => setShowActivateConfirm(false)}
        onConfirm={() => {
          setShowActivateConfirm(false);
          void activate();
        }}
      />
    </>
  );
}
