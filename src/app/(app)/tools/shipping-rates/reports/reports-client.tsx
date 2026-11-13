"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, FileSpreadsheet, Info, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TableWrap, Th, Td, Tr, EmptyRow, RowAction } from "@/components/ui/table";
import { apiFetch } from "@/lib/client-fetch";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { ReportSummary } from "@/lib/shipping/report";

type Report = {
  id: string;
  fileName: string;
  uploadedBy: string | null;
  uploadedById: string | null;
  status: "PENDING" | "RUNNING" | "READY" | "FAILED" | "CANCELLED";
  error: string | null;
  progress: number;
  rowCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  createdAt: string;
  summary: ReportSummary | null;
};

const STATUS: Record<Report["status"], { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  PENDING: { label: "Queued", variant: "secondary" },
  RUNNING: { label: "Processing", variant: "warning" },
  READY: { label: "Ready", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

export function ReportsClient({ reports, currentUserId, canManage }: { reports: Report[]; currentUserId: string; canManage: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [detail, setDetail] = useState<Report | null>(null);
  const processing = reports.some((r) => r.status === "PENDING" || r.status === "RUNNING");

  // Refresh while a report is being processed.
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [processing, router]);

  async function upload(file: File) {
    setUploading(true);
    setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiFetch("/api/tools/shipping-rates/reports", { method: "POST", body: fd });
      setNotice({ type: "success", text: `${file.name} uploaded. It's being processed now; this usually takes under a minute.` });
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(r: Report) {
    if (!confirm(`Delete the report ${r.fileName}? Its totals are removed from the analysis.`)) return;
    try {
      await apiFetch(`/api/tools/shipping-rates/reports/${r.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      setNotice({ type: "error", text: (err as Error).message });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload a ship cost history report</CardTitle>
          <CardDescription>
            The Excel (.xlsx) export with UPS invoice lines and USPS labels. Each UPS package&apos;s charges (freight, fuel, residential, delivery area…) are added up. Only our own prepaid shipping is used: third-party and collect shipments are left out. Names and addresses are read only to place each package and aren&apos;t stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {uploading ? "Uploading…" : "Upload report"}
          </Button>
          {notice && <Alert variant={notice.type}>{notice.text}</Alert>}
        </CardContent>
      </Card>

      <TableWrap>
        <thead>
          <tr>
            <Th>Report</Th>
            <Th>Shipments covered</Th>
            <Th>UPS packages used</Th>
            <Th>USPS labels used</Th>
            <Th>Status</Th>
            <Th>Uploaded</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {reports.length === 0 && <EmptyRow colSpan={7}>No reports yet. Upload the ship cost history to start.</EmptyRow>}
          {reports.map((r) => (
            <Tr key={r.id}>
              <Td>
                <div className="flex items-center gap-2 font-medium">
                  <FileSpreadsheet className="h-4 w-4 text-gray-400" /> {r.fileName}
                </div>
              </Td>
              <Td className="text-gray-700 whitespace-nowrap">{r.dateFrom ? `${formatDate(r.dateFrom)} – ${formatDate(r.dateTo)}` : "—"}</Td>
              <Td>{r.summary ? `${r.summary.ups.used.toLocaleString()} of ${r.summary.ups.packages.toLocaleString()}` : "—"}</Td>
              <Td>{r.summary ? `${r.summary.usps.used.toLocaleString()} of ${r.summary.usps.packages.toLocaleString()}` : "—"}</Td>
              <Td>
                <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                {(r.status === "RUNNING" || r.status === "PENDING") && <span className="ml-2 text-xs text-gray-500">{r.progress.toLocaleString()} rows read</span>}
                {r.error && <p className="text-xs text-red-700 mt-1 max-w-xs">{r.error}</p>}
              </Td>
              <Td className="text-gray-500 text-xs whitespace-nowrap">
                {formatDateTime(r.createdAt)}
                <br />
                {r.uploadedBy}
              </Td>
              <Td className="text-right whitespace-nowrap">
                {r.status === "READY" && (
                  <>
                    <RowAction title="What was used and skipped" onClick={() => setDetail(r)}>
                      <Info className="h-4 w-4" />
                    </RowAction>
                    <Link href={`/tools/shipping-rates?report=${r.id}`} title="Open analysis" className="inline-flex p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                      <BarChart3 className="h-4 w-4" />
                    </Link>
                  </>
                )}
                {(canManage || r.uploadedById === currentUserId) && r.status !== "RUNNING" && r.status !== "PENDING" && (
                  <RowAction danger title="Delete report" onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4" />
                  </RowAction>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableWrap>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail?.summary && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.fileName}</DialogTitle>
                <DialogDescription>
                  {detail.summary.rows.toLocaleString()} rows · {formatDate(detail.dateFrom)} – {formatDate(detail.dateTo)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Carrier</Th>
                      <Th>In report</Th>
                      <Th>Used</Th>
                    </tr>
                  </thead>
                  <tbody>
                    <Tr>
                      <Td>UPS Ground packages</Td>
                      <Td>{detail.summary.ups.packages.toLocaleString()}</Td>
                      <Td>{detail.summary.ups.used.toLocaleString()}</Td>
                    </Tr>
                    <Tr>
                      <Td>USPS Ground Advantage labels</Td>
                      <Td>{detail.summary.usps.packages.toLocaleString()}</Td>
                      <Td>{detail.summary.usps.used.toLocaleString()}</Td>
                    </Tr>
                  </tbody>
                </TableWrap>
                <div>
                  <p className="font-semibold text-gray-900 mb-2">Left out, and why</p>
                  <ul className="space-y-1 text-gray-700">
                    {Object.entries(detail.summary.skipped)
                      .sort((a, b) => b[1] - a[1])
                      .map(([why, n]) => (
                        <li key={why} className="flex justify-between gap-4">
                          <span>{why}</span>
                          <span className="tabular-nums text-gray-500">{n.toLocaleString()}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-2">How each zone was found</p>
                  <ul className="space-y-1 text-gray-700">
                    {Object.entries(detail.summary.zoneSources).map(([k, n]) => (
                      <li key={k} className="flex justify-between gap-4">
                        <span>{ZONE_SOURCE[k] ?? k}</span>
                        <span className="tabular-nums text-gray-500">{n.toLocaleString()}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ZONE_SOURCE: Record<string, string> = {
  "UPS actual": "UPS: zone from the UPS invoice",
  "USPS ups-city": "USPS: zone from our UPS shipments to the same city",
  "USPS distance": "USPS: estimated from distance to the destination city",
  "USPS distance-state": "USPS: estimated from distance to the destination state (city not found)",
};
