import { CommerceDashboard } from "@/components/commerce-dashboard";
import { requireRole } from "@/lib/server-auth";

export default async function EmployeeDashboardPage() {
  await requireRole("EMPLOYEE");
  return <CommerceDashboard expectedRole="EMPLOYEE" />;
}
