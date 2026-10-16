import { exposePluginWorkerTask } from "@lunarisapp/plugin-sdk/worker";
import { renderPdf } from "./renderer";
import type { PdfWorkerInput } from "./worker-protocol";

exposePluginWorkerTask<PdfWorkerInput, Awaited<ReturnType<typeof renderPdf>>>(
  ({ contents, emojiDataUrls, noContentLabel, workspaceName, theme }) =>
    renderPdf(contents, workspaceName, theme, noContentLabel, emojiDataUrls)
);
