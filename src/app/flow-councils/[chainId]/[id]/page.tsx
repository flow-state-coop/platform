import FlowCouncil from "./flow-council";

type Params = {
  chainId: string;
  id: string;
};

export default async function Page({ params }: { params: Promise<Params> }) {
  const { chainId, id } = await params;

  return <FlowCouncil chainId={Number(chainId)} flowCouncilId={id} />;
}
