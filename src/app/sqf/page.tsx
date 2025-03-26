import dynamic from "next/dynamic";

const SQF = dynamic(() => import("./sqf"), { ssr: false });

export default async function Page() {
  return <SQF />;
}
