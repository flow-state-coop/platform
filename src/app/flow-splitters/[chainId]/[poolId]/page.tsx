import FlowSplitter from "./flow-splitter";

type Params = {
  chainId: string;
  poolId: string;
};

export default async function Page({ params }: { params: Params }) {
  return (
    <FlowSplitter chainId={Number(params.chainId)} poolId={params.poolId} />
  );
}
