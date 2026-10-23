import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lunarisapp/ui/components/card";
import type { ReactNode } from "react";
import authCollaborationImage from "../assets/auth-collaboration.webp";
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
    <main className="grid min-h-dvh w-full overflow-x-hidden p-3 sm:p-4 lg:p-6">
      <div className="grid w-full lg:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)] lg:gap-6 xl:gap-8">
        <aside
          aria-hidden="true"
          className="hidden min-h-0 overflow-hidden rounded-3xl lg:sticky lg:top-6 lg:block lg:h-[calc(100dvh-3rem)] lg:self-start"
        >
          <img
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
            draggable={false}
            height={2399}
            loading="lazy"
            src={authCollaborationImage}
            width={1600}
          />
        </aside>
        <section className="flex min-w-0 items-center justify-center py-8 sm:py-12 lg:px-8">
          <div className="flex w-full max-w-sm flex-col gap-4">
            <Card className="relative">
              {regionControl === "compact" ? <RegionIndicator /> : null}
              <CardHeader>
                {leading ? (
                  <div className="flex items-center gap-3">
                    <div className="shrink-0">{leading}</div>
                    <div className="min-w-0 space-y-1">
                      <CardTitle>
                        <h1>{title}</h1>
                      </CardTitle>
                      {description ? (
                        <CardDescription>{description}</CardDescription>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <>
                    <CardTitle>
                      <h1>{title}</h1>
                    </CardTitle>
                    {description ? (
                      <CardDescription>{description}</CardDescription>
                    ) : null}
                  </>
                )}
              </CardHeader>
              <CardContent>{children}</CardContent>
            </Card>
            {regionControl === "full" ? <RegionSwitcher /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
