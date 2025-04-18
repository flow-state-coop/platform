import { useState, useEffect } from "react";
import { createVerifiedFetch } from "@helia/verified-fetch";
import { IPFS_GATEWAYS } from "@/lib/constants";

export default function useCouncilMetadata(cid: string) {
  const [metadata, setMetadata] = useState({ name: "", description: "" });

  useEffect(() => {
    (async () => {
      if (!cid) {
        return;
      }

      try {
        const verifiedFetch = await createVerifiedFetch({
          gateways: IPFS_GATEWAYS,
        });

        const metadataRes = await verifiedFetch(`ipfs://${cid}`);
        const metadata = await metadataRes.json();

        setMetadata(metadata);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [cid]);

  return {
    name: metadata.name,
    description: metadata.description,
  };
}
