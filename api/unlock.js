import { createHash, timingSafeEqual } from "node:crypto";

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function digest(value) {
  return createHash("sha256").update(normalize(value), "utf8").digest();
}

function json(status, body) {
  return Response.json(body, { status });
}

export async function POST(request) {
  // DEMO_PASSWORD is the gate's own secret; TELEGRAM_UNLOCK_CODE is what the
  // bot actually DMs subscribers (api/telegram-webhook.js). They're separate
  // env vars that have to be kept manually in sync -- accept either so a
  // stale/mismatched one doesn't lock out someone with the code the bot sent.
  const candidates = [process.env.DEMO_PASSWORD, process.env.TELEGRAM_UNLOCK_CODE].filter(
    Boolean
  );
  if (!candidates.length) {
    console.error("Neither DEMO_PASSWORD nor TELEGRAM_UNLOCK_CODE is set");
    return json(503, { ok: false });
  }

  let password = "";
  try {
    const body = await request.json();
    password = body && body.password != null ? String(body.password) : "";
  } catch (err) {
    return json(400, { ok: false });
  }

  if (!normalize(password)) {
    return json(400, { ok: false });
  }

  const guess = digest(password);
  const matches = candidates.some(function (expected) {
    return timingSafeEqual(guess, digest(expected));
  });

  if (!matches) {
    return json(401, { ok: false });
  }

  return json(200, { ok: true });
}
