import { NextResponse } from "next/server";
import { getAuthUser, requireAdmin, viewerPayload } from "@/lib/auth";
import {
  loadStore,
  saveStore,
  saveStoreForSeller,
  scopeStoreForClient,
  scopeStoreForSeller,
} from "@/lib/store-repository";
import { storeSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { migrateStore } from "@/lib/domain/normalize";
import {
  assignedClientIdsForSeller,
  isGlobalStaffRole,
  isStaffRole,
} from "@/lib/users";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = await loadStore({ includeAccess: isStaffRole(user.role) });

  if (user.role === "CLIENT") {
    if (!user.clientId) {
      return NextResponse.json({ error: "No client assigned" }, { status: 403 });
    }
    const scoped = scopeStoreForClient(store, user.clientId);
    if (!scoped.clients.length) {
      return NextResponse.json({ error: "Client not found" }, { status: 403 });
    }
    return NextResponse.json({ ...scoped, viewer: viewerPayload(user) });
  }

  if (user.role === "SELLER") {
    const ids = await assignedClientIdsForSeller(prisma, user.id);
    const scoped = scopeStoreForSeller(store, ids);
    return NextResponse.json({ ...scoped, viewer: viewerPayload(user) });
  }

  return NextResponse.json({ ...store, viewer: viewerPayload(user) });
}

export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
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

  const { viewer: _viewer, ...toSave } = parsed.data;

  try {
    if (admin.role === "SELLER") {
      const ids = await assignedClientIdsForSeller(prisma, admin.id);
      const saved = await saveStoreForSeller(toSave, ids, admin.id);
      const idsAfter = await assignedClientIdsForSeller(prisma, admin.id);
      return NextResponse.json({
        ...scopeStoreForSeller(saved, idsAfter),
        viewer: viewerPayload(admin),
      });
    }

    if (!isGlobalStaffRole(admin.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const saved = await saveStore(toSave);
    return NextResponse.json({ ...saved, viewer: viewerPayload(admin) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    if (/Forbidden/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    throw err;
  }
}
