import { definePluginDescriptor } from "@lunarisapp/plugin-sdk";
import { AttachmentIcon } from "@lunarisapp/ui/icons";
import manifest from "./manifest.json";

export const filePluginDescriptor = definePluginDescriptor({
  manifest,
  icon: AttachmentIcon,
  load: () => import("./index"),
});

export default filePluginDescriptor;
