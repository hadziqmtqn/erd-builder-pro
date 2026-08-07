import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const DEFAULT_FEEDBACK_ENDPOINT = "https://api.erdbuilderpro.com/api/feedback";

function getFeedbackEndpoint(): string {
  const configuredEndpoint = import.meta.env.VITE_FEEDBACK_API_URL?.trim();
  if (configuredEndpoint) return configuredEndpoint.replace(/\/+$/, "");
  return DEFAULT_FEEDBACK_ENDPOINT;
}

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = React.useState(false);
  const [content, setContent] = React.useState("");
  const [category, setCategory] = React.useState("suggestion");
  const [email, setEmail] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      const response = await fetch(getFeedbackEndpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({
          content,
          category,
          email,
          url: window.location.href,
          browser: navigator.userAgent,
        }),
      });

      if (response.ok) {
        toast.success("Feedback terkirim! Terima kasih masukannya.");
        onOpenChange(false);
        setContent("");
      } else {
        throw new Error();
      }
    } catch (error) {
      toast.error("Gagal mengirim feedback. Coba lagi nanti.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { onOpenChange(val); if (!val) { setContent(""); } }}>
      <DialogContent className="sm:max-w-106.25 border-border bg-popover/95 backdrop-blur-xl shadow-2xl">
          <form onSubmit={handleSubmit} className="flex flex-col max-h-[inherit]">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Kirim Masukan</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Bantu kami membuat ERD Builder Pro jadi lebih baik. Saran Anda sangat berharga!
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="category" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipe Masukan</Label>
                <Select value={category} onValueChange={(val) => val && setCategory(val)}>
                  <SelectTrigger id="category" className="bg-white/5 border-white/10 focus:ring-primary/50">
                    <SelectValue placeholder="Pilih tipe">
                      {category === "suggestion" ? "Saran Fitur" : 
                       category === "bug" ? "Lapor Bug" : 
                       category === "other" ? "Kritik / Lainnya" : category}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border text-popover-foreground">
                    <SelectItem value="suggestion" className="focus:bg-muted">Saran Fitur</SelectItem>
                    <SelectItem value="bug" className="focus:bg-muted text-destructive">Lapor Bug</SelectItem>
                    <SelectItem value="other" className="focus:bg-muted">Kritik / Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="content" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pesan</Label>
                <textarea
                  id="content"
                  autoComplete="off"
                  className="flex min-h-35 w-full rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-all resize-none"
                  placeholder="Tuliskan masukan Anda di sini..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  maxLength={3000}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email (Opsional)</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="off"
                  placeholder="email@contoh.com"
                  className="bg-muted/50 border-border focus:ring-primary/50 h-10 px-4"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </DialogBody>
            <DialogFooter className="gap-3">
              <Button 
                variant="ghost" 
                type="button" 
                onClick={() => onOpenChange(false)}
                className="hover:bg-muted"
              >
                Batal
              </Button>
              <Button type="submit" disabled={loading} className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20">
                {loading ? "Mengirim..." : "Kirim Masukan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
  );
}
