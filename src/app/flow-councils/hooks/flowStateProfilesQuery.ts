import { useState, useEffect } from "react";
import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { Project } from "@/types/project";
import { fetchIpfsJson } from "@/lib/fetchIpfs";
import { getApolloClient } from "@/lib/apollo";

const FLOWSTATE_QUERY = gql`
  query FlowStateProfiles($profileIds: [String!], $chainId: Int!) {
    profiles(
      condition: { chainId: $chainId }
      filter: { id: { in: $profileIds } }
    ) {
      id
      metadataCid
    }
  }
`;

export default function useFlowStateProfilesQuery(
  network: Network,
  grantees?: { metadata: string }[],
) {
  const [profiles, setProfiles] = useState<Project[] | null>(null);

  const { data: flowStateQueryRes } = useQuery(FLOWSTATE_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      chainId: network.id,
      profileIds: grantees?.map(
        (grantee: { metadata: string }) => grantee.metadata,
      ),
    },
    skip: !grantees || grantees.length === 0,
    pollInterval: 10000,
  });

  useEffect(() => {
    (async () => {
      if (!flowStateQueryRes?.profiles) {
        return;
      }

      const profiles = [];

      for (const profile of flowStateQueryRes.profiles) {
        const metadata = await fetchIpfsJson(profile.metadataCid);

        if (metadata) {
          profiles.push({ ...profile, metadata });
        }
      }

      setProfiles(profiles);
    })();
  }, [flowStateQueryRes]);

  return profiles;
}
