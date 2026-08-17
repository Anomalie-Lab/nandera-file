import { NextResponse } from "next/server";
import { getAuthUser, viewerPayload } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    ...viewerPayload(user),
    clientId: user.clientId,
  });
}
