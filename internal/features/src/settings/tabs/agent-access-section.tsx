import { Button } from "@lunarisapp/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lunarisapp/ui/components/select";
import { Switch } from "@lunarisapp/ui/components/switch";
import {
  type AgentAccessStatus,
  type AgentMcpAccess,
  type AgentMcpSetup,
  usePlatform,
} from "@repo/platform";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function AgentAccessSection() {
  const { t } = useTranslation();
  const { agentAccess: manager, clipboard } = usePlatform();
  const [status, setStatus] = useState<AgentAccessStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mcpAccess, setMcpAccess] = useState<AgentMcpAccess>("read");
  const [mcpSetup, setMcpSetup] = useState<AgentMcpSetup | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const statusRequest = useRef(0);
  const updating = useRef(false);

  const refresh = useCallback(async () => {
    if (!manager || updating.current) {
      return;
    }
    const request = ++statusRequest.current;
    try {
      const nextStatus = await manager.status();
      if (request !== statusRequest.current) {
        return;
      }
      setStatus(nextStatus);
      setError(null);
    } catch (cause) {
      if (request !== statusRequest.current) {
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : t("settings.agents.agentAccess.failed")
      );
    }
  }, [manager, t]);

  useEffect(() => {
    if (!manager) {
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => {
      window.clearInterval(timer);
      statusRequest.current += 1;
    };
  }, [manager, refresh]);

  useEffect(() => {
    if (!(manager && status?.enabled)) {
      setMcpSetup(null);
      return;
    }
    let active = true;
    setMcpSetup(null);
    setCopied(false);
    void manager
      .mcpSetup(mcpAccess)
      .then((setup) => {
        if (!active) {
          return;
        }
        setMcpSetup(setup);
        setMcpError(null);
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        setMcpSetup(null);
        setMcpError(
          cause instanceof Error
            ? cause.message
            : t("settings.agents.agentAccess.mcpFailed")
        );
      });
    return () => {
      active = false;
    };
  }, [manager, mcpAccess, status?.enabled, t]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const update = useCallback(
    async (action: () => Promise<AgentAccessStatus>) => {
      if (updating.current) {
        return;
      }
      updating.current = true;
      // A poll started before this action must not overwrite its result.
      statusRequest.current += 1;
      setBusy(true);
      try {
        setStatus(await action());
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : t("settings.agents.agentAccess.failed")
        );
      } finally {
        updating.current = false;
        setBusy(false);
      }
    },
    [t]
  );

  if (!manager) {
    return null;
  }

  const copyCommand = async () => {
    if (!mcpSetup) {
      return;
    }
    try {
      await clipboard.writeText(mcpSetup.displayCommand);
      setMcpError(null);
      setCopied(true);
    } catch {
      setMcpError(t("settings.agents.agentAccess.copyFailed"));
    }
  };

  return (
    <>
      <section
        aria-labelledby="agent-access-heading"
        className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
      >
        <header className="space-y-1.5">
          <h2 className="font-semibold text-base" id="agent-access-heading">
            {t("settings.agents.agentAccess.title")}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t("settings.agents.agentAccess.description")}
          </p>
        </header>
        <div className="min-w-0 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <label
                className="font-medium text-sm"
                htmlFor="agent-access-enabled"
              >
                {t("settings.agents.agentAccess.enable")}
              </label>
              {!!status?.enabled && (
                <p className="max-w-prose text-muted-foreground text-xs">
                  {t("settings.agents.agentAccess.disableWarning")}
                </p>
              )}
            </div>
            <Switch
              id="agent-access-enabled"
              className="after:-inset-y-3.5"
              aria-busy={busy}
              aria-label={t("settings.agents.agentAccess.enable")}
              checked={status?.enabled ?? false}
              disabled={busy || !status}
              onCheckedChange={(enabled) =>
                void update(() => manager.setEnabled(enabled))
              }
            />
          </div>

          {!!error && (
            <p className="text-destructive text-xs" role="alert">
              {error}
            </p>
          )}

          {!!status?.enabled && (
            <div
              className={
                status.pending.length > 0 ? "grid gap-6 md:grid-cols-2" : ""
              }
            >
              {status.pending.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium text-xs">
                    {t("settings.agents.agentAccess.pairingRequests")}
                  </p>
                  <ul className="divide-y">
                    {status.pending.map((request) => (
                      <li
                        className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                        key={request.requestId}
                      >
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm"
                            id={`agent-request-name-${request.requestId}`}
                          >
                            {request.clientName}
                          </p>
                          <p className="font-mono text-muted-foreground text-xs">
                            {t("settings.agents.agentAccess.code")}:{" "}
                            {request.code}
                          </p>
                          <p className="wrap-anywhere text-muted-foreground text-xs">
                            {request.scopes.join(", ")}
                          </p>
                        </div>
                        <Button
                          aria-labelledby={`agent-approve-label-${request.requestId} agent-request-name-${request.requestId}`}
                          disabled={busy}
                          onClick={() =>
                            void update(() =>
                              manager.approve(request.requestId)
                            )
                          }
                          className="h-11 sm:h-8"
                          size="sm"
                        >
                          <span id={`agent-approve-label-${request.requestId}`}>
                            {t("settings.agents.agentAccess.approve")}
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <p className="font-medium text-xs">
                  {t("settings.agents.agentAccess.approvedClients")}
                </p>
                {status.grants.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t("settings.agents.agentAccess.noClients")}
                  </p>
                ) : (
                  <ul className="divide-y">
                    {status.grants.map((grant) => (
                      <li
                        className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                        key={grant.clientId}
                      >
                        <div className="min-w-0">
                          <p
                            className="truncate text-sm"
                            id={`agent-client-name-${grant.clientId}`}
                          >
                            {grant.clientName}
                          </p>
                          <p className="wrap-anywhere text-muted-foreground text-xs">
                            {grant.scopes.join(", ")}
                          </p>
                        </div>
                        <Button
                          aria-labelledby={`agent-revoke-label-${grant.clientId} agent-client-name-${grant.clientId}`}
                          disabled={busy}
                          onClick={() =>
                            void update(() => manager.revoke(grant.clientId))
                          }
                          className="h-11 sm:h-8"
                          size="sm"
                          variant="outline"
                        >
                          <span id={`agent-revoke-label-${grant.clientId}`}>
                            {t("settings.agents.agentAccess.revoke")}
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
      {!!status?.enabled && (
        <section
          aria-labelledby="agent-chatgpt-heading"
          className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10"
        >
          <header className="space-y-1.5">
            <h2 className="font-semibold text-base" id="agent-chatgpt-heading">
              {t("settings.agents.agentAccess.mcpTitle")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t("settings.agents.agentAccess.mcpDescription")}
            </p>
          </header>
          <div className="min-w-0 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <label className="font-medium text-xs" htmlFor="agent-mcp-access">
                {t("settings.agents.agentAccess.mcpAccess")}
              </label>
              <Select
                items={(["read", "write", "full"] as const).map((access) => ({
                  label: t(`settings.agents.agentAccess.mcpAccess_${access}`),
                  value: access,
                }))}
                onValueChange={(value) => {
                  if (
                    value === "read" ||
                    value === "write" ||
                    value === "full"
                  ) {
                    setMcpAccess(value);
                  }
                }}
                value={mcpAccess}
              >
                <SelectTrigger
                  className="data-[size=default]:h-11 sm:data-[size=default]:h-8"
                  id="agent-mcp-access"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {(["read", "write", "full"] as const).map((access) => (
                    <SelectItem key={access} value={access}>
                      {t(`settings.agents.agentAccess.mcpAccess_${access}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!!mcpError && (
              <p className="text-destructive text-xs" role="alert">
                {mcpError}
              </p>
            )}

            {!!mcpSetup && (
              <div className="space-y-4">
                <div className="divide-y overflow-hidden rounded-lg border">
                  <div className="p-3">
                    <p className="mb-1 font-medium text-[11px] text-muted-foreground">
                      {t("settings.agents.agentAccess.mcpCommand")}
                    </p>
                    <code className="block whitespace-pre-wrap break-all text-xs">
                      {mcpSetup.command}
                    </code>
                  </div>
                  <div className="p-3">
                    <p className="mb-1 font-medium text-[11px] text-muted-foreground">
                      {t("settings.agents.agentAccess.mcpArguments")}
                    </p>
                    <code className="block whitespace-pre-wrap break-all text-xs">
                      {mcpSetup.args.join(" ")}
                    </code>
                  </div>
                </div>
                <div className="space-y-3">
                  <Button
                    className="h-11 w-full sm:h-8 sm:w-auto"
                    onClick={() => void copyCommand()}
                    size="sm"
                    variant="outline"
                  >
                    <span aria-live="polite">
                      {t(
                        copied
                          ? "settings.agents.agentAccess.mcpCopied"
                          : "settings.agents.agentAccess.mcpCopy"
                      )}
                    </span>
                  </Button>
                  <ol className="list-outside list-decimal space-y-2 pl-4 text-muted-foreground text-sm">
                    <li>{t("settings.agents.agentAccess.mcpStep1")}</li>
                    <li>{t("settings.agents.agentAccess.mcpStep2")}</li>
                    <li>{t("settings.agents.agentAccess.mcpStep3")}</li>
                    <li>{t("settings.agents.agentAccess.mcpStep4")}</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}
