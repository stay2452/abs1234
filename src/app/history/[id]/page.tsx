import { AdminGate } from "@/components/admin-gate";
import { HistoryDetail } from "@/components/history-detail";

export const dynamic = "force-dynamic";

export default async function HistoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AdminGate>
      <HistoryDetail runId={id} />
    </AdminGate>
  );
}
