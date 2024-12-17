import dynamic from "next/dynamic";

const FlowSplitter = dynamic(() => import("./flow-splitter"), {
  ssr: false,
});

export default async function Page() {
  return <FlowSplitter />;
}
