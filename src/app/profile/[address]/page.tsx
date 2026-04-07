import PublicProfile from "./public-profile";

type Props = {
  params: Promise<{ address: string }>;
};

export default async function Page({ params }: Props) {
  const { address } = await params;
  return <PublicProfile address={address} />;
}
