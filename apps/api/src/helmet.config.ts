import type {
  NestNodeApplication,
  NodeRequest,
  NodeResponse,
} from "@nestjs/platform-node";

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
          maxAge: 31_536_000,
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

export function registerPermissionsPolicyHeader(app: NestNodeApplication) {
  app.use((_request: NodeRequest, reply: NodeResponse, done: () => void) => {
    reply.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
    done();
  });
}
