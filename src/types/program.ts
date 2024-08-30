export type Program = {
  id: `0x${string}`;
  metadata: ProgramMetadata;
};

export type ProgramMetadata = {
  name: string;
  type: string;
};
