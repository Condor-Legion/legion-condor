import { redirect } from "next/navigation";

export default function AdminStatsRedirect() {
  redirect("/stats");
}
