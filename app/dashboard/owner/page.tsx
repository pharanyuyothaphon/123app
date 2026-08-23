import { CommerceDashboard } from "@/components/commerce-dashboard";
import { requireRole } from "@/lib/server-auth";

export default async function OwnerDashboardPage() {
  await requireRole("OWNER");
  return <CommerceDashboard expectedRole="OWNER" />;
}
