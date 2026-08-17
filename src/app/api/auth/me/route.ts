import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    user: user.email,
    email: user.email,
    role: user.role,
    canEdit: user.role === "ADMIN",
    clientId: user.clientId,
  });
}
