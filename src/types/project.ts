export type Project = {
  id: `0x${string}`;
  anchorAddress: string;
  metadataCid: string;
  metadata: ProjectMetadata;
  profileRolesByChainIdAndProfileId: {
    address: string;
    role: "OWNER" | "MEMBER";
  }[];
};

export type ProjectMetadata = {
  title: string;
  description: string;
  website: string;
  appLink: string;
  logoImg: string;
  bannerImg: string;
  projectTwitter: string;
  userGithub: string;
  projectGithub: string;
  karmaGap: string;
  projectTelegram: string;
  projectWarpcast: string;
  projectGuild: string;
  projectDiscord: string;
  projectLens: string;
};
