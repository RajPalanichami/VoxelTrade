"use client";

import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading…</div>}>
      <AuthForm mode="forgot" />
    </Suspense>
  );
}
