import OdometerStage from "./components/OdometerStage";
import ProtocolList from "./components/ProtocolList";
import { formatETH, getTotals } from "@/lib/subgraph";

export const revalidate = 60;

export default async function HomePage() {
  const snapshot = await getTotals();
  const formattedTotal = formatETH(snapshot.totalETH, 3);
  const isLive = snapshot.protocols.length > 0;

  return (
    <main>
      <OdometerStage formattedTotal={formattedTotal} isLive={isLive}>
        <ProtocolList scaffold={snapshot.scaffold} live={snapshot.protocols} />
      </OdometerStage>
    </main>
  );
}
