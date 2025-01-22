import Admin from "./admin";

type Params = {
  chainId: string;
  poolId: string;
};

export default async function Page({ params }: { params: Params }) {
  return <Admin chainId={Number(params.chainId)} poolId={params.poolId} />;
}
