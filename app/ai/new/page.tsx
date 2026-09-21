import { redirect } from "next/navigation";

/** Legacy route — AI Studio now lives at /create. */
export default function AiNewPage() {
  redirect("/create");
}
