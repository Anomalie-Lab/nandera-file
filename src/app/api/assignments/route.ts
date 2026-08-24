import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  assignClientSeller,
  listClientAssignments,
} from "@/lib/assignments";
import { listSellerUsers, UserAdminError } from "@/lib/users";

const putSchema = z.object({
  clientId: z.string().min(1).max(64),
  sellerId: z.string().min(1).max(64).nullable(),
});

export async function GET() {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [assignments, sellers] = await Promise.all([
    listClientAssignments(prisma),
    listSellerUsers(prisma),
  ]);
  return NextResponse.json({ assignments, sellers });
}

export async function PUT(request: Request) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`assignments:${ip}`, 60, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "clientId and sellerId (or null) are required." },
      { status: 400 }
    );
  }

  try {
    const assignment = await assignClientSeller(
      prisma,
      parsed.data.clientId,
      parsed.data.sellerId
    );
    return NextResponse.json({ assignment });
  } catch (err) {
    if (err instanceof UserAdminError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
