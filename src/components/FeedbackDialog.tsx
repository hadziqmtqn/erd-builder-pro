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

export function FeedbackDialog({ isCollapsed }: { isCollapsed?: boolean }) {
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
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger 
          render={
            <DialogTrigger 
              render={
                <Button 
                  variant="ghost" 
                  size={isCollapsed ? "icon" : "sm"} 
                  className={cn(
                    "w-full justify-start gap-2 h-9",
                    isCollapsed ? "size-9 p-0 flex justify-center" : "px-2"
                  )}
                >
                  <MessageSquarePlus className="w-4 h-4 text-muted-foreground" />
                  {!isCollapsed && <span>Kirim Feedback</span>}
                </Button>
              }
            />
          }
        />
        {isCollapsed && (
          <TooltipContent side="right">
            Kirim Feedback
          </TooltipContent>
        )}
      </Tooltip>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Kirim Masukan</DialogTitle>
            <DialogDescription>
              Bantu kami membuat ERD Builder Pro jadi lebih baik. Saran Anda sangat berharga!
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="category">Tipe Masukan</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category" className="w-full">
                  <SelectValue placeholder="Pilih tipe">
                    {category === "suggestion" ? "Saran Fitur" : 
                     category === "bug" ? "Lapor Bug" : 
                     category === "other" ? "Kritik / Lainnya" : category}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="suggestion">Saran Fitur</SelectItem>
                  <SelectItem value="bug">Lapor Bug</SelectItem>
                  <SelectItem value="other">Kritik / Lainnya</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="content">Pesan</Label>
              <textarea
                id="content"
                autoComplete="off"
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Tuliskan masukan Anda di sini..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email (Opsional)</Label>
              <Input
                id="email"
                type="email"
                autoComplete="off"
                placeholder="email@contoh.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Mengirim..." : "Kirim Masukan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
