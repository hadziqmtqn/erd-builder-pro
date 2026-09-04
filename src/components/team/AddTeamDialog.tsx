import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function AddTeamDialog({
  open,
  onOpenChange,
  onCreate,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; licenseKey: string }) => Promise<unknown>;
  onCreated?: (team: any) => void;
}) {
  const [name, setName] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setLicenseKey("");
      setError("");
      setIsSubmitting(false);
    }
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const team = await onCreate({ name, licenseKey });
      onOpenChange(false);
      onCreated?.(team);
    } catch (cause: any) {
      setError(cause?.message || "Team could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Add Team</DialogTitle>
            <DialogDescription>
              Connect a Self-host license to create a Team. The license key is sent only during activation.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field>
              <FieldLabel htmlFor="team-name">Team name</FieldLabel>
              <Input
                id="team-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme Engineering"
                maxLength={100}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="team-license-key">License key</FieldLabel>
              <Input
                id="team-license-key"
                type="password"
                value={licenseKey}
                onChange={(event) => setLicenseKey(event.target.value)}
                placeholder="Paste your Self-host license key"
                maxLength={512}
                required
              />
            </Field>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim() || !licenseKey.trim()}>
              {isSubmitting ? "Activating…" : "Add Team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
