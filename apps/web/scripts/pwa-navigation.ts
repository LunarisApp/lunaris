// Workbox tests these patterns against pathname + search for navigation requests.
export const navigateFallbackDenylist = [
  /^\/robots\.txt$/,
  /^\/regions\.json$/,
  /^\/\.well-known\//,
  /^\/(?:v1|api|oauth2|sync|lunaris)(?:\/|$)/,
  // Keep known auth pages available offline, but never intercept callbacks.
  /^\/auth(?!\/?(?:\?|$)|\/(?:email|continue|register|forgot-password|reset-password|two-factor|verify-email|onboarding|accept-invitation|agent-consent)\/?(?:\?|$))/,
  /^\/auth\/verify-email\/?\?.*\btoken=/,
];
