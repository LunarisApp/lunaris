import { useResourceTypes } from "@lunarisapp/plugin-sdk";
import { Icon } from "@lunarisapp/ui/components/icon";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@lunarisapp/ui/components/breadcrumb";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@lunarisapp/ui/components/tooltip";
import {
  useResourceBreadcrumb,
  useNavigateToResource,
} from "@repo/workspaces/workspace-explorer";
import { Fragment, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useOrganizationNavigation } from "../organization-navigation";

interface EditorBreadcrumbProps {
  currentPage?: string;
  onNavigate?: () => void;
  resourceId?: string;
}

export function EditorBreadcrumb({
  currentPage,
  resourceId,
  onNavigate,
}: EditorBreadcrumbProps) {
  const { t } = useTranslation();
  const breadcrumbItems = useResourceBreadcrumb(resourceId ?? "");
  const navigateToResource = useNavigateToResource();
  const { openResource } = useOrganizationNavigation();
  const resourceTypes = useResourceTypes();
  const resourceTypeMap = useMemo(
    () =>
      new Map(
        resourceTypes.map((resourceType) => [
          resourceType.resourceTypeId,
          resourceType,
        ])
      ),
    [resourceTypes]
  );
  const hasCurrentPage = currentPage !== undefined;
  const untitledLabel = t("common.untitled");

  const handleClick = useCallback(
    (item: (typeof breadcrumbItems)[number]) => {
      const title = item.name.trim() || untitledLabel;
      if (item.resourceTypeId) {
        openResource({
          resourceId: item.id,
          resourceTypeId: item.resourceTypeId,
          replaceCurrent: true,
          schemaVersion: item.schemaVersion,
          title,
        });
        onNavigate?.();
        return;
      }

      navigateToResource(item.id);
    },
    [navigateToResource, onNavigate, openResource, untitledLabel]
  );

  if (breadcrumbItems.length === 0) {
    return null;
  }

  const getResourceIcon = (resourceTypeId: string | null) => {
    const resourceType = resourceTypeId
      ? resourceTypeMap.get(resourceTypeId)
      : undefined;
    if (!resourceType) {
      return null;
    }

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-label={resourceType.name}
              className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground"
              role="img"
            />
          }
        >
          <Icon className="size-4" icon={resourceType.icon} />
        </TooltipTrigger>
        <TooltipContent>{resourceType.name}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbItems.map((item) => {
          const title = item.name.trim() || untitledLabel;
          return (
            <Fragment key={item.id}>
              {item.isLast && !hasCurrentPage ? (
                <BreadcrumbItem>
                  {getResourceIcon(item.resourceTypeId)}
                  <BreadcrumbPage>{title}</BreadcrumbPage>
                </BreadcrumbItem>
              ) : (
                <>
                  <BreadcrumbItem>
                    {getResourceIcon(item.resourceTypeId)}
                    <BreadcrumbLink
                      onClick={() => handleClick(item)}
                      render={<button type="button" />}
                    >
                      {title}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}
            </Fragment>
          );
        })}
        {hasCurrentPage ? (
          <BreadcrumbItem>
            <BreadcrumbPage>{currentPage}</BreadcrumbPage>
          </BreadcrumbItem>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
