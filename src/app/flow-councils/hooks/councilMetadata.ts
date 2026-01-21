import { useState, useEffect } from "react";

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

      try {
        const res = await fetch(
          `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${councilId}`,
        );
        const data = await res.json();

        if (data.success && data.round?.details) {
          const details =
            typeof data.round.details === "string"
              ? JSON.parse(data.round.details)
              : data.round.details;

          setMetadata({
            name: details?.name ?? "Flow Council",
            description: details?.description ?? "",
            logoUrl: details?.logoUrl ?? "",
          });
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, [chainId, councilId]);

  return metadata;
}
