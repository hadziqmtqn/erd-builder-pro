import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, RefreshCw, Check, Share2, Globe, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface ShareModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentType: 'erd' | 'notes' | 'drawings' | 'flowchart';
  documentUid: string;
  documentTitle: string;
  isPublicView?: boolean;
}

export function ShareModal({
  isOpen,
  onOpenChange,
  documentType,
  documentUid,
  documentTitle,
  isPublicView = false
}: ShareModalProps) {
  const [token, setToken] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isPublic, setIsPublic] = useState(false);

  // Map drawing to drawings for URL consistency
  const urlType = documentType === 'drawings' ? 'drawings' : documentType;
  
  const shareUrl = `${window.location.origin}/share/${urlType}/${documentUid}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    toast.success("Link copied to clipboard!");
    setTimeout(() => setIsCopied(false), 2000);
  };

  const generateToken = () => {
    const newToken = Math.random().toString(36).substring(2, 10).toUpperCase();
    setToken(newToken);
    toast.info("Secure token generated");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isPublicView ? "Share Document" : `Share "${documentTitle}"`}</DialogTitle>
          <DialogDescription>
            {isPublicView 
              ? "Share this link with others to view this document."
              : isPublic 
                ? "Anyone with this link can view this document. No account required." 
                : "This document is currently private. Only you can access it."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!isPublicView && (
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="space-y-0.5">
                <Label htmlFor="public-status" className="text-sm font-semibold">Public Access</Label>
                <p className="text-[11px] text-muted-foreground">Enable sharing via link</p>
              </div>
              <input 
                id="public-status"
                type="checkbox" 
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 cursor-pointer accent-primary"
              />
            </div>
          )}

          <div className={`space-y-4 transition-opacity duration-200 ${(isPublic || isPublicView) ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <div className="space-y-2">
              <Label htmlFor="share-link">Public Link</Label>
              <div className="flex items-center space-x-2">
                <Input 
                  id="share-link"
                  readOnly 
                  value={shareUrl} 
                  className="flex-1"
                />
                <Button 
                  onClick={handleCopy} 
                  size="icon" 
                  variant="outline"
                  className="shrink-0 cursor-pointer"
                  disabled={!isPublic && !isPublicView}
                >
                  {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {!isPublicView && (
              <>
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="access-token">Access Token (Optional)</Label>
                    <Button 
                      variant="link" 
                      size="sm" 
                      onClick={generateToken}
                      className="h-auto p-0 text-xs cursor-pointer"
                      disabled={!isPublic}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Generate
                    </Button>
                  </div>
                  <Input 
                    id="access-token"
                    placeholder="Enter or generate a token..." 
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    disabled={!isPublic}
                    className="font-mono"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <Label htmlFor="valid-until">Duration (Days)</Label>
                  <Input 
                    id="valid-until"
                    type="number"
                    placeholder="Forever"
                    disabled={!isPublic}
                    className="text-xs"
                  />
                </div>
                
                <p className="text-[11px] text-muted-foreground italic">Note: In this demo, tokens and expiry dates are not yet enforced by the server.</p>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-end">
          {isPublicView ? (
            <Button 
              type="button" 
              onClick={() => onOpenChange(false)}
              className="cursor-pointer w-full sm:w-auto"
            >
              Close
            </Button>
          ) : (
            <>
              <Button 
                variant="ghost" 
                onClick={() => onOpenChange(false)}
                className="cursor-pointer order-2 sm:order-1"
              >
                Cancel
              </Button>
              <Button 
                type="button" 
                onClick={() => {
                  toast.success("Settings saved successfully (Demo)");
                  onOpenChange(false);
                }}
                className="cursor-pointer order-1 sm:order-2"
              >
                Save Changes
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
