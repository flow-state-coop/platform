export type Project = {
  id: `0x${string}`;
  anchorAddress: string;
  metadataCid: string;
  metadata: ProjectMetadata;
  profileRolesByChainIdAndProfileId: { address: string };
};

export type ProjectMetadata = {
  title: string;
  description: string;
  website: string;
  logoImg: string;
  bannerImg: string;
  projectTwitter: string;
  userGithub: string;
  projectGithub: string;
};
