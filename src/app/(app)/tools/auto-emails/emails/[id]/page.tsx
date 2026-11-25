import type { Metadata } from "next";
import { EditorPage } from "../editor-page";

export const metadata: Metadata = { title: "Edit automated email" };

export default async function EditAutoEmailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <EditorPage id={id} created={sp.created === "1"} />;
}
