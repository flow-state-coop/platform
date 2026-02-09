import { useState, useEffect } from "react";
import {
  fetchRoundMetadata,
  type RoundMetadata,
} from "@/app/flow-councils/lib/fetchRoundMetadata";

export default function useCouncilMetadata(chainId: number, councilId: string) {
  const [metadata, setMetadata] = useState<RoundMetadata>({
    name: "",
    description: "",
    logoUrl: "",
    superappSplitterAddress: null,
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
