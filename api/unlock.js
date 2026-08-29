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
  const expected = process.env.DEMO_PASSWORD;
  if (!expected) {
    console.error("DEMO_PASSWORD is not set");
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

  if (!timingSafeEqual(digest(password), digest(expected))) {
    return json(401, { ok: false });
  }

  return json(200, { ok: true });
}
