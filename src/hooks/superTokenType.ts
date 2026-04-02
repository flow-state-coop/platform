import { useQuery, gql } from "@apollo/client";
import { getApolloClient } from "@/lib/apollo";
import { ZERO_ADDRESS } from "@/lib/constants";

const SUPER_TOKEN_TYPE_QUERY = gql`
  query SuperTokenType($token: String!) {
    token(id: $token) {
      isNativeAssetSuperToken
      underlyingAddress
    }
  }
`;

export default function useSuperTokenType(
  tokenAddress: string,
  chainId: number,
) {
  const { data, loading } = useQuery(SUPER_TOKEN_TYPE_QUERY, {
    client: getApolloClient("superfluid", chainId),
    variables: { token: tokenAddress?.toLowerCase() },
    skip: !tokenAddress,
  });

  const isSuperTokenNative: boolean | undefined = data?.token
    ? data.token.isNativeAssetSuperToken
    : undefined;
  const underlyingAddress: string | undefined = data?.token
    ? data.token.underlyingAddress
    : undefined;
  const isSuperTokenPure: boolean | undefined = data?.token
    ? !isSuperTokenNative &&
      (!underlyingAddress || underlyingAddress === ZERO_ADDRESS)
    : undefined;
  const isSuperTokenWrapper: boolean | undefined = data?.token
    ? !isSuperTokenNative && !isSuperTokenPure
    : undefined;

  return {
    isSuperTokenNative,
    isSuperTokenWrapper,
    isSuperTokenPure,
    underlyingAddress,
    loading,
  };
}
