import { useState, useEffect } from "react";
import { fetchIpfsJson } from "@/lib/fetchIpfs";

export default function useCouncilMetadata(cid: string) {
  const [metadata, setMetadata] = useState({ name: "", description: "" });

  useEffect(() => {
    (async () => {
      if (!cid) {
        return;
      }

      const metadata = await fetchIpfsJson(cid);

      if (metadata) {
        setMetadata(metadata);
      }
    })();
  }, [cid]);

  return {
    name: metadata.name,
    description: metadata.description,
  };
}
