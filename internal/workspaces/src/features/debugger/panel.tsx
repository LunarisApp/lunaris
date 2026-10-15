"use client";

import { Button } from "@lunarisapp/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@lunarisapp/ui/components/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@lunarisapp/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@lunarisapp/ui/components/tabs";
import { usePowerSync, useQuery } from "@repo/data/core";
import {
  ATTACHMENTS_TABLE,
  type AttachmentRowWithValue,
} from "@repo/data/features/attachments";
import { useWorkspaceResourcesQuery } from "@repo/data/features/workspace-resources";
import {
  compileYjsDocumentJson,
  useYjsDocumentsQuery,
} from "@repo/data/features/yjs";
import { formatAbsoluteTime, parseUTCTimestamp } from "@repo/utils";
import JsonView from "@uiw/react-json-view";
import { darkTheme } from "@uiw/react-json-view/dark";
import { lightTheme } from "@uiw/react-json-view/light";
import { useTheme } from "next-themes";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocale } from "@repo/features/locale";
import { useCurrentWorkspace } from "../workspace";

type DebuggerTab =
  | "workspace-resources"
  | "yjs-documents"
  | "upload-queue"
  | "attachments";
type JsonDialogState = "idle" | "loading" | "success" | "error";

interface Column<T> {
  cell?: (row: T) => ReactNode;
  key: string;
  label: string;
}

function formatCellValue(value: ReactNode | string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : value;
}

function toJsonViewValue(value: unknown): object {
  if (value && typeof value === "object") {
    return value;
  }

  return {
    $root: value,
  };
}

function formatTimestamp(
  value: string | null | undefined,
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (!value) {
    return "—";
  }
  const date = parseUTCTimestamp(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return formatAbsoluteTime(date, locale, t);
}

function isEmptyCompiledJson(value: unknown) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  );
}

function formatAttachmentState(state: number | null | undefined) {
  switch (state) {
    case 0:
      return "QUEUED_UPLOAD (0)";
    case 1:
      return "QUEUED_DOWNLOAD (1)";
    case 2:
      return "QUEUED_DELETE (2)";
    case 3:
      return "SYNCED (3)";
    case 4:
      return "ARCHIVED (4)";
    default:
      return state ?? "—";
  }
}

