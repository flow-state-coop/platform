import FlowSplitter from "./flow-splitter";

type Params = {
  chainId: string;
  poolId: string;
};

export default async function Page(params: Promise<Params>) {
  const { chainId, poolId } = await params;

  return <FlowSplitter chainId={Number(chainId)} poolId={poolId} />;
}
