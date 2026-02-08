import { useState, useEffect } from "react";
import { fetchRoundMetadata } from "@/app/flow-councils/lib/fetchRoundMetadata";

export default function useCouncilMetadata(chainId: number, councilId: string) {
  const [metadata, setMetadata] = useState({
    name: "",
    description: "",
    logoUrl: "",
  });

  useEffect(() => {
    (async () => {
      if (!chainId || !councilId) {
        return;
      }

      const result = await fetchRoundMetadata(chainId, councilId);
      setMetadata(result);
    })();
  }, [chainId, councilId]);

  return metadata;
}
