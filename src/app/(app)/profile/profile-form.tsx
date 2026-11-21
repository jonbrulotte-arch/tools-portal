"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { apiFetch } from "@/lib/client-fetch";

export function ProfileForm({ name: initialName, email, role }: { name: string; email: string; role: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string; section: "name" | "pw" } | null>(null);
  const [busy, setBusy] = useState<"name" | "pw" | null>(null);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy("name");
    setMsg(null);
    try {
      await apiFetch("/api/profile", { method: "PATCH", json: { name } });
      setMsg({ type: "success", text: "Name updated.", section: "name" });
      router.refresh();
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message, section: "name" });
    } finally {
      setBusy(null);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) return setMsg({ type: "error", text: "Passwords do not match.", section: "pw" });
    setBusy("pw");
    try {
      await apiFetch("/api/profile", { method: "PATCH", json: { currentPassword: current, newPassword: next } });
      setMsg({ type: "success", text: "Password changed.", section: "pw" });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message, section: "pw" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>{email} · {role}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveName} className="space-y-4 max-w-md">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            {msg?.section === "name" && <Alert variant={msg.type}>{msg.text}</Alert>}
            <Button type="submit" disabled={busy === "name"}>{busy === "name" ? "Saving…" : "Save"}</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>At least 10 characters, with letters and numbers.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="space-y-4 max-w-md">
            <div>
              <Label htmlFor="cur">Current password</Label>
              <Input id="cur" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
            </div>
            <div>
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" />
            </div>
            <div>
              <Label htmlFor="conf">Confirm new password</Label>
              <Input id="conf" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
            </div>
            {msg?.section === "pw" && <Alert variant={msg.type}>{msg.text}</Alert>}
            <Button type="submit" disabled={busy === "pw"}>{busy === "pw" ? "Saving…" : "Change password"}</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
