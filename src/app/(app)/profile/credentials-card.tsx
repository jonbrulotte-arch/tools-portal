"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plug, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { apiFetch } from "@/lib/client-fetch";
import { formatDate } from "@/lib/utils";

/** The signed-in user's own Salsify API key (used by the Shipping Rates Generator's Product quote). */
export function SalsifyKeyCard({ savedAt }: { savedAt: string | null }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "remove" | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const url = "/api/profile/credentials/salsify";

  async function act(kind: "save" | "test" | "remove", fn: () => Promise<string | { type: "success" | "warning"; text: string }>) {
    setBusy(kind);
    setMsg(null);
    try {
      const r = await fn();
      setMsg(typeof r === "string" ? { type: "success", text: r } : r);
      router.refresh();
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void act("save", async () => {
      await apiFetch(url, { method: "PUT", json: { apiKey: key } });
      setKey("");
      try {
        const t = await apiFetch<{ message: string }>(`${url}/test`, { method: "POST" });
        return `Key saved. ${t.message}`;
      } catch (err) {
        return { type: "warning" as const, text: `Key saved, but the test failed: ${(err as Error).message}` };
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-gray-500" /> Salsify API key
          {savedAt ? <Badge variant="success">Saved</Badge> : <Badge variant="secondary">Not set</Badge>}
        </CardTitle>
        <CardDescription>
          Your own key, used when you look up a part in Shipping Rates Generator → Product quote. It&apos;s encrypted, never shown again, and used only for your lookups. Create one in Salsify under your profile menu → API Access.
          {savedAt && <> Saved {formatDate(savedAt)}.</>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="max-w-md">
            <Label htmlFor="salsify-key">{savedAt ? "Replace key" : "API key"}</Label>
            <Input id="salsify-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder={savedAt ? "•••••••• (saved)" : "Paste your Salsify API key"} />
          </div>
          {msg && <Alert variant={msg.type}>{msg.text}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!key || busy !== null}>
              {busy === "save" ? "Saving…" : "Save key"}
            </Button>
            {savedAt && (
              <>
                <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void act("test", async () => (await apiFetch<{ message: string }>(`${url}/test`, { method: "POST" })).message)}>
                  <Plug className="h-4 w-4" /> {busy === "test" ? "Testing…" : "Test"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => {
                    if (confirm("Remove your Salsify API key?")) void act("remove", async () => (await apiFetch(url, { method: "DELETE" }), "Key removed."));
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              </>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
