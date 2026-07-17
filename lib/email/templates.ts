const BRAND_PURPLE = "#512A83"

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function wrap(bodyHtml: string): string {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
      <div style="background:${BRAND_PURPLE};padding:16px 20px;border-radius:8px 8px 0 0;">
        <span style="color:#fff;font-weight:700;font-size:15px;">KARA · KOPH</span>
      </div>
      <div style="border:1px solid #e5e5e5;border-top:none;border-radius:0 0 8px 8px;padding:20px;">
        ${bodyHtml}
      </div>
    </div>
  `
}

export function rfqEmail(opts: { body: string }): string {
  return wrap(`
    <div dir="auto" style="white-space:pre-wrap;font-size:14px;line-height:1.8;color:#242424;">${escapeHtml(opts.body)}</div>
    <div style="border-top:1px solid #eee;margin-top:20px;padding-top:12px;font-size:12px;color:#777;">
      Kara Solutions · Riyadh, Saudi Arabia
    </div>
  `)
}

export function deliveryNoteSignedEmail(opts: {
  customerName: string
  requestNumber: string
  printUrl: string
}): { subject: string; html: string } {
  return {
    subject: `Delivery note signed — ${opts.requestNumber}`,
    html: wrap(`
      <p style="margin:0 0 12px;">Hi ${opts.customerName},</p>
      <p style="margin:0 0 16px;">Your delivery note for request <b>${opts.requestNumber}</b> has been signed and is ready.</p>
      <a href="${opts.printUrl}" style="display:inline-block;background:${BRAND_PURPLE};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">View delivery note</a>
      <p style="margin:20px 0 0;font-size:12px;color:#777;">شكراً لتعاملك مع كارا لتقنية المعلومات.</p>
    `),
  }
}

export function weeklySummaryEmail(opts: {
  overdueCount: number
  maintenanceOpenCount: number
  pendingSignoffCount: number
  dashboardUrl: string
}): { subject: string; html: string } {
  return {
    subject: `KOPH weekly summary`,
    html: wrap(`
      <p style="margin:0 0 12px;">Weekly operations summary:</p>
      <ul style="margin:0 0 16px;padding-inline-start:20px;">
        <li>Overdue collections: <b>${opts.overdueCount}</b></li>
        <li>Open maintenance orders: <b>${opts.maintenanceOpenCount}</b></li>
        <li>Pending sign-offs: <b>${opts.pendingSignoffCount}</b></li>
      </ul>
      <a href="${opts.dashboardUrl}" style="display:inline-block;background:${BRAND_PURPLE};color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;">Open dashboard</a>
    `),
  }
}
