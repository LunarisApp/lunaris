export interface PropertyOption {
  color: string;
  id: string;
  name: string;
}

interface ResourcePropertyValueBase {
  name: string;
  resourceId: string;
  workspaceId: string;
  workspaceName: string;
}

export type ResourcePropertyValue = ResourcePropertyValueBase & {
  resourceTypeId: string;
};

interface PropertyDefinitionBase {
  id: string;
  name: string;
}

export interface ChoicePropertyDefinition extends PropertyDefinitionBase {
  options: PropertyOption[];
  type: "multi-select" | "select";
}

export interface ScalarPropertyDefinition extends PropertyDefinitionBase {
  type: "checkbox" | "date" | "resource" | "number" | "people" | "text";
}

export type PropertyDefinition =
  | ChoicePropertyDefinition
  | ScalarPropertyDefinition;

export type PropertyType = PropertyDefinition["type"];

export type PropertyValue =
  | boolean
  | ResourcePropertyValue
  | number
  | string
  | string[];

export interface KanbanTask {
  createdAt?: string;
  id: string;
  name: string;
}
