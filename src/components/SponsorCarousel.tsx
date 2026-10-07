import { Heart } from "lucide-react";
import { openExternalUrl } from "@/lib/urlUtils";
import { Button } from "@/components/ui/button";

// ── Types ──

type SponsorSlide = {
  icon?: typeof Heart;
  logoOnLightSurfaceSrc?: string;
  logoOnDarkSurfaceSrc?: string;
  logoAlt?: string;
  title: string;
  description: string;
  buttonText: string;
  buttonAction: string;
};

// ── Data ──

export function withSponsorUtm(website: string): string {
  try {
    const url = new URL(website);
    url.searchParams.set("utm_source", "erdbuilderpro.com");
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", "sponsor");
    return url.toString();
  } catch {
    return website;
  }
}

const SPONSOR_SLIDES: SponsorSlide[] = [
  {
    logoOnLightSurfaceSrc:
      "https://s3.erdbuilderpro.com/sponsors/Sumopod-Light.png",
    logoOnDarkSurfaceSrc:
      "https://s3.erdbuilderpro.com/sponsors/Sumopod-Dark.png",
    logoAlt: "SumoPod",
    title: "Deploy your App in 15 Seconds!",
    description: "Seamless container deployment for businesses of all sizes.",
    buttonText: "Get Started →",
    buttonAction: "https://sumopod.com",
  },
];

// ── Component ──

export function SponsorCarousel() {
  const slide = SPONSOR_SLIDES[0];

  return (
    <div className="px-2 pb-2">
      <div className="overflow-hidden rounded-xl border border-dashed border-zinc-700 bg-zinc-950 p-3 text-zinc-50 dark:border-zinc-300 dark:bg-zinc-100 dark:text-zinc-950">
        <div className="flex flex-col items-center gap-1.5">
          {slide.icon ? (
            <slide.icon className="w-5 h-5 text-rose-500 shrink-0" />
          ) : slide.logoOnDarkSurfaceSrc || slide.logoOnLightSurfaceSrc ? (
            <>
              <img
                src={slide.logoOnDarkSurfaceSrc ?? slide.logoOnLightSurfaceSrc}
                alt={slide.logoAlt ?? ""}
                className="h-8 w-auto max-w-full shrink-0 object-contain dark:hidden"
              />
              {slide.logoOnLightSurfaceSrc && (
                <img
                  src={slide.logoOnLightSurfaceSrc}
                  alt={slide.logoAlt ?? ""}
                  className="hidden h-8 w-auto max-w-full shrink-0 object-contain dark:block"
                />
              )}
            </>
          ) : null}

          <p className="max-w-full truncate text-center text-xs font-semibold text-zinc-50 dark:text-zinc-950">
            {slide.title}
          </p>
          <p className="wrap-break-word text-center text-[11px] leading-relaxed text-zinc-300 dark:text-zinc-600">
            {slide.description}
          </p>

          <Button
            type="button"
            className="mt-1 w-full bg-[#1a5fd4] text-white hover:bg-[#174ea6]"
            onClick={() => openExternalUrl(withSponsorUtm(slide.buttonAction))}
          >
            {slide.buttonText}
          </Button>
        </div>
      </div>
    </div>
  );
}
