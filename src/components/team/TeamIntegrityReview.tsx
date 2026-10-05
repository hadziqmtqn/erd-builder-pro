import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TeamFileRecovery } from "./TeamFileRecovery";

export type IntegrityReview = {
  team: { id: string; name: string; status: string };
  teamSignatureValid: boolean;
  members: Array<{ id: string; userId: string; name: string | null; email: string | null; status: string; signatureValid: boolean }>;
};
export type PendingIntegrityQuarantine = { kind: "team"; name: string } | { kind: "member"; userId: string; name: string };

export function TeamIntegrityReview({ review, busy, onQuarantine }: { review: IntegrityReview; busy: boolean; onQuarantine: (record: PendingIntegrityQuarantine) => void }) {
  const navigate = useNavigate();
  const quarantined = review.team.status === "quarantined";
  const invalidMembers = review.members.filter((member) => member.status === "active" && !member.signatureValid);
  return (
    <div className="flex w-full flex-col gap-6 p-6 lg:p-8">
      <header className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/team-workspaces")} aria-label="Back to Team Workspaces"><ArrowLeft /></Button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold">{review.team.name}</h1><Badge variant={quarantined ? "destructive" : "secondary"}>{quarantined ? "Quarantined" : "Review required"}</Badge></div>
          <p className="mt-1 text-sm text-muted-foreground">{quarantined ? "Select files to copy to an active Team." : "Resolve access issues for this Team."}</p>
        </div>
      </header>
      {!review.teamSignatureValid && !quarantined && <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"><div><h2 className="font-medium">Team verification failed</h2><p className="mt-1 text-sm text-muted-foreground">Quarantine this Team to block access and retain its files.</p></div><Button variant="destructive" disabled={busy} onClick={() => onQuarantine({ kind: "team", name: review.team.name })}>Quarantine Team</Button></div>}
      {quarantined && <TeamFileRecovery teamId={review.team.id} />}
      {review.teamSignatureValid && invalidMembers.length > 0 && <section className="space-y-3"><h2 className="text-lg font-semibold">Unverified memberships</h2><div className="rounded-lg border"><Table><TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Email</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader><TableBody>{invalidMembers.map((member) => <TableRow key={member.id}><TableCell className="font-medium">{member.name || "Unnamed member"}</TableCell><TableCell className="text-muted-foreground">{member.email || "—"}</TableCell><TableCell className="text-right"><Button variant="destructive" size="sm" disabled={busy || review.team.status !== "active"} onClick={() => onQuarantine({ kind: "member", userId: member.userId, name: member.name || member.email || "this member" })}>Quarantine membership</Button></TableCell></TableRow>)}</TableBody></Table></div></section>}
      {!quarantined && review.teamSignatureValid && invalidMembers.length === 0 && <p className="text-sm text-muted-foreground">No membership issues were found. Check the instance license and capacity limits.</p>}
    </div>
  );
}
