import Manager from "./manager";

type Params = {
  chainId: string;
  poolAddress: string;
};

export default async function Page({ params }: { params: Params }) {
  return (
    <Manager
      chainId={Number(params.chainId)}
      poolAddress={params.poolAddress}
    />
  );
}
