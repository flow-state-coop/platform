import FlowCouncil from "./flow-council";

type Params = {
  chainId: string;
  councilId: string;
};

export default async function Page({ params }: { params: Promise<Params> }) {
  const { chainId, councilId } = await params;

  return <FlowCouncil chainId={Number(chainId)} councilId={councilId} />;
}
