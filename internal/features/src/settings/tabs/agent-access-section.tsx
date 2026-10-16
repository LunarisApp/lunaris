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
import { useCallback, useEffect, useState } from "react";
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

  const refresh = useCallback(async () => {
    if (!manager) {
      return;
    }
    try {
      setStatus(await manager.status());
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("settings.local-data.agentAccess.failed")
      );
    }
  }, [manager, t]);

  useEffect(() => {
    if (!manager) {
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [manager, refresh]);

  useEffect(() => {
    if (!(manager && status?.enabled)) {
      setMcpSetup(null);
      return;
    }
    let active = true;
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
            : t("settings.local-data.agentAccess.mcpFailed")
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
      setBusy(true);
      try {
        setStatus(await action());
        setError(null);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : t("settings.local-data.agentAccess.failed")
        );
      } finally {
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
      setCopied(true);
    } catch {
      setMcpError(t("settings.local-data.agentAccess.copyFailed"));
    }
  };

  return (
    <section aria-labelledby="agent-access-heading" className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-medium text-sm" id="agent-access-heading">
            {t("settings.local-data.agentAccess.title")}
          </h2>
          <p className="text-muted-foreground text-xs">
            {t("settings.local-data.agentAccess.description")}
          </p>
        </div>
        <Switch
          aria-busy={busy}
          aria-label={t("settings.local-data.agentAccess.enable")}
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
                {t("settings.local-data.agentAccess.pairingRequests")}
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
                        {t("settings.local-data.agentAccess.code")}:{" "}
                        {request.code}
                      </p>
                      <p className="truncate font-mono text-muted-foreground text-xs">
                        {request.scopes.join(", ")}
                      </p>
                    </div>
                    <Button
                      aria-labelledby={`agent-approve-label-${request.requestId} agent-request-name-${request.requestId}`}
                      disabled={busy}
                      onClick={() =>
                        void update(() => manager.approve(request.requestId))
                      }
                      size="sm"
                    >
                      <span id={`agent-approve-label-${request.requestId}`}>
                        {t("settings.local-data.agentAccess.approve")}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <p className="font-medium text-xs">
              {t("settings.local-data.agentAccess.approvedClients")}
            </p>
            {status.grants.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {t("settings.local-data.agentAccess.noClients")}
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
                      <p className="truncate font-mono text-muted-foreground text-xs">
                        {grant.scopes.join(", ")}
                      </p>
                    </div>
                    <Button
                      aria-labelledby={`agent-revoke-label-${grant.clientId} agent-client-name-${grant.clientId}`}
                      disabled={busy}
                      onClick={() =>
                        void update(() => manager.revoke(grant.clientId))
                      }
                      size="sm"
                      variant="outline"
                    >
                      <span id={`agent-revoke-label-${grant.clientId}`}>
                        {t("settings.local-data.agentAccess.revoke")}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {!!status?.enabled && (
        <div className="space-y-4 border-t pt-5">
          <div className="space-y-1">
            <h3 className="font-medium text-sm">
              {t("settings.local-data.agentAccess.mcpTitle")}
            </h3>
            <p className="text-muted-foreground text-xs">
              {t("settings.local-data.agentAccess.mcpDescription")}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3">
            <label className="font-medium text-xs" htmlFor="agent-mcp-access">
              {t("settings.local-data.agentAccess.mcpAccess")}
            </label>
            <Select
              onValueChange={(value) => setMcpAccess(value as AgentMcpAccess)}
              value={mcpAccess}
            >
              <SelectTrigger id="agent-mcp-access" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {(["read", "write", "full"] as const).map((access) => (
                  <SelectItem key={access} value={access}>
                    {t(`settings.local-data.agentAccess.mcpAccess_${access}`)}
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
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="divide-y overflow-hidden rounded-md bg-muted">
                <div className="p-3">
                  <p className="mb-1 font-medium text-[11px] text-muted-foreground">
                    {t("settings.local-data.agentAccess.mcpCommand")}
                  </p>
                  <code className="block overflow-x-auto text-xs">
                    {mcpSetup.command}
                  </code>
                </div>
                <div className="p-3">
                  <p className="mb-1 font-medium text-[11px] text-muted-foreground">
                    {t("settings.local-data.agentAccess.mcpArguments")}
                  </p>
                  <code className="block overflow-x-auto text-xs">
                    {mcpSetup.args.join(" ")}
                  </code>
                </div>
                <div className="p-3">
                  <p className="mb-1 font-medium text-[11px] text-muted-foreground">
                    {t("settings.local-data.agentAccess.mcpFullCommand")}
                  </p>
                  <code className="block overflow-x-auto text-xs">
                    {mcpSetup.displayCommand}
                  </code>
                </div>
              </div>
              <div className="space-y-3">
                <Button
                  className="w-full"
                  onClick={() => void copyCommand()}
                  size="sm"
                  variant="outline"
                >
                  <span aria-live="polite">
                    {t(
                      copied
                        ? "settings.local-data.agentAccess.mcpCopied"
                        : "settings.local-data.agentAccess.mcpCopy"
                    )}
                  </span>
                </Button>
                <ol className="list-outside list-decimal space-y-1 pl-4 text-muted-foreground text-xs">
                  <li>{t("settings.local-data.agentAccess.mcpStep1")}</li>
                  <li>{t("settings.local-data.agentAccess.mcpStep2")}</li>
                  <li>{t("settings.local-data.agentAccess.mcpStep3")}</li>
                  <li>{t("settings.local-data.agentAccess.mcpStep4")}</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      )}

      {!!status?.enabled && (
        <p className="text-muted-foreground text-xs">
          {t("settings.local-data.agentAccess.disableWarning")}
        </p>
      )}
    </section>
  );
}
