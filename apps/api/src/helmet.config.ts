export const CONTENT_SECURITY_POLICY_PARTS = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  "script-src 'self' 'unsafe-inline' https:",
];

export const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "camera=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

export const STRICT_TRANSPORT_SECURITY = "max-age=31536000; includeSubDomains";

type HeaderReply = {
  header: (name: string, value: string) => unknown;
};

type HeaderApp = {
  addHook: (
    name: "onRequest",
    hook: (_request: unknown, reply: HeaderReply, done: () => void) => void,
  ) => unknown;
};

export function getSecurityHeadersConfig(isProduction: boolean) {
  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "https:"],
        fontSrc: ["'self'", "data:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: {
      policy: "same-site" as const,
    },
    xFrameOptions: {
      action: "sameorigin" as const,
    },
    strictTransportSecurity: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
        }
      : false,
    xContentTypeOptions: true,
    originAgentCluster: false,
    xPermittedCrossDomainPolicies: {
      permittedPolicies: "none" as const,
    },
    referrerPolicy: {
      policy: "no-referrer" as const,
    },
  };
}

export function registerPermissionsPolicyHeader(app: HeaderApp) {
  app.addHook("onRequest", (_request, reply, done) => {
    reply.header("Permissions-Policy", PERMISSIONS_POLICY);
    done();
  });
}
