"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { apiFetch } from "@/lib/client-fetch";

// Shared by invite acceptance and password reset.
export function SetPasswordForm({ endpoint, token, email, initialName, askName, submitLabel }: { endpoint: string; token: string; email: string; initialName?: string; askName?: boolean; submitLabel: string }) {
  const [name, setName] = useState(initialName ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await apiFetch(endpoint, { method: "POST", json: { token, password, ...(askName ? { name } : {}) } });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert variant="success">Your password has been set. You can now sign in.</Alert>
        <Button asChild className="w-full">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label>Email</Label>
        <Input value={email} disabled readOnly />
      </div>
      {askName && (
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </div>
      )}
      <div>
        <Label htmlFor="pw">New password</Label>
        <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
        <p className="text-xs text-gray-500 mt-1">At least 10 characters, with letters and numbers.</p>
      </div>
      <div>
        <Label htmlFor="pw2">Confirm password</Label>
        <Input id="pw2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
      </div>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
