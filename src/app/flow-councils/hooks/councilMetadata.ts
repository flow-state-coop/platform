import { useQuery } from "@tanstack/react-query";
import {
  fetchRoundMetadata,
  type RoundMetadata,
} from "@/app/flow-councils/lib/fetchRoundMetadata";

const DEFAULT_METADATA: RoundMetadata = {
  name: "",
  description: "",
  logoUrl: "",
  superappSplitterAddress: null,
  applicationsClosed: false,
  social: null,
};

export default function useCouncilMetadata(chainId: number, councilId: string) {
  const { data, isPending } = useQuery({
    queryKey: ["councilMetadata", chainId, councilId],
    queryFn: () => fetchRoundMetadata(chainId, councilId),
    enabled: !!chainId && !!councilId,
    staleTime: 60_000,
  });

  return { ...(data ?? DEFAULT_METADATA), isPending };
}
