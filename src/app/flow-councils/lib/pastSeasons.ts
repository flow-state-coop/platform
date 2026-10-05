export type ArchivedProject = {
  name: string;
  fundingAddress: `0x${string}`;
  logoUrl: string;
  href: string;
};

export type PastSeason = {
  name: string;
  period: string;
  councilAddress: `0x${string}`;
  distributionPool: `0x${string}`;
  archivedProjects?: ArchivedProject[];
};

export const GOODBUILDERS_PAST_SEASONS: PastSeason[] = [
  {
    name: "Season 3",
    period: "Feb–May 2026",
    councilAddress: "0xfabef1abae4998146e8a8422813eb787caa26ec2",
    distributionPool: "0xd56e85acdd6481c912c2020dff35e4207824aac2",
  },
  {
    name: "Season 2",
    period: "Jul–Oct 2025",
    councilAddress: "0xa4c44743582208e7e4207d5947c87ad1a0e70aa0",
    distributionPool: "0xafcab1ab378354b8ce0dbd0ae2e2c0dea01dcf0b",
    archivedProjects: [
      {
        name: "Web3 Certifier",
        fundingAddress: "0x637365c8697c63186dc4759bd0f10af9b32d3c1a",
        logoUrl: "/goodbuilders-s2/web3-certifier.jpg",
        href: "https://web3certifier.com",
      },
      {
        name: "Esusu",
        fundingAddress: "0xb82896c4f251ed65186b416dbdb6f6192dfaf926",
        logoUrl: "/goodbuilders-s2/esusu.jpg",
        href: "/projects/30",
      },
      {
        name: "Gardens",
        fundingAddress: "0xd7a3d3a7dd35b8e81fc0b83c032d0ed3261417d9",
        logoUrl: "/goodbuilders-s2/gardens.png",
        href: "/projects/26",
      },
      {
        name: "EGR",
        fundingAddress: "0xab21e10d73afcac6c41545a2499a2f9b0e73bdf5",
        logoUrl: "/goodbuilders-s2/egr.jpg",
        href: "/projects/49",
      },
      {
        name: "Canvassing",
        fundingAddress: "0x9cfa5c4bfe08a1a3f7c17d6503eeb23a0290c4ca",
        logoUrl: "/goodbuilders-s2/canvassing.jpg",
        href: "/projects/52",
      },
      {
        name: "Ubeswap",
        fundingAddress: "0xddabeba1c309bf171cd5e60e863ca14cf84bf2e0",
        logoUrl: "/goodbuilders-s2/ubeswap.png",
        href: "/projects/14",
      },
      {
        name: "The DAO Gold Standard",
        fundingAddress: "0x3764607a0a721981780b798a02c2b1691d6baa39",
        logoUrl: "/goodbuilders-s2/dao-gold-standard.jpg",
        href: "https://gap.karmahq.xyz/project/the-dao-gold-standard-for-on-chain-data",
      },
      {
        name: "EAT: Food Rescue",
        fundingAddress: "0x5e9b9747e64d50d4fbb8c533a17da23e080fe36e",
        logoUrl: "/goodbuilders-s2/eat.jpg",
        href: "/projects/37",
      },
      {
        name: "Spinach",
        fundingAddress: "0xc330d5eb9d0053c12a678f0fb7e9522e40e0cdd1",
        logoUrl: "/goodbuilders-s2/spinach.png",
        href: "https://spinach.fi",
      },
      {
        name: "Flow State",
        fundingAddress: "0xb3f2b4a0b5f2f99e6b6bfc71d5e18a59b92d5606",
        logoUrl: "/goodbuilders-s2/flow-state.png",
        href: "/projects/27",
      },
      {
        name: "Silvi",
        fundingAddress: "0xa7ca400d49bba87eb606ee05af93689bd21fab99",
        logoUrl: "/goodbuilders-s2/silvi.jpg",
        href: "https://silvi.earth",
      },
      {
        name: "Sov Seas",
        fundingAddress: "0x53eaf4cd171842d8144e45211308e5d90b4b0088",
        logoUrl: "/goodbuilders-s2/sov-seas.png",
        href: "https://sovseas.xyz",
      },
      {
        name: "Frontend of stable-sl",
        fundingAddress: "0x84027f515c6a747690b590e9242ca296a38a2e97",
        logoUrl: "/goodbuilders-s2/stable-sl.png",
        href: "https://stable-sl.pdj.app",
      },
    ],
  },
];
