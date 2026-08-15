import type { Metadata } from "next";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = {
  title: "Sign in — Account Status Report",
};

export default function LoginPage() {
  return <LoginForm />;
}
