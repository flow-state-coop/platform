import { useState, useEffect } from "react";
import { Network } from "@/types/network";
import { ProjectDetails } from "@/types/project";

export default function useRecipientsQuery(
  network: Network,
  recipients?: { account: string }[],
  councilId?: string,
) {
  const [projects, setProjects] = useState<
    { id: string; fundingAddress: string; details: ProjectDetails }[] | null
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

        const result: {
          id: string;
          fundingAddress: string;
          details: ProjectDetails;
        }[] = [];

        for (const recipient of recipients) {
          const application = applications.find(
            (app: {
              fundingAddress: string;
              status: string;
              projectId: number;
            }) =>
              app.fundingAddress.toLowerCase() ===
                recipient.account.toLowerCase() && app.status === "ACCEPTED",
          );

          if (application?.projectDetails) {
            result.push({
              id: String(application.projectId),
              fundingAddress: recipient.account,
              details: application.projectDetails,
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
