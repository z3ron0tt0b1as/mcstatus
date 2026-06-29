import { createFileRoute } from "@tanstack/react-router";
import { supabaseConfigured, unsubscribeEmail } from "@/lib/supabase";
import { verifyUnsubToken } from "@/lib/unsubscribe";

const SITE = (process.env.PUBLIC_SITE_URL || "").replace(/\/+$/, "");

function page(title: string, message: string, ok: boolean): Response {
  const accent = ok ? "#22c55e" : "#ef4444";
  const home = SITE || "/";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title}</title></head>
<body style="margin:0;background:#0b1512;color:#e8fff1;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
  <div style="max-width:460px;width:100%;background:rgba(34,40,38,.6);border:1px solid rgba(125,230,180,.14);border-radius:18px;padding:32px;text-align:center;backdrop-filter:blur(16px)">
    <div style="width:46px;height:46px;border-radius:12px;background:${accent};margin:0 auto 16px"></div>
    <h1 style="font-size:20px;margin:0 0 8px">${title}</h1>
    <p style="margin:0 0 22px;color:#a7c4b5;font-size:14px;line-height:1.6">${message}</p>
    <a href="${home}" style="display:inline-block;background:#22c55e;color:#06210f;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:700;font-size:14px">Back to status page</a>
  </div>
</body></html>`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = url.searchParams.get("token") || "";

  if (!email || !(await verifyUnsubToken(email, token))) {
    return page(
      "Invalid unsubscribe link",
      "This link is missing or has expired. Open the status page and manage your alerts there.",
      false,
    );
  }

  if (supabaseConfigured()) {
    try {
      await unsubscribeEmail(email);
    } catch (err) {
      console.error("unsubscribe failed", err);
      return page(
        "Something went wrong",
        "We couldn't update your preferences right now. Please try again in a moment.",
        false,
      );
    }
  }

  return page(
    "You've been unsubscribed",
    `<strong>${email}</strong> will no longer receive Minecraft status alerts. You can re-enable them anytime from the status page.`,
    true,
  );
}

// GET = link click (returns a friendly page). POST = RFC 8058 one-click
// unsubscribe from the mail client (returns 200).
export const Route = createFileRoute("/api/unsubscribe")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: async ({ request }) => {
        await handle(request);
        return new Response("OK", { status: 200 });
      },
    },
  },
});
