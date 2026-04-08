import React, { useState, useEffect } from 'react';
import { 
  History, 
  ExternalLink, 
  Calendar, 
  Tag, 
  ChevronRight, 
  Sparkles,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const GITHUB_REPO = 'hadziqmtqn/erd-builder-pro';

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
}

export function ChangelogView() {
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<GitHubRelease | null>(null);

  useEffect(() => {
    const fetchReleases = async () => {
      try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases`);
        if (!response.ok) throw new Error('Failed to fetch releases');
        const data = await response.json();
        setReleases(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchReleases();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground animate-pulse">Fetching latest updates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-4 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-6 h-6 text-destructive" />
        </div>
        <div className="space-y-2">
          <h3 className="font-bold text-lg">Gagal memuat Changelog</h3>
          <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
        </div>
        <Button onClick={() => window.location.reload()} variant="outline">Coba Lagi</Button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      <div className="flex items-center justify-between p-6 border-b bg-muted/20">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />
            What's New
          </h2>
          <p className="text-sm text-muted-foreground">
            Lacak pembaruan dan perubahan terbaru pada ERD Builder Pro.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<a href={`https://github.com/${GITHUB_REPO}/releases`} target="_blank" rel="noreferrer" />}>
          <ExternalLink className="w-4 h-4 mr-2" />
          GitHub Releases
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl mx-auto relative pl-8 space-y-12">
          {/* Vertical Timeline Line */}
          <div className="absolute left-[15px] top-2 bottom-0 w-px bg-border" />

          <AnimatePresence mode="popLayout">
            {releases.map((release, index) => (
              <motion.div
                key={release.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                {/* Timeline Dot */}
                <div className={cn(
                  "absolute -left-[32px] top-1.5 size-8 rounded-full border-4 border-background flex items-center justify-center transition-colors",
                  index === 0 ? "bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]" : "bg-muted"
                )}>
                  {index === 0 ? <Sparkles className="w-4 h-4 text-primary-foreground" /> : <Tag className="w-3 h-3 text-muted-foreground" />}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge variant={release.prerelease ? "secondary" : "default"} className="font-mono text-xs px-2 pointer-events-none">
                      v{release.tag_name.replace('v', '')}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(release.published_at), 'MMMM d, yyyy')}
                    </span>
                    {index === 0 && (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-tighter bg-primary/5 text-primary border-primary/20">
                        Latest
                      </Badge>
                    )}
                  </div>

                  <Card className={cn(
                    "group transition-all duration-300 hover:border-primary/50 cursor-pointer overflow-hidden backdrop-blur-sm",
                    index === 0 ? "bg-primary/5 border-primary/20 shadow-lg shadow-primary/5" : "bg-card/50"
                  )} onClick={() => setSelectedRelease(release)}>
                    <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                      <div className="space-y-1">
                        <CardTitle className="text-base font-bold group-hover:text-primary transition-colors">
                          {release.name || `Release ${release.tag_name}`}
                        </CardTitle>
                        <CardDescription className="line-clamp-2 text-sm leading-relaxed">
                          {release.body.split('\n')[0].replace(/#+\s*/, '') || "Lihat detail pembaruan..."}
                        </CardDescription>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </CardHeader>
                  </Card>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Release Detail Dialog */}
      <Dialog open={!!selectedRelease} onOpenChange={(open) => !open && setSelectedRelease(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selectedRelease && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <Badge className="font-mono text-xs">v{selectedRelease.tag_name.replace('v', '')}</Badge>
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(selectedRelease.published_at), 'MMMM d, yyyy')}
                  </span>
                </div>
                <DialogTitle className="text-2xl">{selectedRelease.name || `Release ${selectedRelease.tag_name}`}</DialogTitle>
                <DialogDescription className="text-xs">
                  Status: {selectedRelease.prerelease ? 'Pre-release' : 'Stable Release'}
                </DialogDescription>
              </DialogHeader>

              <DialogBody className="bg-[#0f0f14]/50">
                <div className="prose prose-invert prose-sm max-w-none prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {selectedRelease.body}
                  </ReactMarkdown>
                </div>
              </DialogBody>

              <DialogFooter>
                <Button variant="secondary" size="sm" render={<a href={selectedRelease.html_url} target="_blank" rel="noreferrer" />}>
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View on GitHub
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
