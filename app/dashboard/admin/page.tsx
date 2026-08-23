import { CommerceDashboard } from "@/components/commerce-dashboard";
import { requireRole } from "@/lib/server-auth";

export default async function AdminDashboardPage() {
  await requireRole("ADMIN");
  return <CommerceDashboard expectedRole="ADMIN" />;
}
