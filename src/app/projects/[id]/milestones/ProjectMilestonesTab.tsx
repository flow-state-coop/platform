"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import Spinner from "react-bootstrap/Spinner";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Image from "react-bootstrap/Image";
import Button from "react-bootstrap/Button";
import MilestoneCard, { NewMilestoneCard } from "./MilestoneCard";
import useRequireAuth from "@/hooks/requireAuth";
import { MAX_MILESTONES } from "@/app/flow-councils/constants";
import type { ApplicationMilestones, MilestoneWithProgress } from "./types";

type ProjectMilestonesTabProps = {
  projectId: string;
  isManager: boolean;
  scrollToMilestone?: string | null;
};

// The GET returns each application's milestones ordered by type (all of one
// element's, then the next), so grouping into contiguous runs keeps the
// existing order while giving each type a place to hang its "Add" action.
function groupMilestonesByType(milestones: MilestoneWithProgress[]) {
  const groups: { type: string; milestones: MilestoneWithProgress[] }[] = [];
  for (const milestone of milestones) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.type === milestone.type) {
      lastGroup.milestones.push(milestone);
    } else {
      groups.push({ type: milestone.type, milestones: [milestone] });
    }
  }
  return groups;
}

export default function ProjectMilestonesTab({
  projectId,
  isManager,
  scrollToMilestone,
}: ProjectMilestonesTabProps) {
  const { requireAuth } = useRequireAuth();

  const [applications, setApplications] = useState<ApplicationMilestones[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [addingTo, setAddingTo] = useState<{
    applicationId: number;
    type: string;
  } | null>(null);

  const fetchMilestones = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/flow-council/projects/${projectId}/milestones`,
      );
      const data = await res.json();
      if (data.success) {
        setApplications(data.applications);
      }
    } catch (err) {
      console.error("Failed to fetch milestones:", err);
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchMilestones();
  }, [fetchMilestones]);

  useEffect(() => {
    if (!isLoading && scrollToMilestone && applications.length > 0) {
      // New links carry "<applicationId>-<type>-<index>" and match the card id
      // exactly; links from before applicationId was included fall back to a
      // suffix match (first card wins, as before).
      const el =
        document.getElementById(`milestone-${scrollToMilestone}`) ??
        document.querySelector(`[id$="-${CSS.escape(scrollToMilestone)}"]`);
      if (el) {
        const timeout = setTimeout(
          () => el.scrollIntoView({ behavior: "smooth", block: "center" }),
          100,
        );
        return () => clearTimeout(timeout);
      }
    }
  }, [isLoading, scrollToMilestone, applications]);

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner />
      </div>
    );
  }

  const hasMilestones = applications.some((a) => a.milestones.length > 0);

  if (!hasMilestones) {
    return (
      <p className="text-muted py-5 text-center">
        No milestones available for this project.
      </p>
    );
  }

  return (
    <div>
      {applications.map(
        (app) =>
          app.milestones.length > 0 && (
            <Form.Group key={app.applicationId} className="mb-4">
              <a
                href={`/flow-councils/${app.chainId}/${app.councilId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="fs-lg fw-bold text-decoration-none d-inline-flex align-items-center gap-1 mb-2"
              >
                {app.roundName}
                <Image src="/open-new.svg" alt="" width={14} height={14} />
              </a>
              <Stack direction="vertical" gap={3}>
                {groupMilestonesByType(app.milestones).map((group) => {
                  const canModify = isManager && app.editsUnlocked;
                  const template =
                    group.milestones[group.milestones.length - 1];
                  const isAdding =
                    addingTo?.applicationId === app.applicationId &&
                    addingTo.type === group.type;

                  return (
                    <Fragment key={group.type}>
                      {group.milestones.map((m) => (
                        <MilestoneCard
                          key={`${m.type}-${m.index}`}
                          milestone={m}
                          applicationId={app.applicationId}
                          projectId={projectId}
                          isManager={isManager}
                          editsUnlocked={app.editsUnlocked}
                          canDelete={
                            canModify && group.milestones.length > m.minCount
                          }
                          onSaved={fetchMilestones}
                        />
                      ))}
                      {isAdding ? (
                        <NewMilestoneCard
                          applicationId={app.applicationId}
                          projectId={projectId}
                          milestoneType={group.type}
                          milestoneLabel={template.milestoneLabel}
                          itemLabel={template.itemLabel}
                          index={group.milestones.length}
                          descriptionMinChars={template.descriptionMinChars}
                          descriptionMaxChars={template.descriptionMaxChars}
                          onCancel={() => setAddingTo(null)}
                          onSaved={() => {
                            setAddingTo(null);
                            fetchMilestones();
                          }}
                        />
                      ) : (
                        canModify &&
                        group.milestones.length < MAX_MILESTONES && (
                          <Button
                            variant="link"
                            className="p-0 text-start text-decoration-underline fw-semi-bold text-primary align-self-start"
                            onClick={() =>
                              requireAuth(() =>
                                setAddingTo({
                                  applicationId: app.applicationId,
                                  type: group.type,
                                }),
                              )
                            }
                          >
                            Add {template.milestoneLabel}
                          </Button>
                        )
                      )}
                    </Fragment>
                  );
                })}
              </Stack>
            </Form.Group>
          ),
      )}
    </div>
  );
}
