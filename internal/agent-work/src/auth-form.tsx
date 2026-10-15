import { Button } from "@lunarisapp/ui/components/button";
import { Textarea } from "@lunarisapp/ui/components/textarea";
import type { AgentWorkCommand, AgentWorkEvent } from "@repo/platform";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

export function AgentAuthForm({
  auth,
  onRequest,
}: {
  auth: Extract<AgentWorkEvent, { type: "auth" }>;
  onRequest: (command: AgentWorkCommand) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const authInputId = useId();
  const [authInput, setAuthInput] = useState("");
  return (
    <form
      className="mt-5 space-y-3 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void onRequest({
          type: "auth_input",
          value: authInput,
        });
        setAuthInput("");
      }}
    >
      <p className="text-sm">{t("agentWork.finishLogin")}</p>
      {auth.url && (
        <a
          className="text-sm underline"
          href={auth.url}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("agentWork.openLogin")}
        </a>
      )}
      {auth.prompt && (
        <>
          <label className="block text-sm" htmlFor={authInputId}>
            {t("agentWork.pasteRedirect")}
          </label>
          <Textarea
            autoComplete="off"
            id={authInputId}
            onChange={(event) => setAuthInput(event.target.value)}
            value={authInput}
          />
          <Button disabled={!authInput.trim()} type="submit">
            {t("agentWork.continue")}
          </Button>
        </>
      )}
    </form>
  );
}
