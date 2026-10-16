export interface OrganizationRevisionFields {
  logo: string | null;
  name: string;
  slug: string;
}

export async function organizationRevision(
  organization: OrganizationRevisionFields
): Promise<string> {
  const canonical = JSON.stringify({
    logo: organization.logo,
    name: organization.name,
    slug: organization.slug,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical)
  );
  return encodeBase64Url(new Uint8Array(digest));
}

function encodeBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/[=]+$/u, "");
}
