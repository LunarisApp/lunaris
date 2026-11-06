import { createPortal } from "react-dom";
import { useIsMobile } from "@lunarisapp/ui/hooks/use-mobile";
import { useMobileResourceHeader } from "./mobile-resource-header";
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
  const mobileHeader = useMobileResourceHeader();
  const isMobile = useIsMobile();
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
      {isMobile && mobileHeader ? (
        <>
          {mobileHeader.metadata && yjsStorage
            ? createPortal(
                <EditedTimestamp
                  className="block truncate text-xs leading-4"
                  resourceId={resourceId}
                  storageId={yjsStorage.storageId}
                />,
                mobileHeader.metadata
              )
            : null}
          {mobileHeader.actions
            ? createPortal(
                <div className="flex items-center gap-1">
                  {!!presence && <PresenceBadges {...presence} />}
                  <EditorOptions resource={resource} />
                </div>,
                mobileHeader.actions
              )
            : null}
        </>
      ) : (
        <EditorHeader className="editor-header mb-1 flex h-12 px-5 md:mb-3 md:grid md:h-8 md:px-2.5">
          <EditorHeader.Leading className="hidden md:flex" />
          <EditorHeader.Middle className="hidden md:flex">
            {!!resourceId && <EditorBreadcrumb resourceId={resourceId} />}
          </EditorHeader.Middle>
          <EditorHeader.Trailing className="flex-1 gap-3 md:flex-initial md:gap-2">
            {yjsStorage && (
              <EditedTimestamp
                className="mr-auto truncate text-muted-foreground text-xs md:mr-0"
                resourceId={resourceId}
                storageId={yjsStorage.storageId}
              />
            )}
            {!!presence && <PresenceBadges {...presence} />}
            <EditorOptions resource={resource} />
          </EditorHeader.Trailing>
        </EditorHeader>
      )}
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
