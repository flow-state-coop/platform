export const FLOW_STATE_MARKEE_ADDRESS =
  "0x8b6b33289c0C4aC55E7ae69382B10e071B0D3dEE" as const;
export const FLOW_STATE_MARKEE_URL =
  "https://www.markee.xyz/ecosystem/platforms/superfluid/0x8b6b33289c0C4aC55E7ae69382B10e071B0D3dEE";

export type MarkeeInfo = {
  message: string;
  owner: string;
  priceEth: string;
};
