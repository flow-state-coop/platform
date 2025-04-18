import { useQuery, gql } from "@apollo/client";
import { Network } from "@/types/network";
import { getApolloClient } from "@/lib/apollo";

const PROJECTS_QUERY = gql`
  query ProjectsQuery($address: String!, $chainId: Int!) {
    profiles(
      filter: {
        chainId: { equalTo: $chainId }
        profileRolesByChainIdAndProfileId: {
          some: { address: { equalTo: $address } }
        }
        and: {
          profileRolesByChainIdAndProfileId: {
            some: { role: { equalTo: OWNER } }
          }
        }
        tags: { contains: ["allo", "project"] }
      }
    ) {
      id
      anchorAddress
      metadataCid
      metadata
      profileRolesByChainIdAndProfileId {
        address
      }
    }
  }
`;

export default function useFlowStateProjectsQuery(
  network: Network,
  address: string,
) {
  const { data: flowStateQueryRes } = useQuery(PROJECTS_QUERY, {
    client: getApolloClient("flowState"),
    variables: {
      address: address?.toLowerCase() ?? "",
      chainId: network.id,
    },
    skip: !address,
    pollInterval: 10000,
  });

  return flowStateQueryRes?.profiles;
}
