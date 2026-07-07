import { Resend } from "resend"

// Soft-disabled until RESEND_API_KEY is set — every caller checks isEmailEnabled()
// first and logs+no-ops otherwise, so missing config never breaks a request flow.
export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

let client: Resend | null = null
function getClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY)
  return client
}

const FROM = process.env.EMAIL_FROM ?? "KOPH <notifications@rentkara.com>"

export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  if (!isEmailEnabled()) {
    console.warn("sendEmail skipped: RESEND_API_KEY not configured", { to: opts.to, subject: opts.subject })
    return
  }

  // While the rentkara.com sending domain isn't verified in Resend yet,
  // route every send to a single inbox instead of real customers — remove
  // EMAIL_TEST_RECIPIENT once the domain is verified to resume real delivery.
  const testRecipient = process.env.EMAIL_TEST_RECIPIENT
  const to = testRecipient || opts.to
  const subject = testRecipient ? `[TEST → ${opts.to}] ${opts.subject}` : opts.subject

  try {
    await getClient().emails.send({ from: FROM, to, subject, html: opts.html })
  } catch (error) {
    // Email is a best-effort side channel — never let a delivery failure
    // break the signature/request flow that triggered it.
    console.error("sendEmail failed", error)
  }
}
