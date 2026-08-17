import { NextResponse } from "next/server";
import { authenticate, getSession } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`login:${ip}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials payload" }, { status: 400 });
  }

  const login = (parsed.data.user || parsed.data.email || "").trim();
  const user = await authenticate(login, parsed.data.password);
  if (!user) {
    return NextResponse.json({ error: "Invalid user or password" }, { status: 401 });
  }

  const session = await getSession();
  session.authenticated = true;
  session.userId = user.id;
  session.email = user.email;
  session.role = user.role;
  session.clientId = user.clientId;
  await session.save();

  return NextResponse.json({
    ok: true,
    role: user.role,
    user: user.email,
    email: user.email,
    canEdit: user.role === "ADMIN",
  });
}
