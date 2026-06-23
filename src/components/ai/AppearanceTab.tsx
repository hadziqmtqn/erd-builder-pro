import { Sun, Moon, Monitor } from 'lucide-react';
import { useWorkspace } from '@/providers/WorkspaceProvider';

const THEME_OPTIONS: { id: 'light' | 'dark' | 'system'; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'light', label: 'Light', icon: <Sun className="w-5 h-5" />, description: 'Always use light mode' },
  { id: 'dark', label: 'Dark', icon: <Moon className="w-5 h-5" />, description: 'Always use dark mode' },
  { id: 'system', label: 'System', icon: <Monitor className="w-5 h-5" />, description: 'Follow your system preference' },
];

export function AppearanceTab() {
  const { theme, setTheme, resolvedTheme } = useWorkspace();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Appearance</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Choose your preferred theme for the editor. You can switch between light and dark mode,
          or let the system decide.
        </p>
      </div>

      {/* Theme selector */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
        {THEME_OPTIONS.map(option => {
          const isActive = theme === option.id;
          return (
            <button
              key={option.id}
              onClick={() => setTheme(option.id)}
              className={`
                relative flex flex-col items-center gap-3 p-5 rounded-xl border transition-all duration-200 cursor-pointer
                ${isActive
                  ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                  : 'border-border bg-card hover:bg-accent/50 hover:border-border/80'
                }
              `}
            >
              <div className={`
                p-2.5 rounded-full transition-colors
                ${isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}
              `}>
                {option.icon}
              </div>
              <div className="text-center">
                <div className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-foreground'}`}>
                  {option.label}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </div>
              </div>

              {/* Active indicator */}
              {isActive && (
                <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Live preview note */}
      <div className="max-w-2xl p-4 rounded-lg bg-muted/30 border border-border/50">
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5 shrink-0" />
          Changes apply immediately. Current mode: <span className="font-semibold text-foreground capitalize">{resolvedTheme}</span>
        </p>
      </div>
    </div>
  );
}
