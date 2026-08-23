import { redirectToDashboardForSession } from "@/lib/server-auth";

export default async function DashboardPage() {
  await redirectToDashboardForSession();
  return null;
}
