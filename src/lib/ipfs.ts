import { PINATA_JWT_KEY } from "./constants";

export async function pinFileToIPFS(metadata: unknown) {
  try {
    const blob = new Blob([JSON.stringify(metadata)], { type: "text/plain" });
    const data = new FormData();
    data.append("file", blob);

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PINATA_JWT_KEY}`,
      },
      body: data,
    });

    return await res.json();
  } catch (error) {
    console.error(error);
  }
}
