import { redirect } from "next/navigation";

// The Packaging review is part of the Report now.
export default function ReviewPage() {
  redirect("/tools/packaging-configurator/report");
}
