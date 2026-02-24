import PoolAdmin from "./pool-admin";

type Params = {
  chainId: string;
  poolAddress: string;
};

export default async function Page({ params }: { params: Promise<Params> }) {
  const { chainId, poolAddress } = await params;

  return <PoolAdmin chainId={Number(chainId)} poolAddress={poolAddress} />;
}
