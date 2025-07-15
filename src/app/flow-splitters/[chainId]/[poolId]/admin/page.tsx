import Admin from "./admin";

type Params = {
  chainId: string;
  poolId: string;
};

export default async function Page({ params }: { params: Promise<Params> }) {
  const { chainId, poolId } = await params;

  return <Admin chainId={Number(chainId)} poolId={poolId} />;
}
