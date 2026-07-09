import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'
import { openExternalUrl } from '@/lib/urlUtils'

// ── Types ──

type SponsorSlide = {
  icon?: typeof Heart
  logoSrc?: string
  logoDarkSrc?: string
  logoAlt?: string
  title: string
  description: string
  buttonText: string
  buttonColor?: string
  buttonHoverColor?: string
  buttonAction: string
}

// ── Data ──

const SPONSOR_INTERVAL = 6000

const SPONSOR_SLIDES: SponsorSlide[] = [
  {
    icon: Heart,
    title: 'Support This Project',
    description: 'Help keep ERD Builder Pro alive and independent.',
    buttonText: 'Buy me a coffee',
    buttonColor: '#2071FB',
    buttonHoverColor: '#1a5fd4',
    buttonAction: 'https://trakteer.id/khadziq_muttaqin/tip',
  },
  {
    logoSrc: 'https://s3.erdbuilderpro.com/sponsors/Sumopod-Light.png',
    logoDarkSrc: 'https://s3.erdbuilderpro.com/sponsors/Sumopod-Dark.png',
    logoAlt: 'SumoPod',
    title: 'Deploy your App in 15 Seconds!',
    description: 'Seamless container deployment for businesses of all sizes.',
    buttonText: 'Get Started →',
    buttonColor: '#2071FB',
    buttonHoverColor: '#1a5fd4',
    buttonAction: 'https://sumopod.com',
  },
]

// ── Component ──

export function SponsorCarousel({ isCollapsed }: { isCollapsed: boolean }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(
      () => setIndex(i => (i + 1) % SPONSOR_SLIDES.length),
      SPONSOR_INTERVAL,
    )
    return () => clearInterval(timer)
  }, [])

  if (isCollapsed) return null

  const slide = SPONSOR_SLIDES[index]

  return (
    <div className="px-3 mb-2">
      <div className="overflow-hidden rounded-xl border border-dashed border-border/80 dark:border-border/70 bg-card/85 p-3">
        <div key={index} className="flex flex-col items-center gap-1.5 animate-in fade-in slide-in-from-right-4 duration-500">
          {slide.icon ? (
            <slide.icon className="w-5 h-5 text-rose-500 shrink-0" />
          ) : slide.logoSrc ? (
            <>
              <img
                src={slide.logoSrc}
                alt={slide.logoAlt ?? ''}
                className="h-8 w-auto max-w-full object-contain dark:hidden shrink-0"
              />
              {slide.logoDarkSrc && (
                <img
                  src={slide.logoDarkSrc}
                  alt={slide.logoAlt ?? ''}
                  className="h-8 w-auto max-w-full object-contain hidden dark:block shrink-0"
                />
              )}
            </>
          ) : null}

          <p className="text-xs font-semibold text-foreground text-center truncate max-w-full">{slide.title}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed text-center wrap-break-word">
            {slide.description}
          </p>

          <button
            className="w-full h-7 inline-flex items-center justify-center rounded-md text-white text-[10px] font-semibold transition-colors cursor-pointer mt-1"
            style={{ backgroundColor: slide.buttonColor || '#2071FB' }}
            onMouseEnter={(e) => {
              if (slide.buttonHoverColor) e.currentTarget.style.backgroundColor = slide.buttonHoverColor
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = slide.buttonColor || '#2071FB'
            }}
            onClick={() => openExternalUrl(slide.buttonAction)}
          >
            {slide.buttonText}
          </button>
        </div>
      </div>
    </div>
  )
}
