import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { resetStore } from "@/lib/store-repository";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`reset:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const store = await resetStore();
  return NextResponse.json(store);
}
