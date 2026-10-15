import { Label } from "@lunarisapp/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@lunarisapp/ui/components/select";
import type { InvitationTeamPickerProps } from "@repo/features/organization/sections";
import { useTranslation } from "react-i18next";
const NO_TEAM_VALUE = "__no_team__";
export function InvitationTeamPicker({ teams, selectedTeamId, onTeamChange }: InvitationTeamPickerProps) {
  const { t } = useTranslation();
  return (
        <div className="space-y-2">
          <Label htmlFor="organization-invite-team">
            {t("organization.invitationTeam")}
          </Label>
          <Select
            onValueChange={(value) =>
              onTeamChange(value === NO_TEAM_VALUE ? null : value)
            }
            value={selectedTeamId ?? NO_TEAM_VALUE}
          >
            <SelectTrigger
              className="w-full"
              data-testid="organization-invite-team"
              id="organization-invite-team"
            >
              <SelectValue>
                {selectedTeamId
                  ? teams.find((team) => team.id === selectedTeamId)?.name
                  : t("organization.noInvitationTeam")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={NO_TEAM_VALUE}>
                {t("organization.noInvitationTeam")}
              </SelectItem>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

);
}
