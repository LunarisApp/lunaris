import { definePluginDescriptor } from "@lunarisapp/plugin-sdk";
import { File01Icon } from "@lunarisapp/ui/icons";
import manifest from "./manifest.json";

export const richTextPluginDescriptor = definePluginDescriptor({
  manifest,
  icon: File01Icon,
  load: () => import("./index"),
});

export default richTextPluginDescriptor;
