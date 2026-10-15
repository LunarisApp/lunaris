import {
  Calendar03Icon,
  CheckmarkSquare02Icon,
  File01Icon,
  type IconSvgObject,
  InputNumericIcon,
  Tag01Icon,
  TagsIcon,
  TextIcon,
  UserMultipleIcon,
} from "@lunarisapp/ui/icons";
import type { PropertyType } from "./types";

export const PROPERTY_TYPE_ICONS = {
  checkbox: CheckmarkSquare02Icon,
  date: Calendar03Icon,
  resource: File01Icon,
  "multi-select": TagsIcon,
  number: InputNumericIcon,
  people: UserMultipleIcon,
  select: Tag01Icon,
  text: TextIcon,
} satisfies Record<PropertyType, IconSvgObject>;
