import { NextResponse } from "next/server";
import { requireAdmin, viewerPayload } from "@/lib/auth";
import { resetStore } from "@/lib/store-repository";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`reset:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const store = await resetStore();
  return NextResponse.json({
    ...store,
    viewer: viewerPayload(admin),
  });
}
