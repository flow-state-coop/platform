import FormBuilder from "./form-builder";

export default async function Page({
  params,
}: {
  params: Promise<{ chainId: string; councilId: string }>;
}) {
  const { chainId, councilId } = await params;

  return <FormBuilder chainId={Number(chainId)} councilId={councilId} />;
}
