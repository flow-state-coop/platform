import PoolDetail from "./pool-detail";

type Params = {
  chainId: string;
  poolAddress: string;
};

export default async function Page({ params }: { params: Promise<Params> }) {
  const { chainId, poolAddress } = await params;

  return <PoolDetail chainId={Number(chainId)} poolAddress={poolAddress} />;
}
