/**
 * Transactional email via Resend (https://resend.com).
 * Server-side only. No-ops silently when RESEND_API_KEY is unset so the rest
 * of the pipeline keeps working without email configured.
 *
 * Mail is sent per-recipient (not one blast to many) so every message carries
 * its own personalised one-click unsubscribe link.
 */

import { makeUnsubToken } from "./unsubscribe";

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const FROM = process.env.ALERT_FROM_EMAIL || "alerts@example.com";
const SITE = (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");
const BRAND = "#22c55e"; // Minecraft green

export function emailConfigured(): boolean {
  return Boolean(RESEND_KEY);
}

async function unsubUrl(email: string): Promise<string> {
  if (!SITE) return "";
  const token = await makeUnsubToken(email);
  return `${SITE}/api/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

async function sendOne(
  to: string,
  subject: string,
  html: string,
  unsub: string,
): Promise<void> {
  if (!RESEND_KEY || !to) return;
  // RFC 8058 one-click unsubscribe + the classic header, when we have a URL.
  const headers: Record<string, string> = unsub
    ? {
        "List-Unsubscribe": `<${unsub}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : {};
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html, headers }),
    });
    if (!res.ok) {
      console.error(
        `Resend ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }
  } catch (err) {
    console.error("Resend request failed", err);
  }
}

type StatusPill = { text: string; bg: string; color: string };

function shell(opts: {
  heading: string;
  accent: string;
  pill?: StatusPill;
  intro: string;
  rows?: { label: string; value: string }[];
  unsub: string;
}): string {
  const { heading, accent, pill, intro, rows = [], unsub } = opts;

  const pillHtml = pill
    ? `<span style="display:inline-block;background:${pill.bg};color:${pill.color};font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;letter-spacing:.02em">${pill.text}</span>`
    : "";

  const rowsHtml = rows.length
    ? `<table role="presentation" width="100%" style="margin:18px 0 0;border-collapse:collapse">${rows
        .map(
          (r) =>
            `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;width:42%">${r.label}</td><td style="padding:6px 0;font-size:13px;color:#0f172a;font-weight:600">${r.value}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const viewBtn = SITE
    ? `<a href="${SITE}" style="display:inline-block;background:${BRAND};color:#06210f;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:700;font-size:14px">View live status</a>`
    : "";

  const unsubBtn = unsub
    ? `<a href="${unsub}" style="display:inline-block;color:#64748b;text-decoration:none;padding:11px 16px;border:1px solid #e2e8f0;border-radius:10px;font-weight:600;font-size:14px">Stop notifications</a>`
    : "";

  const buttons =
    viewBtn || unsubBtn
      ? `<div style="margin:24px 0 0">${viewBtn}${viewBtn && unsubBtn ? "&nbsp;&nbsp;" : ""}${unsubBtn}</div>`
      : "";

  const unsubFooter = unsub
    ? `You can <a href="${unsub}" style="color:#64748b">unsubscribe</a> at any time.`
    : "";

  return `<div style="background:#0b1512;padding:28px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="max-width:540px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;border-top:4px solid ${accent}">
      <div style="background:linear-gradient(100deg,#0b1512,#103024);padding:18px 24px;display:flex;align-items:center">
        <span style="display:inline-block;width:24px;height:24px;background:${BRAND};border-radius:6px;vertical-align:middle"></span>
        <span style="color:#e8fff1;font-weight:800;font-size:15px;margin-left:10px;vertical-align:middle">Is Minecraft Down?</span>
      </div>
      <div style="padding:26px 24px">
        ${pillHtml}
        <h1 style="font-size:20px;margin:${pill ? "14px" : "0"} 0 8px;color:#0f172a">${heading}</h1>
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.6">${intro}</p>
        ${rowsHtml}
        ${buttons}
      </div>
      <div style="border-top:1px solid #e2e8f0;padding:16px 24px;background:#f8fafc">
        <p style="font-size:12px;color:#94a3b8;margin:0;line-height:1.6">You're receiving this because you subscribed to outage alerts on Is&nbsp;Minecraft&nbsp;Down?. ${unsubFooter}</p>
      </div>
    </div>
  </div>`;
}

/** Welcome / confirmation email sent the moment someone enables alerts. */
export async function sendConfirmationEmail(
  to: string[],
  serviceNames: string[],
): Promise<void> {
  if (!RESEND_KEY) return;
  const list = serviceNames.length
    ? `<ul style="margin:14px 0 0;padding-left:18px;color:#0f172a;font-size:13px;line-height:1.8">${serviceNames
        .map((n) => `<li>${n}</li>`)
        .join("")}</ul>`
    : `<p style="margin:14px 0 0;color:#64748b;font-size:13px">No specific services selected yet — pick some on the site to start receiving alerts.</p>`;

  await Promise.all(
    to.map(async (email) => {
      const unsub = await unsubUrl(email);
      const html = shell({
        heading: "You're all set ✅",
        accent: BRAND,
        pill: { text: "SUBSCRIBED", bg: "#dcfce7", color: "#166534" },
        intro: `Thanks for subscribing! We'll email you the moment any of these Minecraft services goes down — and again when it recovers.${list}`,
        unsub,
      });
      await sendOne(
        email,
        "✅ You're subscribed to Minecraft status alerts",
        html,
        unsub,
      );
    }),
  );
}

export async function sendOutageEmail(
  to: string[],
  serviceName: string,
  startedAt: string,
): Promise<void> {
  if (!RESEND_KEY) return;
  const when = new Date(startedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  await Promise.all(
    to.map(async (email) => {
      const unsub = await unsubUrl(email);
      const html = shell({
        heading: `${serviceName} is offline`,
        accent: "#ef4444",
        pill: { text: "MAJOR OUTAGE", bg: "#fee2e2", color: "#991b1b" },
        intro:
          "Our automated probe could no longer reach this service. We'll email you again the moment it recovers.",
        rows: [
          { label: "Service", value: serviceName },
          { label: "Status", value: "Down" },
          { label: "Detected", value: when },
        ],
        unsub,
      });
      await sendOne(email, `🔴 ${serviceName} is down`, html, unsub);
    }),
  );
}

export async function sendRecoveryEmail(
  to: string[],
  serviceName: string,
  durationLabel: string,
): Promise<void> {
  if (!RESEND_KEY) return;
  await Promise.all(
    to.map(async (email) => {
      const unsub = await unsubUrl(email);
      const html = shell({
        heading: `${serviceName} has recovered`,
        accent: BRAND,
        pill: { text: "OPERATIONAL", bg: "#dcfce7", color: "#166534" },
        intro: `Good news — the service is responding normally again after about <strong>${durationLabel}</strong> of downtime.`,
        rows: [
          { label: "Service", value: serviceName },
          { label: "Status", value: "Operational" },
          { label: "Downtime", value: durationLabel },
        ],
        unsub,
      });
      await sendOne(email, `🟢 ${serviceName} is back online`, html, unsub);
    }),
  );
}
