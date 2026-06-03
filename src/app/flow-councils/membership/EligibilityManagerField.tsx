"use client";

import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Image from "react-bootstrap/Image";
import InfoTooltip from "@/components/InfoTooltip";
import { networks } from "@/lib/networks";
import { FLOW_STATE_BOT_ADDRESS } from "@/app/flow-councils/lib/constants";

type EligibilityManagerFieldProps = {
  chainId: number;
  botHasRole: boolean;
  isAdmin: boolean;
  isWrongChain: boolean;
  isGranting: boolean;
  onAddPermissions: () => void;
};

export default function EligibilityManagerField(
  props: EligibilityManagerFieldProps,
) {
  const {
    chainId,
    botHasRole,
    isAdmin,
    isWrongChain,
    isGranting,
    onAddPermissions,
  } = props;

  const explorer = networks.find((n) => n.id === chainId)?.blockExplorer;
  const addressLink = explorer
    ? `${explorer.replace(/\/$/, "")}/address/${FLOW_STATE_BOT_ADDRESS}`
    : null;

  return (
    <div>
      <span className="fw-semi-bold d-block mb-1">Eligibility Manager</span>
      <Stack
        direction="horizontal"
        gap={2}
        className="flex-wrap align-items-center"
      >
        {addressLink ? (
          <a
            href={addressLink}
            target="_blank"
            rel="noreferrer"
            className="text-primary text-decoration-none text-break"
          >
            {FLOW_STATE_BOT_ADDRESS}
          </a>
        ) : (
          <span className="text-break">{FLOW_STATE_BOT_ADDRESS}</span>
        )}

        {!botHasRole ? (
          <>
            <InfoTooltip
              position={{ top: true }}
              target={
                <Image
                  src="/warning-triangle.svg"
                  alt="Warning"
                  width={18}
                  height={18}
                />
              }
              content={
                <p className="m-0 p-2">
                  Manager not added. Automated eligibility will not work until
                  permissions have been granted.
                </p>
              }
            />
            {isAdmin ? (
              <Button
                variant="danger"
                size="sm"
                className="rounded-3 px-3 fw-semi-bold text-white"
                disabled={isGranting}
                onClick={onAddPermissions}
              >
                {isGranting ? (
                  <Spinner size="sm" />
                ) : isWrongChain ? (
                  "Switch Network"
                ) : (
                  "Add Permissions"
                )}
              </Button>
            ) : (
              <span className="text-danger small">
                A council admin must grant this role.
              </span>
            )}
          </>
        ) : null}
      </Stack>
    </div>
  );
}
