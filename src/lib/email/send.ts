import { supabase } from "@/integrations/supabase/client";

export interface SendTransactionalEmailParams {
  templateName: string;
  recipientEmail: string;
  idempotencyKey?: string;
  templateData?: Record<string, any>;
}

export async function sendTransactionalEmail(
  params: SendTransactionalEmailParams,
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch("/lovable/email/transactional/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to send email (${response.status}): ${text}`);
  }
  return response.json();
}
