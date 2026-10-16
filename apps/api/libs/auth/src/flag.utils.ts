export function isNonProductionFlagEnabled(nodeEnv: string, enabled: boolean) {
  return enabled && nodeEnv !== "production";
}

/** Self-hosting must be explicit; hosted production keeps verification enforced. */
export function canDisableEmailVerification(
  nodeEnv: string,
  enabled: boolean,
  selfHosted: boolean
) {
  return enabled && (selfHosted || nodeEnv !== "production");
}
