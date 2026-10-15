import type { ReactElement, SVGProps } from "react";

export * from "@hugeicons/core-free-icons";
export { HugeiconsIcon } from "@hugeicons/react";

export type IconSvgObject =
  | [
      string,
      {
        [key: string]: string | number;
      },
    ][]
  | readonly (readonly [
      string,
      {
        readonly [key: string]: string | number;
      },
    ])[];

export type IconSource =
  | IconSvgObject
  | ReactElement<SVGProps<SVGSVGElement>>;
