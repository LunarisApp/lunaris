import { FEATURE } from "@repo/auth/entitlements";
import { useFeatureAccess } from "@repo/features/entitlements";
import { Button } from "@lunarisapp/ui/components/button";
import { Kbd } from "@lunarisapp/ui/components/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import { Home07Icon, HugeiconsIcon } from "@lunarisapp/ui/icons";
import {
  createHotkeyOptions,
  formatHotkeyDisplay,
  HOTKEYS,
  type HotkeyId,
  useHotkey,
  useResolvedHotkeyBinding,
} from "@repo/features/hotkeys";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import {
  APP_TOOLS,
  type AppToolDefinition,
  type AppToolId,
} from "../app-tools";

function ShortcutTooltipContent({
  hotkey,
  label,
}: {
  hotkey: string;
  label: string;
}) {
  return (
    <TooltipContent className="flex items-center gap-3" side="bottom">
      <span>{label}</span>
      <Kbd>{formatHotkeyDisplay(hotkey)}</Kbd>
    </TooltipContent>
  );
}

function useNavigationHotkey(id: HotkeyId) {
  return useResolvedHotkeyBinding(HOTKEYS[id]);
}

function AppToolButton({
  active,
  tool,
}: {
  active: boolean;
  tool: AppToolDefinition;
}) {
  const { t } = useTranslation();
  const hotkey = useNavigationHotkey(tool.hotkeyId);
  const { organizationSlug } = useParams();
  const navigate = useNavigate();
  const target = organizationSlug
    ? `/${organizationSlug}${tool.id === "agent-work" ? "/agent-work" : ""}`
    : "/";
  useHotkey(
    hotkey,
    () => {
      if (tool.enabled) {
        void navigate(target);
      }
    },
    {
      ...createHotkeyOptions(HOTKEYS[tool.hotkeyId], t),
      enabled: tool.enabled && tool.id === "agent-work",
    }
  );
  const baseLabel = t(tool.labelKey);
  const label = tool.enabled
    ? baseLabel
    : `${baseLabel} — ${t("common.comingSoon")}`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          tool.enabled ? (
            <Button
              onClick={() => void navigate(target)}
              aria-current={active ? "page" : undefined}
              aria-keyshortcuts={hotkey}
              aria-label={label}
              className={
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent dark:hover:bg-sidebar-accent"
                  : undefined
              }
              size="icon"
              variant="ghost"
            />
          ) : (
            <span className="inline-flex" />
          )
        }
      >
        {tool.enabled ? (
          <HugeiconsIcon icon={tool.icon} />
        ) : (
          <Button aria-label={label} disabled size="icon" variant="ghost">
            <HugeiconsIcon icon={tool.icon} />
            <span className="sr-only">{label}</span>
          </Button>
        )}
        {tool.enabled ? <span className="sr-only">{label}</span> : null}
      </TooltipTrigger>
      <ShortcutTooltipContent hotkey={hotkey} label={label} />
    </Tooltip>
  );
}

export function AppLogo() {
  return (
    <Link
      aria-label="Lunaris"
      className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      to="/"
    >
      <img
        alt=""
        className="size-7 shrink-0 dark:hidden"
        draggable={false}
        height={28}
        src="/favicon-light.svg"
        width={28}
      />
      <img
        alt=""
        className="hidden size-7 shrink-0 dark:block"
        draggable={false}
        height={28}
        src="/favicon-dark.svg"
        width={28}
      />
    </Link>
  );
}

export function AppBarNavigation({
  activeToolId,
}: {
  activeToolId: AppToolId;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const agentWorkAccess = useFeatureAccess(FEATURE.agentWork);
  const homeLabel = t("common.home");
  const homeHotkey = useNavigationHotkey("open-home");

  useHotkey(
    homeHotkey,
    () => void navigate("/"),
    createHotkeyOptions(HOTKEYS["open-home"], t)
  );

  return (
    <nav
      aria-label={t("editor.navigation")}
      className="flex min-w-0 items-center gap-1"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              aria-keyshortcuts={homeHotkey}
              nativeButton={false}
              render={<Link aria-label={homeLabel} to="/" />}
              size="icon"
              variant="ghost"
            />
          }
        >
          <HugeiconsIcon icon={Home07Icon} />
          <span className="sr-only">{homeLabel}</span>
        </TooltipTrigger>
        <ShortcutTooltipContent hotkey={homeHotkey} label={homeLabel} />
      </Tooltip>

      {APP_TOOLS.map((tool) => (
        <AppToolButton
          active={tool.id === activeToolId}
          key={tool.id}
          tool={{
            ...tool,
            enabled:
              tool.enabled &&
              (tool.id !== "agent-work" ||
                (agentWorkAccess.allowed && !agentWorkAccess.pending)),
          }}
        />
      ))}
    </nav>
  );
}
