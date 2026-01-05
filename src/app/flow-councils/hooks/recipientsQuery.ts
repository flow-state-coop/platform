import { useState, useEffect } from "react";
import { Network } from "@/types/network";
import { ProjectMetadata } from "@/types/project";

export default function useRecipientsQuery(
  network: Network,
  recipients?: { account: string }[],
  councilId?: string,
) {
  const [projects, setProjects] = useState<
    { id: string; metadata: ProjectMetadata }[] | null
  >(null);

  useEffect(() => {
    (async () => {
      if (!recipients || recipients.length === 0 || !councilId) {
        return;
      }

      try {
        const res = await fetch("/api/flow-council/applications", {
          method: "POST",
          body: JSON.stringify({
            chainId: network.id,
            councilId,
          }),
        });

        const { success, applications } = await res.json();

        if (!success || !applications) {
          return;
        }

        const result: { id: string; metadata: ProjectMetadata }[] = [];

        for (const recipient of recipients) {
          const application = applications.find(
            (app: { fundingAddress: string; status: string }) =>
              app.fundingAddress.toLowerCase() ===
                recipient.account.toLowerCase() && app.status === "ACCEPTED",
          );

          if (application?.projectDetails) {
            result.push({
              id: recipient.account,
              metadata: {
                title: application.projectDetails.name ?? "",
                description: application.projectDetails.description ?? "",
                logoImg: application.projectDetails.logoUrl ?? "",
                bannerImg: application.projectDetails.bannerUrl ?? "",
                projectTwitter: application.projectDetails.twitter ?? "",
                website: application.projectDetails.website ?? "",
                appLink: "",
                userGithub: "",
                projectGithub: application.projectDetails.github ?? "",
                karmaGap: "",
                projectTelegram: "",
                projectWarpcast: "",
                projectGuild: "",
                projectDiscord: "",
                projectLens: "",
              },
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
