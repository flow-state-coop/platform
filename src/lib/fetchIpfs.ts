import { createVerifiedFetch } from "@helia/verified-fetch";
import { IPFS_GATEWAYS } from "@/lib/constants";

const cidRegex = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|baf[0-9A-Za-z]{50,})$/;

export const fetchIpfsJson = async (cid: string) => {
  if (!cidRegex.test(cid)) {
    return null;
  }

  const verifiedFetch = await createVerifiedFetch({
    gateways: IPFS_GATEWAYS,
  });
  const controller = new AbortController();
  const timerId = setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    const res = await verifiedFetch(`ipfs://${cid}`, {
      signal: controller.signal,
    });

    clearTimeout(timerId);

    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error(err);
  }

  return null;
};

export const fetchIpfsImage = async (cid: string) => {
  if (!cidRegex.test(cid)) {
    return "";
  }

  const verifiedFetch = await createVerifiedFetch({
    gateways: IPFS_GATEWAYS,
  });

  try {
    const res = await verifiedFetch(`ipfs://${cid}`);

    if (res.ok) {
      const blob = await res.blob();

      return URL.createObjectURL(blob);
    }
  } catch (err) {
    console.error(err);
  }

  return "";
};
