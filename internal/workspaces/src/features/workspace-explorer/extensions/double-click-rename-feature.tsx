import type { FeatureImplementation } from "@lunarisapp/ui/components/tree";

export const doubleClickRenameFeature: FeatureImplementation = {
  itemInstance: {
    getProps: ({ item, prev }) => ({
      ...prev?.(),
      onDoubleClick: () => {
        item.primaryAction();
        item.startRenaming();
      },
    }),
  },
};
