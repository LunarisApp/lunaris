import {
  BookOpen01Icon,
  type IconSvgObject,
  Location01Icon,
  UserGroupIcon,
} from "@lunarisapp/ui/icons";
/**
 * Defines a template item's structure (folder or document)
 */
export interface TemplateItem {
  children?: TemplateItem[];
  icon?: IconSvgObject;
  name: string;
  pluginId?: string;
}

/**
 * Workspace template definition
 */
export interface WorkspaceTemplate {
  description: string;
  id: string;
  name: string;
  /** Extensions to enable for this template. If undefined, all extensions are enabled. */
  plugins?: string[];
  structure: TemplateItem[];
}

/**
 * Book template with standard structure for writing a book
 */
const BOOK_TEMPLATE: WorkspaceTemplate = {
  id: "book",
  name: "Book",
  description:
    "Standard book structure with characters, locations, and manuscript sections",
  plugins: ["lunaris.rich-text", "lunaris.file"],
  structure: [
    {
      name: "Characters",
      children: [],
      icon: UserGroupIcon,
    },
    {
      name: "Locations",
      children: [],
      icon: Location01Icon,
    },
    {
      name: "Manuscript",
      children: [
        { name: "Front Matter", children: [] },
        { name: "Body", children: [] },
        { name: "Back Matter", children: [] },
      ],
      icon: BookOpen01Icon,
    },
  ],
};

/**
 * All available workspace templates
 */
export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [BOOK_TEMPLATE];

/**
 * Find a template by its ID
 */
export function getTemplateById(id: string): WorkspaceTemplate | undefined {
  return WORKSPACE_TEMPLATES.find((t) => t.id === id);
}
