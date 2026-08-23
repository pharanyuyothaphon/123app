import { CommerceDashboard } from "@/components/commerce-dashboard";
import { requireRole } from "@/lib/server-auth";

export default async function RetailerDashboardPage() {
  await requireRole("RETAILER");
  return <CommerceDashboard expectedRole="RETAILER" />;
}
