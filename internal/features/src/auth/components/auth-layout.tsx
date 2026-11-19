import { LunarisMark } from "../../brand";
import { Card } from "@lunarisapp/ui/components/card";
import type { ReactNode } from "react";
import lunarLandscape from "../../brand/lunar-landscape.webp";
import { RegionIndicator } from "./region-indicator";
import { RegionSwitcher } from "./region-switcher";

interface AuthLayoutProps {
  children: ReactNode;
  description?: string;
  leading?: ReactNode;
  regionControl?: "full" | "compact";
  title: string;
}

export function AuthLayout({
  title,
  description,
  leading,
  regionControl = "compact",
  children,
}: AuthLayoutProps) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-6 sm:px-8">
      <Card className="grid w-full max-w-md gap-0 py-0 md:max-w-4xl md:grid-cols-2">
        <aside
          aria-hidden="true"
          className="relative h-28 overflow-hidden sm:h-36 md:h-auto md:min-h-[28rem]"
        >
          <img
            alt=""
            className="absolute inset-0 size-full object-cover object-[65%_19%] md:object-[65%_30%]"
            decoding="async"
            draggable={false}
            height={850}
            src={lunarLandscape}
            width={1070}
          />
        </aside>
        <section className="flex min-w-0 flex-col gap-7 p-6 sm:p-9">
          <div className="flex items-center justify-between gap-3">
            <span className="app-wordmark inline-flex items-center gap-2 text-sm">
              <LunarisMark className="size-6" />
              Lunaris
            </span>
            {regionControl === "compact" && <RegionIndicator />}
          </div>
          <div className="my-auto space-y-6">
            <header className="flex items-start gap-3">
              {!!leading && <div className="shrink-0">{leading}</div>}
              <div className="min-w-0 space-y-2">
                <h1 className="app-page-title">{title}</h1>
                {!!description && (
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {description}
                  </p>
                )}
              </div>
            </header>
            <div>{children}</div>
          </div>
          {regionControl === "full" && <RegionSwitcher />}
        </section>
      </Card>
    </main>
  );
}