function DebuggerTable<T>({
  columns,
  emptyMessage,
  rows,
}: {
  columns: Column<T>[];
  emptyMessage: string;
  rows: T[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.key}>{column.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length > 0 ? (
          rows.map((row, index) => (
            <TableRow key={index}>
              {columns.map((column) => {
                const rawValue =
                  column.cell?.(row) ??
                  (row as Record<string, ReactNode | string | number | null | undefined>)[
                    column.key
                  ];
                const value = formatCellValue(rawValue);
                const isLongText = column.key === "value";
                const title = typeof value === "string" ? value : undefined;
                return (
                  <TableCell
                    className={isLongText ? "max-w-[24rem] truncate" : undefined}
                    key={column.key}
                    title={title}
                  >
                    {value}
                  </TableCell>
                );
              })}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell className="h-24 text-center" colSpan={columns.length}>
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

function getJsonViewTheme(resolvedTheme: string | undefined) {
  if (resolvedTheme === "dark") {
    return {
      ...darkTheme,
      "--w-rjv-background-color": "hsl(var(--popover))",
      "--w-rjv-line-color": "hsl(var(--border))",
    } as CSSProperties;
  }

  return {
    ...lightTheme,
    "--w-rjv-background-color": "hsl(var(--background))",
    "--w-rjv-line-color": "hsl(var(--border))",
  } as CSSProperties;
}

interface YjsDialogMeta {
  documentId: string;
}

interface UploadQueueDialogMeta {
  data: string;
  id: number;
}

interface PsCrudRow {
  data: string;
  id: number;
  tx_id: number | null;
}

interface DebuggerAttachmentRow extends AttachmentRowWithValue {
  filename?: string | null;
  size?: number | null;
  timestamp?: number | null;
}

function YjsJsonDialog({
  isOpen,
  meta,
  onOpenChange,
}: {
  isOpen: boolean;
  meta: YjsDialogMeta | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const db = usePowerSync();
  const [status, setStatus] = useState<JsonDialogState>("idle");
  const [compiledJson, setCompiledJson] = useState<unknown>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !meta) {
      setStatus("idle");
      setCompiledJson({});
      setErrorMessage(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setStatus("loading");
      setErrorMessage(null);

      try {
        const result = await compileYjsDocumentJson(db, meta.documentId);
        if (cancelled) return;
        setCompiledJson(result);
        setStatus("success");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : t("debugger.json.error")
        );
        setStatus("error");
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [db, isOpen, meta, t]);

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-4 pt-4 pb-3">
          <DialogTitle>{t("debugger.json.title")}</DialogTitle>
          <DialogDescription>{meta?.documentId}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {status === "loading" ? (
            <p>{t("debugger.json.loading")}</p>
          ) : null}

          {status === "error" ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {errorMessage ?? t("debugger.json.error")}
            </div>
          ) : null}

          {status === "success" ? (
            <div className="space-y-3">
              {isEmptyCompiledJson(compiledJson) ? (
                <p className="text-sm text-muted-foreground">
                  {t("debugger.json.noUpdates")}
                </p>
              ) : null}
              <JsonView
                className="rounded-lg border p-3"
                collapsed={1}
                data-testid="compiled-json-view"
                displayDataTypes={false}
                displayObjectSize={true}
                enableClipboard={true}
                shortenTextAfterLength={80}
                style={getJsonViewTheme(resolvedTheme)}
                value={toJsonViewValue(compiledJson)}
              />
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UploadQueueJsonDialog({
  isOpen,
  meta,
  onOpenChange,
}: {
  isOpen: boolean;
  meta: UploadQueueDialogMeta | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();

  const parsed = useMemo(() => {
    if (!meta) return null;
    try {
      return JSON.parse(meta.data) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [meta]);

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-4 pt-4 pb-3">
          <DialogTitle>{t("debugger.uploadQueue.title")}</DialogTitle>
          <DialogDescription>#{meta?.id}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {parsed ? (
            <JsonView
              className="rounded-lg border p-3"
              collapsed={2}
              displayDataTypes={false}
              displayObjectSize={true}
              enableClipboard={true}
              shortenTextAfterLength={80}
              style={getJsonViewTheme(resolvedTheme)}
              value={toJsonViewValue(parsed)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("debugger.json.error")}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DebuggerPanelContent({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const { data: workspaceResources = [] } = useWorkspaceResourcesQuery(workspaceId);
  const { data: yjsDocuments = [] } = useYjsDocumentsQuery(workspaceId);
  const { data: uploadQueue = [] } = useQuery<PsCrudRow>(
    "SELECT id, tx_id, data FROM ps_crud ORDER BY id",
    []
  );
  const { data: attachments = [] } = useQuery<DebuggerAttachmentRow>(
    `SELECT id, filename, local_uri, media_type, state, has_synced, size, timestamp, meta_data AS value FROM ${ATTACHMENTS_TABLE} ORDER BY id`,
    []
  );
  const [selectedYjsDocument, setSelectedYjsDocument] =
    useState<YjsDialogMeta | null>(null);
  const [isJsonDialogOpen, setIsJsonDialogOpen] = useState(false);
  const [selectedUploadEntry, setSelectedUploadEntry] =
    useState<UploadQueueDialogMeta | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  const openYjsJsonDialog = (row: (typeof yjsDocuments)[number]) => {
    setSelectedYjsDocument({
      documentId: row.id,
    });
    setIsJsonDialogOpen(true);
  };

  const openUploadDialog = (row: PsCrudRow) => {
    setSelectedUploadEntry({ id: row.id, data: row.data });
    setIsUploadDialogOpen(true);
  };

  const workspaceResourcesColumns = useMemo<Column<(typeof workspaceResources)[number]>[]>(
    () => [
      { key: "id", label: "id" },
      { key: "name", label: "name" },
      { key: "resource_type_id", label: "resource_type_id" },
      { key: "parent_id", label: "parent_id" },
      { key: "position", label: "position" },
      {
        key: "updated_at",
        label: "updated_at",
        cell: (row) => formatTimestamp(row.updated_at, locale, t),
      },
    ],
    [locale, t]
  );

  const yjsDocumentColumns = useMemo<Column<(typeof yjsDocuments)[number]>[]>(
    () => [
      { key: "id", label: "id" },
      {
        key: "created_at",
        label: "created_at",
        cell: (row) => formatTimestamp(row.created_at, locale, t),
      },
      {
        key: "updated_at",
        label: "updated_at",
        cell: (row) => formatTimestamp(row.updated_at, locale, t),
      },
      { key: "update_count", label: "update_count" },
      {
        key: "actions",
        label: "actions",
        cell: (row) => (
          <Button
            onClick={() => void openYjsJsonDialog(row)}
            size="xs"
            variant="outline"
          >
            {t("debugger.json.view")}
          </Button>
        ),
      },
    ],
    [locale, t]
  );

  const uploadQueueColumns = useMemo<Column<PsCrudRow>[]>(() => {
    const parseData = (row: PsCrudRow) => {
      try {
        return JSON.parse(row.data) as Record<string, unknown>;
      } catch {
        return null;
      }
    };
    return [
      { key: "id", label: "id" },
      { key: "tx_id", label: "tx_id" },
      {
        key: "op",
        label: "op",
        cell: (row) => (parseData(row)?.op as string) ?? "—",
      },
      {
        key: "type",
        label: "type",
        cell: (row) => (parseData(row)?.type as string) ?? "—",
      },
      {
        key: "row_id",
        label: "row_id",
        cell: (row) => (parseData(row)?.id as string) ?? "—",
      },
      {
        key: "actions",
        label: "actions",
        cell: (row) => (
          <Button
            onClick={() => openUploadDialog(row)}
            size="xs"
            variant="outline"
          >
            {t("debugger.uploadQueue.viewBody")}
          </Button>
        ),
      },
    ];
  }, [t]);

  const attachmentColumns = useMemo<Column<DebuggerAttachmentRow>[]>(
    () => [
      { key: "id", label: "id" },
      { key: "filename", label: "filename" },
      {
        key: "state",
        label: "state",
        cell: (row) => formatAttachmentState(row.state),
      },
      { key: "has_synced", label: "has_synced" },
      { key: "media_type", label: "media_type" },
      { key: "size", label: "size" },
      { key: "timestamp", label: "timestamp" },
      { key: "local_uri", label: "local_uri" },
      { key: "value", label: "value" },
    ],
    []
  );

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <Tabs className="h-full" defaultValue={"workspace-resources" satisfies DebuggerTab}>
        <TabsList variant="line">
          <TabsTrigger value="workspace-resources">
            {t("debugger.tabs.workspaceResources")}
          </TabsTrigger>
          <TabsTrigger value="yjs-documents">
            {t("debugger.tabs.yjsDocuments")}
          </TabsTrigger>
          <TabsTrigger value="upload-queue">
            {t("debugger.tabs.uploadQueue")}
          </TabsTrigger>
          <TabsTrigger value="attachments">
            {t("debugger.tabs.attachments")}
          </TabsTrigger>
        </TabsList>

        <TabsContent className="overflow-auto" value="workspace-resources">
          <DebuggerTable
            columns={workspaceResourcesColumns}
            emptyMessage={t("debugger.empty.workspaceResources")}
            rows={workspaceResources}
          />
        </TabsContent>

        <TabsContent className="overflow-auto" value="yjs-documents">
          <DebuggerTable
            columns={yjsDocumentColumns}
            emptyMessage={t("debugger.empty.yjsDocuments")}
            rows={yjsDocuments}
          />
        </TabsContent>

        <TabsContent className="overflow-auto" value="upload-queue">
          <DebuggerTable
            columns={uploadQueueColumns}
            emptyMessage={t("debugger.empty.uploadQueue")}
            rows={uploadQueue}
          />
        </TabsContent>

        <TabsContent className="overflow-auto" value="attachments">
          <DebuggerTable
            columns={attachmentColumns}
            emptyMessage={t("debugger.empty.attachments")}
            rows={attachments}
          />
        </TabsContent>
      </Tabs>

      <YjsJsonDialog
        isOpen={isJsonDialogOpen}
        meta={selectedYjsDocument}
        onOpenChange={(open) => {
          setIsJsonDialogOpen(open);
          if (!open) {
            setSelectedYjsDocument(null);
          }
        }}
      />

      <UploadQueueJsonDialog
        isOpen={isUploadDialogOpen}
        meta={selectedUploadEntry}
        onOpenChange={(open) => {
          setIsUploadDialogOpen(open);
          if (!open) {
            setSelectedUploadEntry(null);
          }
        }}
      />
    </div>
  );
}

export function DebuggerPanel() {
  const { workspaceId } = useCurrentWorkspace();
  return <DebuggerPanelContent workspaceId={workspaceId} />;
}
