import { useResourceViewPresenceScope } from "@lunarisapp/plugin-sdk";
import { PresenceBadges } from "./presence-badges";
import { useCurrentWorkspace } from "@repo/workspaces/workspace";
import { FileTransferStatus } from "../../extensions/host/file-transfer-status";
import type {
  ResourceEnvelope,
  ResourceStorageHandles,
} from "@lunarisapp/plugin-sdk";
import { type ReactNode, useRef } from "react";
import { useGridLayoutStore } from "../grid-layout/context";
import { EditorBreadcrumb } from "./breadcrumb";
import { EditedTimestamp } from "./edited-timestamp";
import { FocusModeWidthHandle } from "./focus-mode-width-handle";
import { EditorHeader } from "./header";
import { EditorOptions } from "./options";

interface ResourceViewLayoutProps {
  children: ReactNode;
  resource: ResourceEnvelope;
  storage: ResourceStorageHandles;
}

export function ResourceViewLayout({
  resource,
  storage,
  children,
}: ResourceViewLayoutProps) {
  const presence = useResourceViewPresenceScope()?.presence;
  const { workspaceId } = useCurrentWorkspace();
  const resourceId = resource.resourceId;
  const yjsStorage = Object.values(storage).find((slot) => slot.kind === "yjs");
  const isFocusMode = useGridLayoutStore((s) => s.isFocusMode);
  const focusModeWidth = useGridLayoutStore((s) => s.focusModeWidth);
  const outerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="resource-view-layout flex h-full flex-col">
      <FileTransferStatus workspaceId={workspaceId} />
      <EditorHeader className="editor-header mb-3">
        <EditorHeader.Leading />
        <EditorHeader.Middle className="hidden md:flex">
          {!!resourceId && <EditorBreadcrumb resourceId={resourceId} />}
        </EditorHeader.Middle>
        <EditorHeader.Trailing>
          {yjsStorage && (
            <EditedTimestamp
              className="text-muted-foreground text-xs"
              resourceId={resourceId}
              storageId={yjsStorage.storageId}
            />
          )}
          {!!presence && <PresenceBadges {...presence} />}
          <EditorOptions resource={resource} />
        </EditorHeader.Trailing>
      </EditorHeader>
      <div
        className="resource-view-layout-content min-h-0 flex-1 overflow-auto"
        ref={outerRef}
      >
        <div
          className="resource-view-layout-inner relative mx-auto h-full w-full"
          style={
            isFocusMode
              ? { maxWidth: `min(${focusModeWidth}px, 100%)` }
              : undefined
          }
        >
          {children}
          {isFocusMode && (
            <>
              <FocusModeWidthHandle outerRef={outerRef} side="left" />
              <FocusModeWidthHandle outerRef={outerRef} side="right" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
