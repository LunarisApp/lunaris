import { Button } from "@lunarisapp/ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@lunarisapp/ui/components/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@lunarisapp/ui/components/popover";
import { Separator } from "@lunarisapp/ui/components/separator";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import { HelpCircleIcon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import posthog from "posthog-js";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { HelpCenterDocsSection } from "./components/docs";
import { HelpCenterSocialMediaSection } from "./components/social-media";
import { HelpCenterSupportSection } from "./components/support";

function HelpButton({
  size,
  ...props
}: { size?: "xs" | "sm" | "md" | "lg" } & Omit<
  ComponentProps<typeof Button>,
  "size"
>) {
  const { t } = useTranslation();
  return (
    <Button
      size={!size || size === "md" ? "icon" : `icon-${size}`}
      variant="outline"
      {...props}
    >
      <HugeiconsIcon icon={HelpCircleIcon} />
      <span className="sr-only">{t("helpCenter.helpCenter")}</span>
    </Button>
  );
}

function onOpen(open: boolean) {
  if (open) posthog.capture("help_center_opened");
}

export function HelpCenterPopover({
  align,
  className,
  size,
  side,
  variant,
}: {
  align?: ComponentProps<typeof PopoverContent>["align"];
  className?: ComponentProps<typeof Button>["className"];
  size?: "xs" | "sm" | "md" | "lg";
  side?: ComponentProps<typeof PopoverContent>["side"];
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer onOpenChange={onOpen}>
        <DrawerTrigger
          render={
            <HelpButton className={className} size={size} variant={variant} />
          }
        />
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t("helpCenter.helpCenter")}</DrawerTitle>
          </DrawerHeader>
          <div className="grid gap-4 px-4 pb-4">
            <HelpCenterDocsSection />
            <Separator />
            <HelpCenterSupportSection />
            <Separator />
            <HelpCenterSocialMediaSection />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover onOpenChange={onOpen}>
      <PopoverTrigger
        render={
          <HelpButton className={className} size={size} variant={variant} />
        }
      />
      <PopoverContent
        align={align}
        className="grid w-96 gap-4 p-3"
        side={side}
      >
        <HelpCenterDocsSection />
        <Separator />
        <HelpCenterSupportSection />
        <Separator />
        <HelpCenterSocialMediaSection />
      </PopoverContent>
    </Popover>
  );
}
