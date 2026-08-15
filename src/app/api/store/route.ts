import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { loadStore, saveStore } from "@/lib/store-repository";
import { storeSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { migrateStore } from "@/lib/domain/normalize";

export async function GET() {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = await loadStore();
  return NextResponse.json(store);
}

export async function PUT(request: Request) {
  if (!(await requireAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`save:${ip}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Accept legacy single-client backups via migrate before zod
  const migrated = migrateStore(body);
  if (!migrated) {
    return NextResponse.json({ error: "Invalid store shape" }, { status: 400 });
  }

  const parsed = storeSchema.safeParse(migrated);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const saved = await saveStore(parsed.data);
  return NextResponse.json(saved);
}
