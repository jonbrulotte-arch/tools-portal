"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { apiFetch } from "@/lib/client-fetch";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/public/forgot-password", { method: "POST", json: { email } });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert variant="success">If an active account exists for that address, a reset link is on its way.</Alert>
        <p className="text-sm"><Link href="/login" className="text-blue-600 hover:underline">Back to sign in</Link></p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@company.com" />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</Button>
      <p className="text-sm text-center"><Link href="/login" className="text-blue-600 hover:underline">Back to sign in</Link></p>
    </form>
  );
}
