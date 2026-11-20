import {
  entityReferenceKey,
  type PluginEntityReferenceOption,
} from "@lunarisapp/plugin-sdk";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandItem,
  CommandList,
} from "@lunarisapp/ui/components/command";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export type AttachmentSearch = (
  query: string,
  signal: AbortSignal
) => Promise<PluginEntityReferenceOption[]>;

export function AttachmentPicker({
  search,
  attached,
  onSelect,
  onClose,
}: {
  search: AttachmentSearch;
  attached: PluginEntityReferenceOption[];
  onSelect: (option: PluginEntityReferenceOption) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PluginEntityReferenceOption[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void search(query, controller.signal).then(
        (options) => {
          if (!controller.signal.aborted) {
            setResults(options);
            setStatus("ready");
          }
        },
        () => {
          if (!controller.signal.aborted) {
            setStatus("error");
          }
        }
      );
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, search]);
  const options = results.filter(
    (option) =>
      !attached.some(
        (item) =>
          entityReferenceKey(item.reference) ===
          entityReferenceKey(option.reference)
      )
  );
  return (
    <CommandDialog
      open
      title={t("search.attachResource")}
      description={t("search.findResource")}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Command shouldFilter={false} label={t("search.attachResource")} loop>
        <CommandInput
          placeholder={t("search.findResource")}
          value={query}
          onValueChange={(value) => {
            setStatus("loading");
            setQuery(value);
          }}
        />
        <CommandList>
          {status === "ready" &&
            options.map((option) => (
              <CommandItem
                key={entityReferenceKey(option.reference)}
                value={entityReferenceKey(option.reference)}
                onSelect={() => onSelect(option)}
              >
                <span className="min-w-0 truncate">{option.name}</span>
                <span className="min-w-0 truncate text-muted-foreground text-xs">
                  {option.workspaceName}
                </span>
              </CommandItem>
            ))}
        </CommandList>
        {(status !== "ready" || !options.length) && (
          <div
            role="status"
            className="px-3 py-5 text-center text-muted-foreground text-sm"
          >
            {t(
              status === "loading"
                ? "agentWork.mentionLoading"
                : status === "error"
                  ? "agentWork.mentionError"
                  : "agentWork.mentionEmpty"
            )}
          </div>
        )}
      </Command>
    </CommandDialog>
  );
}
