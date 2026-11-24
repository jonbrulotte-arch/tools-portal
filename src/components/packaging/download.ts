// Downloads a file returned by a POST (JSON body or form upload), using the server's file name.
export async function downloadFrom(url: string, init: { json?: unknown; form?: FormData }) {
  const res = await fetch(url, {
    method: "POST",
    headers: init.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.form,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Download failed (${res.status})`);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "download.xlsx";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(await res.blob());
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
