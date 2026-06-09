import { useState, useEffect, useRef } from 'react';
import { 
  History, 
  ExternalLink, 
  Calendar, 
  Tag, 
  ChevronRight, 
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const GITHUB_REPO = 'hadziqmtqn/erd-builder-pro';

const ITEMS_PER_PAGE = 5;

interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
}

function parseTotalPages(linkHeader: string | null): number {
  if (!linkHeader) return 1;
  const lastMatch = linkHeader.match(/page=(\d+)>;\s*rel="last"/);
  return lastMatch ? parseInt(lastMatch[1], 10) : 1;
}

export function ChangelogView() {
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRelease, setSelectedRelease] = useState<GitHubRelease | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchPage = async (page: number) => {
    if (page === 1) {
      setLoading(true);
    } else {
      setPageLoading(true);
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=${ITEMS_PER_PAGE}&page=${page}`
      );
      if (!response.ok) throw new Error('Failed to fetch releases');
      const data = await response.json();
      setReleases(data);
      setTotalPages(parseTotalPages(response.headers.get('Link')));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
      setPageLoading(false);
    }
  };

  useEffect(() => {
    fetchPage(1);
  }, []);

  // Fetch new page & scroll to top when page changes
  useEffect(() => {
    fetchPage(currentPage);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage]);

  const isFirstPage = currentPage === 1;
  const latestStableReleaseIdx = isFirstPage
    ? releases.findIndex(r => !r.prerelease)
    : -1;

  if (loading && releases.length === 0) {
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

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8">
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
                  index === latestStableReleaseIdx && latestStableReleaseIdx !== -1
                    ? "bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]"
                    : release.prerelease
                    ? "bg-amber-500/20 border-amber-500/30"
                    : "bg-muted"
                )}>
                  {index === latestStableReleaseIdx && latestStableReleaseIdx !== -1 ? (
                    <Sparkles className="w-4 h-4 text-primary-foreground" />
                  ) : release.prerelease ? (
                    <Tag className="w-3 h-3 text-amber-400" />
                  ) : (
                    <Tag className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Badge variant={release.prerelease ? "secondary" : "default"} className="font-mono text-xs px-2 pointer-events-none">
                      v{release.tag_name.replace('v', '')}
                    </Badge>
                    {release.prerelease && (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-tighter bg-amber-500/10 text-amber-400 border-amber-500/30">
                        Pre-release
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(release.published_at), 'MMMM d, yyyy')}
                    </span>
                    {index === latestStableReleaseIdx && latestStableReleaseIdx !== -1 && (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-tighter bg-primary/5 text-primary border-primary/20">
                        Latest
                      </Badge>
                    )}
                  </div>

                  <Card className={cn(
                    "group transition-all duration-300 hover:border-primary/50 cursor-pointer overflow-hidden backdrop-blur-sm",
                    index === latestStableReleaseIdx && latestStableReleaseIdx !== -1
                      ? "bg-primary/5 border-primary/20 shadow-lg shadow-primary/5"
                      : release.prerelease
                      ? "bg-card/30 border-amber-500/10"
                      : "bg-card/50"
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

          {/* Page loading indicator */}
          {pageLoading && (
            <div className="flex justify-center pt-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading page...
              </div>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && !pageLoading && (
            <div className="flex items-center justify-center gap-1 pt-8 pb-4">
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="size-9 p-0"
              >
                <ChevronsLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="size-9 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <div className="flex items-center gap-1 px-2">
                {(() => {
                  const pages: (number | 'ellipsis')[] = [];
                  const range = 1;
                  for (let i = 1; i <= totalPages; i++) {
                    if (
                      i === 1 ||
                      i === totalPages ||
                      (i >= currentPage - range && i <= currentPage + range)
                    ) {
                      pages.push(i);
                    } else if (pages[pages.length - 1] !== 'ellipsis') {
                      pages.push('ellipsis');
                    }
                  }
                  return pages.map((page, i) =>
                    page === 'ellipsis' ? (
                      <span key={`e-${i}`} className="px-1 text-xs text-muted-foreground">
                        ...
                      </span>
                    ) : (
                      <Button
                        key={page}
                        variant={page === currentPage ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className="min-w-9 h-9 p-0 text-xs font-mono"
                      >
                        {page}
                      </Button>
                    )
                  );
                })()}
              </div>

              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="size-9 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="size-9 p-0"
              >
                <ChevronsRight className="w-4 h-4" />
              </Button>
            </div>
          )}

          {totalPages > 1 && !pageLoading && (
            <p className="text-center text-[11px] text-muted-foreground/60 pb-2">
              Page {currentPage} of {totalPages}
            </p>
          )}
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
                  {selectedRelease.prerelease ? (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-tighter bg-amber-500/10 text-amber-400 border-amber-500/30">
                      Pre-release
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] uppercase tracking-tighter bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                      Stable
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(selectedRelease.published_at), 'MMMM d, yyyy')}
                  </span>
                </div>
                <DialogTitle className="text-2xl">{selectedRelease.name || `Release ${selectedRelease.tag_name}`}</DialogTitle>
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
