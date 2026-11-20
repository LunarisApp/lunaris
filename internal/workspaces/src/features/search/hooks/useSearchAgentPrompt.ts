import { useAgentWorkAccess } from "@repo/agent-work/access";
import { stageAgentWorkPrompt } from "@repo/agent-work/launch";
import { useRegion } from "@repo/features/region";
import { usePlatform } from "@repo/platform";
import { useNavigate, useParams } from "react-router";

export function useSearchAgentPrompt(
  organizationId: string | null | undefined,
  userId: string | undefined
) {
  const { allowed, pending } = useAgentWorkAccess();
  const platform = usePlatform();
  const navigate = useNavigate();
  const { organizationSlug } = useParams();
  const { pathWithRegion } = useRegion();

  if (
    !allowed ||
    pending ||
    !platform.agentWork ||
    !organizationSlug ||
    !organizationId ||
    !userId
  ) {
    return;
  }

  return (text: string) => {
    const agentLaunch = stageAgentWorkPrompt({
      organizationId,
      userId,
      text,
      submit: true,
    });
    void navigate(pathWithRegion(`/${organizationSlug}/agent-work`), {
      state: { agentLaunch },
    });
  };
}
