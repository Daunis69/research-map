import { Suspense } from "react";
import ResearchExplorer from "@/components/ResearchExplorer";
import { getPublicationDataset } from "@/lib/dataset";
import Loading from "./loading";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function Home() {
  const dataset = await getPublicationDataset();
  return (
    <Suspense fallback={<Loading />}>
      <ResearchExplorer dataset={dataset} />
    </Suspense>
  );
}
