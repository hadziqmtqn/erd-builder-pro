import React from 'react';
import { ShieldAlert, Home, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from "@/components/ui/card";
import { motion } from 'framer-motion';
import { cn } from "@/lib/utils";

interface ForbiddenViewProps {
  title?: string;
  message?: string;
  statusCode?: number;
  documentUid?: string;
  onSubmitToken?: (token: string) => void;
  onReturn?: () => void;
}

export function ForbiddenView({ 
  title, 
  message,
  statusCode = 403,
  documentUid,
  onSubmitToken,
  onReturn
}: ForbiddenViewProps) {
  const [tokenInput, setTokenInput] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const displayTitle = title || (statusCode === 401 ? "Document Locked" : "Access Denied");
  const displayMessage = message || (statusCode === 401 
    ? "This document is protected. Please enter the access token provided by the owner." 
    : "This document is private or the share link has expired.");

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim() || !onSubmitToken) return;
    
    setLocalError(null);
    setIsSubmitting(true);
    try {
      await onSubmitToken(tokenInput);
      // Note: Success will trigger a parent state change and unmount this view
    } catch (err: any) {
      setLocalError(err.message || "Incorrect token. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReturn = () => {
    if (onReturn) {
      onReturn();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="h-screen w-screen bg-background flex flex-col items-center justify-center p-4 overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card className="border-border shadow-2xl shadow-primary/5">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center relative">
              <motion.div
                animate={{ 
                  rotate: [0, -5, 5, -5, 5, 0],
                }}
                transition={{ 
                  duration: 2.5, 
                  repeat: Infinity,
                  repeatDelay: 3
                }}
              >
                <ShieldAlert className="w-8 h-8 text-destructive" />
              </motion.div>
              <div className="absolute inset-0 bg-destructive/20 filter blur-xl rounded-full -z-10 animate-pulse" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground uppercase italic leading-[1.1]">
              {displayTitle}
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">
              ERROR {statusCode} • PAGE {statusCode === 404 ? 'NOT FOUND' : 'LOCKED'}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="text-center space-y-6">
            <p className="text-muted-foreground text-sm leading-relaxed px-2">
              {displayMessage}
            </p>

            {statusCode === 401 && (
              <form onSubmit={handleUnlock} className="space-y-4 pt-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Input 
                      type="text"
                      placeholder="Enter access token..."
                      value={tokenInput}
                      onChange={(e) => {
                        setTokenInput(e.target.value);
                        if (localError) setLocalError(null);
                      }}
                      className={cn(
                        "h-10 text-center font-medium",
                        localError && "border-destructive focus-visible:ring-destructive/20"
                      )}
                      autoFocus
                    />
                    {localError && (
                      <motion.p 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[11px] font-bold text-destructive uppercase tracking-wider italic"
                      >
                        {localError}
                      </motion.p>
                    )}
                  </div>
                  <Button 
                    type="submit"
                    disabled={isSubmitting || !tokenInput.trim()}
                    className="w-full h-10 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer shadow-md"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Unlocking...
                      </>
                    ) : (
                      "Unlock Document"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row gap-3 pt-6 border-t bg-muted/30">
            <Button 
              variant="outline" 
              onClick={() => window.history.back()}
              className="flex-1 cursor-pointer font-semibold"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
            <Button 
              onClick={handleReturn}
              className="flex-1 cursor-pointer font-bold"
            >
              <Home className="w-4 h-4 mr-2" />
              Return Home
            </Button>
          </CardFooter>
        </Card>
      </motion.div>

      <div className="mt-8 flex items-center gap-3 text-[10px] uppercase font-bold tracking-[0.2em] text-muted-foreground/50">
        <span className="w-8 h-[1px] bg-border" />
        ERD Builder Security
        <span className="w-8 h-[1px] bg-border" />
      </div>
    </div>
  );
}
