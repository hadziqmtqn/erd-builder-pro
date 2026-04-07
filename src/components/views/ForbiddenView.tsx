import React from 'react';
import { ShieldAlert, Home, ArrowLeft } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from "@/components/ui/card";
import { motion } from 'framer-motion';

interface ForbiddenViewProps {
  title?: string;
  message?: string;
  statusCode?: number;
  onReturn?: () => void;
}

export function ForbiddenView({ 
  title = "Access Denied", 
  message = "This document is private or the share link has expired. Please contact the owner for access.",
  statusCode = 403,
  onReturn
}: ForbiddenViewProps) {
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
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              {title}
            </CardTitle>
            <CardDescription className="text-sm">
              ERROR {statusCode} • {title.toUpperCase()}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="text-center">
            <p className="text-muted-foreground leading-relaxed">
              {message}
            </p>
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
