import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@lunarisapp/ui/components/carousel";
import Autoplay from "embla-carousel-autoplay";
import type { ComponentType } from "react";
import { useMemo, useRef } from "react";
import { CeoChatBanner } from "./banners/ceo-chat";
import { WelcomeBanner } from "./banners/welcome";

interface Banner {
  component: ComponentType;
  id: string;
}

const banners: Banner[] = [
  { id: "welcome", component: WelcomeBanner },
  { id: "ceo-chat", component: CeoChatBanner },
];

export function AnnouncementsBanner() {
  const autoplay = useRef(Autoplay({ delay: 10_000, stopOnInteraction: true }));
  const startIndex = useMemo(
    () => Math.floor(Math.random() * banners.length),
    []
  );

  return (
    <Carousel
      onMouseEnter={autoplay.current.stop}
      onMouseLeave={autoplay.current.reset}
      opts={{ loop: banners.length > 1, startIndex }}
      plugins={[autoplay.current]}
    >
      <CarouselContent>
        {banners.map((banner) => (
          <CarouselItem key={banner.id}>
            <banner.component />
          </CarouselItem>
        ))}
      </CarouselContent>
      {banners.length > 1 && (
        <>
          <CarouselPrevious className="hidden md:inline-flex" />
          <CarouselNext className="hidden md:inline-flex" />
        </>
      )}
    </Carousel>
  );
}
