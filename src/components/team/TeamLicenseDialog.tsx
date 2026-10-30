import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SELF_HOST_PRICING_URL = "https://www.erdbuilderpro.com/pricing/self-host";

export type TeamLicenseIssue =
  | { kind: "inactive" }
  | { kind: "expired" }
  | { kind: "invalid" }
  | { kind: "sync" }
  | { kind: "limit"; used: number; max: number };

type LicenseStatus = {
  active?: boolean;
  code?: string;
  maxTeams?: number | null;
  usage?: { teamCount?: number };
};

/** Maps GET /api/license/status to the Add Team outcome; null means the form may open (SH-007). */
export function teamLicenseIssue(status: LicenseStatus): TeamLicenseIssue | null {
  if (status.active === true) {
    const used = status.usage?.teamCount ?? 0;
    const max = status.maxTeams;
    return typeof max === "number" && used >= max ? { kind: "limit", used, max } : null;
  }
  if (status.code === "LICENSE_NOT_ACTIVATED") return { kind: "inactive" };
  if (status.code === "LICENSE_EXPIRED") return { kind: "expired" };
  return { kind: "invalid" };
}

export function TeamLicenseDialog({
  issue,
  onOpenChange,
  onOpenLicenseSettings,
  onManageTeams,
  onRetry,
}: {
  issue: TeamLicenseIssue | null;
  onOpenChange: (open: boolean) => void;
  onOpenLicenseSettings: () => void;
  onManageTeams: () => void;
  onRetry: () => void;
}) {
  const close = () => onOpenChange(false);
  const buy = () => window.open(SELF_HOST_PRICING_URL, "_blank", "noopener,noreferrer");
  const settings = () => { close(); onOpenLicenseSettings(); };

  type Action = [label: string, run: () => void];
  const describe = (value: TeamLicenseIssue): { title: string; body: string; primary: Action; secondary: Action } => {
    switch (value.kind) {
      case "inactive": return { title: "Unlock Teams", body: "Teams need a Self-host license key. Personal Workspace stays free.", primary: ["Buy license", buy], secondary: ["Activate key", settings] };
      case "expired": return { title: "License expired", body: "Renew to access your Teams again. Your data is safe.", primary: ["Renew", buy], secondary: ["Check again", settings] };
      case "invalid": return { title: "License can't be verified", body: "Reactivate your key on this server. Your data is safe.", primary: ["Reactivate", settings], secondary: ["Close", close] };
      case "sync": return { title: "Can't reach license server", body: "Existing Teams still work. Try again later.", primary: ["Try again", () => { close(); onRetry(); }], secondary: ["Close", close] };
      case "limit": return { title: "Team limit reached", body: `You're using ${value.used} of ${value.max} Teams. Upgrade to add more.`, primary: ["Upgrade", buy], secondary: ["Manage Teams", () => { close(); onManageTeams(); }] };
    }
  };
  const content = issue ? describe(issue) : null;

  return (
    <Dialog open={issue !== null} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        {content && (
          <>
            <DialogHeader>
              <DialogTitle>{content.title}</DialogTitle>
              <DialogDescription>{content.body}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={content.secondary[1]}>{content.secondary[0]}</Button>
              <Button type="button" onClick={content.primary[1]}>{content.primary[0]}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
