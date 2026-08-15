import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Account Status Report — Manager",
};

export default async function HomePage() {
  if (!(await requireAuth())) {
    redirect("/login");
  }
  redirect("/manager.html");
}
