import type { AppConfig } from "../config.js";

export type AccountEmail = {
  kind: "password_reset" | "email_verification";
  email: string;
  name: string;
  actionUrl: string;
  expiresAt: string;
};

export async function deliverAccountEmail(config: AppConfig, message: AccountEmail) {
  if (!config.EMAIL_WEBHOOK_URL) return { delivered: false, provider: "not-configured" };
  const response = await fetch(config.EMAIL_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "CodeMesh account service" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Email webhook returned ${response.status}.`);
  return { delivered: true, provider: "webhook" };
}
