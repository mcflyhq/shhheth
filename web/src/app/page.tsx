import OdometerStage from "./components/OdometerStage";
import ProtocolList from "./components/ProtocolList";
import { formatETH, getTotals } from "@/lib/subgraph";

export const revalidate = 60;

export default async function HomePage() {
  const snapshot = await getTotals();
  const formattedTotal = snapshot ? formatETH(snapshot.totalETH, 3) : "0.000";
  const isLive = snapshot !== null;

  return (
    <main>
      <OdometerStage formattedTotal={formattedTotal} isLive={isLive}>
        <ProtocolList protocols={snapshot?.protocols ?? null} />
      </OdometerStage>
    </main>
  );
}
