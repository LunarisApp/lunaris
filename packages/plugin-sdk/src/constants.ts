import type { ReactElement, SVGProps } from "react";

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

export type PluginIconSource =
  | IconSvgObject
  | ReactElement<SVGProps<SVGSVGElement>>;
