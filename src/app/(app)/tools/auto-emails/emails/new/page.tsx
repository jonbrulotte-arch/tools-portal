import type { Metadata } from "next";
import { EditorPage } from "../editor-page";

export const metadata: Metadata = { title: "New automated email" };

export default function NewAutoEmailPage() {
  return <EditorPage id={null} />;
}
