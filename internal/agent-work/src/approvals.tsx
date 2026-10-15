import { Button } from "@lunarisapp/ui/components/button";
import { HugeiconsIcon, Shield01Icon } from "@lunarisapp/ui/icons";
import type { AgentWorkApproval } from "@repo/platform";
import { useTranslation } from "react-i18next";

export function AgentApprovals({
  approvals,
  onResolve,
}: {
  approvals: AgentWorkApproval[];
  onResolve: (id: string, approved: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  return approvals.map((approval) => (
    <section
      aria-label={t("agentWork.reviewChange")}
      className="border-b py-4"
      key={approval.id}
    >
      <h2 className="flex items-center gap-2 font-semibold text-sm">
        <HugeiconsIcon className="size-4" icon={Shield01Icon} />
        {t("agentWork.reviewChange")}
      </h2>
      <p className="mt-1 text-muted-foreground text-sm">{approval.name}</p>
      <pre className="my-4 max-h-60 overflow-auto whitespace-pre-wrap break-words border-y py-3 font-mono text-muted-foreground text-xs leading-5">
        {JSON.stringify(approval.input, null, 2)}
      </pre>
      <div className="flex gap-2">
        <Button onClick={() => void onResolve(approval.id, true)}>
          {t("agentWork.approve")}
        </Button>
        <Button
          onClick={() => void onResolve(approval.id, false)}
          variant="outline"
        >
          {t("agentWork.decline")}
        </Button>
      </div>
    </section>
  ));
}
