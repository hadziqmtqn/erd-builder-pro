import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquarePlus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("suggestion");
  const [email, setEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setOpen(false);
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
    <div className="fixed bottom-6 right-6 z-[9999]">
      <Dialog open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger 
            render={
              <DialogTrigger 
                render={
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className={cn(
                      "size-12 rounded-full shadow-2xl border-white/10 bg-background/80 backdrop-blur-md",
                      "hover:bg-accent hover:border-primary/50 transition-all duration-300",
                      "group relative overflow-hidden"
                    )}
                  >
                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <MessageSquarePlus className="w-5 h-5 text-primary group-hover:scale-110 transition-transform duration-300" />
                  </Button>
                }
              />
            }
          />
          <TooltipContent side="left" className="font-medium">
            Kirim Feedback
          </TooltipContent>
        </Tooltip>
        
        <DialogContent className="sm:max-w-[425px] border-white/10 bg-[#0f0f14]/95 backdrop-blur-xl shadow-2xl">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">Kirim Masukan</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                Bantu kami membuat ERD Builder Pro jadi lebih baik. Saran Anda sangat berharga!
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-5 py-6">
              <div className="grid gap-2">
                <Label htmlFor="category" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipe Masukan</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category" className="bg-white/5 border-white/10 focus:ring-primary/50">
                    <SelectValue placeholder="Pilih tipe">
                      {category === "suggestion" ? "Saran Fitur" : 
                       category === "bug" ? "Lapor Bug" : 
                       category === "other" ? "Kritik / Lainnya" : category}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a1a24] border-white/10 text-white">
                    <SelectItem value="suggestion" className="focus:bg-white/10">Saran Fitur</SelectItem>
                    <SelectItem value="bug" className="focus:bg-white/10 text-destructive">Lapor Bug</SelectItem>
                    <SelectItem value="other" className="focus:bg-white/10">Kritik / Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="content" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pesan</Label>
                <textarea
                  id="content"
                  autoComplete="off"
                  className="flex min-h-[140px] w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm ring-offset-background placeholder:text-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition-all resize-none"
                  placeholder="Tuliskan masukan Anda di sini..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
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
                  className="bg-white/5 border-white/10 focus:ring-primary/50 h-10 px-4"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="gap-3">
              <Button 
                variant="ghost" 
                type="button" 
                onClick={() => setOpen(false)}
                className="hover:bg-white/5"
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
    </div>
  );
}
