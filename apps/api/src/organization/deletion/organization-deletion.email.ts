export function buildOrganizationDeletionEmail(params: {
  organizationName: string;
  purgeAfter: Date;
  recoveryUrl: string;
  reminder: boolean;
}) {
  const subject = params.reminder
    ? "Reminder: organization deletion approaching"
    : "Organization deletion scheduled";
  const deadline = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(params.purgeAfter);
  const billing =
    "Subscription renewal cancellation is requested and retried automatically if needed. Restoration does not restart billing.";
  const offline =
    "Offline devices may retain downloaded copies until they reconnect.";
  const name = escapeHtml(params.organizationName);
  const url = escapeHtml(params.recoveryUrl);

  return {
    subject,
    text: `${subject}\n\nOrganization: ${params.organizationName}\nPermanent deletion: ${deadline}\n\nRestore your organization\nYour organization is unavailable. Sign in as an owner to restore it before the deadline. After that, deletion is permanent.\n\nOpen organization recovery:\n${params.recoveryUrl}\n\nBilling\n${billing}\n\nOffline copies\n${offline}`,
    html: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:24px 12px;background:#f5f5f5;color:#242424;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
  <table role="presentation" style="width:100%;max-width:560px;margin:0 auto;border-collapse:collapse;background:#ffffff;">
    <tr><td style="padding:32px 24px;overflow-wrap:anywhere;">
      <p style="margin:0 0 20px;font-size:14px;font-weight:bold;">Lunaris</p>
      <h1 style="margin:0 0 24px;font-size:24px;line-height:1.3;">${subject}</h1>
      <div style="padding:16px;background:#f5f5f5;border-left:3px solid #777777;">
        <p style="margin:0 0 8px;"><strong>Organization</strong><br>${name}</p>
        <p style="margin:0;"><strong>Permanent deletion</strong><br>${deadline}</p>
      </div>
      <h2 style="margin:24px 0 8px;font-size:18px;">Restore your organization</h2>
      <p style="margin:0 0 20px;">Your organization is unavailable. Sign in as an owner to restore it before the deadline. After that, deletion is permanent.</p>
      <p style="margin:0 0 24px;"><a href="${url}" style="display:inline-block;padding:12px 20px;background:#242424;color:#ffffff;border-radius:6px;font-weight:bold;text-decoration:underline;">Open organization recovery</a></p>
      <h2 style="margin:24px 0 8px;font-size:18px;">Billing</h2>
      <p style="margin:0;">${billing}</p>
      <h2 style="margin:24px 0 8px;font-size:18px;">Offline copies</h2>
      <p style="margin:0;">${offline}</p>
      <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #dddddd;font-size:13px;color:#555555;">If the button does not work, open this link:<br><a href="${url}" style="color:#242424;word-break:break-all;">${url}</a></p>
    </td></tr>
  </table>
</body>
</html>`,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
