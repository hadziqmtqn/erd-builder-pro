import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

export const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "color-mix(in srgb, var(--popover) 85%, hsl(142 76% 36%))",
          "--success-text": "hsl(142 76% 36%)",
          "--success-border": "hsl(142 76% 36% / 0.3)",
          "--error-bg": "color-mix(in srgb, var(--popover) 85%, hsl(0 72% 51%))",
          "--error-text": "hsl(0 72% 51%)",
          "--error-border": "hsl(0 72% 51% / 0.3)",
          "--info-bg": "color-mix(in srgb, var(--popover) 85%, hsl(200 98% 39%))",
          "--info-text": "hsl(200 98% 39%)",
          "--info-border": "hsl(200 98% 39% / 0.3)",
          "--warning-bg": "color-mix(in srgb, var(--popover) 85%, hsl(38 92% 50%))",
          "--warning-text": "hsl(38 92% 50%)",
          "--warning-border": "hsl(38 92% 50% / 0.3)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

