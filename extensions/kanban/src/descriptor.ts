import { definePluginDescriptor } from "@lunarisapp/plugin-sdk";
import { KanbanIcon } from "@lunarisapp/ui/icons";
import manifest from "./manifest.json";

export const kanbanPluginDescriptor = definePluginDescriptor({
  manifest,
  icon: KanbanIcon,
  load: () => import("./index"),
});

export default kanbanPluginDescriptor;
