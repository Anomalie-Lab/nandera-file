import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGlobalStaff, requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  UserAdminError,
  deleteStaffUser,
  updateStaffUserRole,
  updateUserPassword,
} from "@/lib/users";

const patchSchema = z
  .object({
    password: z.string().min(8).max(200).optional(),
    role: z.enum(["SUPERADMIN", "ADMIN", "SELLER"]).optional(),
  })
  .refine((d) => d.password !== undefined || d.role !== undefined, {
    message: "Provide password and/or role.",
  });

/** ADMIN + SUPERADMIN: update password / role (role rules enforced in lib). */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireGlobalStaff();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`users-patch:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Provide a valid password (min 8) and/or role (SUPERADMIN|ADMIN|SELLER).",
      },
      { status: 400 }
    );
  }

  try {
    let user =
      parsed.data.password !== undefined
        ? await updateUserPassword(prisma, id, parsed.data.password, admin)
        : null;
    if (parsed.data.role !== undefined) {
      user = await updateStaffUserRole(prisma, id, parsed.data.role, admin);
    }
    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof UserAdminError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

/** Only SUPERADMIN can delete staff users. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`users-delete:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  try {
    await deleteStaffUser(prisma, id, admin.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UserAdminError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
