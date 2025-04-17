import FlowCouncil from "./flow-council";

type Params = {
  chainId: string;
  councilId: string;
};

export default async function Page({ params }: { params: Params }) {
  return (
    <FlowCouncil
      chainId={Number(params.chainId)}
      councilId={params.councilId}
    />
  );
}
