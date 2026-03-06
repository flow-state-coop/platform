import { useState, useEffect } from "react";
import { Network } from "@/types/network";
import { ProjectDetails } from "@/types/project";

export default function useRecipientsQuery(
  network: Network,
  recipients?: { account: string }[],
  councilId?: string,
) {
  const [projects, setProjects] = useState<
    | {
        id: string;
        fundingAddress: string;
        details: ProjectDetails;
        status: string;
      }[]
    | null
  >(null);

  useEffect(() => {
    (async () => {
      if (!recipients || recipients.length === 0 || !councilId) {
        return;
      }

      try {
        const params = new URLSearchParams({
          chainId: String(network.id),
          councilId,
        });

        const res = await fetch(
          `/api/flow-council/applications/public?${params}`,
        );

        const { success, applications } = await res.json();

        if (!success || !applications) {
          return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toProjectDetails = (app: any): ProjectDetails => ({
          name: app.project_name || undefined,
          description: app.project_description || undefined,
          logoUrl: app.logo || undefined,
          bannerUrl: app.banner || undefined,
          website: app.website || undefined,
          twitter: app.x_handle || undefined,
          farcaster: app.farcaster_handle || undefined,
          telegram: app.telegram_group || undefined,
          discord: app.discord_channel || undefined,
          demoUrl: app.demo_link || undefined,
          karmaProfile: app.karma_gap_link || undefined,
          gardensPool: app.gardens_link || undefined,
        });

        const result: {
          id: string;
          fundingAddress: string;
          details: ProjectDetails;
          status: string;
        }[] = [];

        const includedAddresses = new Set<string>();

        for (const recipient of recipients) {
          const application = applications.find(
            (app: {
              funding_address: string;
              status: string;
              project_id: number;
            }) =>
              app.funding_address.toLowerCase() ===
                recipient.account.toLowerCase() &&
              (app.status === "ACCEPTED" || app.status === "GRADUATED"),
          );

          if (application) {
            includedAddresses.add(application.funding_address.toLowerCase());
            result.push({
              id: String(application.project_id),
              fundingAddress: recipient.account,
              details: toProjectDetails(application),
              status: application.status,
            });
          }
        }

        for (const application of applications) {
          if (
            application.status === "GRADUATED" &&
            !includedAddresses.has(application.funding_address.toLowerCase())
          ) {
            result.push({
              id: String(application.project_id),
              fundingAddress: application.funding_address,
              details: toProjectDetails(application),
              status: application.status,
            });
          }
        }

        setProjects(result);
      } catch (err) {
        console.error(err);
      }
    })();
  }, [network.id, recipients, councilId]);

  return projects;
}
