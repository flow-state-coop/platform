"use client";

import { useMemo } from "react";
import Stack from "react-bootstrap/Stack";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import CopyTooltip from "@/components/CopyTooltip";
import { networks } from "@/lib/networks";
import { Network } from "@/types/network";
import { truncateAddress } from "@/lib/utils";
import useCouncilQuery from "@/app/flow-councils/hooks/councilQuery";
import useRecipientsQuery from "@/app/flow-councils/hooks/recipientsQuery";
import useBallotQuery from "@/app/flow-councils/hooks/ballotQuery";
import {
  FLOW_STATE_BOT_ADDRESS,
  METRICS_MIN_INTERVAL_MS,
} from "../lib/constants";

type MetricsIntegrationPanelProps = {
  chainId: number;
  councilId: string;
};

export default function MetricsIntegrationPanel(
  props: MetricsIntegrationPanelProps,
) {
  const { chainId, councilId } = props;

  const network = networks.find((n) => n.id === chainId);

  if (!network) {
    return null;
  }

  return (
    <MetricsIntegrationPanelContent network={network} councilId={councilId} />
  );
}

function MetricsIntegrationPanelContent(props: {
  network: Network;
  councilId: string;
}) {
  const { network, councilId } = props;

  const council = useCouncilQuery(network, councilId);
  const projects = useRecipientsQuery(network, council?.recipients, councilId);
  const { votes, votingPower } = useBallotQuery(
    network,
    councilId,
    FLOW_STATE_BOT_ADDRESS,
  );

  const power = Number(votingPower ?? 0);
  const rateLimitSeconds = Math.round(METRICS_MIN_INTERVAL_MS / 1000);

  const rows = useMemo(() => {
    const recipients: { account: string }[] = council?.recipients ?? [];

    const nameByAddress = new Map<string, string>();
    for (const project of projects ?? []) {
      if (project.details.name) {
        nameByAddress.set(
          project.fundingAddress.toLowerCase(),
          project.details.name,
        );
      }
    }

    const amountByAddress = new Map<string, number>();
    for (const vote of votes ?? []) {
      amountByAddress.set(vote.recipient.toLowerCase(), vote.amount);
    }

    return recipients
      .map((recipient) => {
        const address = recipient.account;
        const amount = amountByAddress.get(address.toLowerCase()) ?? 0;

        return {
          address,
          name: nameByAddress.get(address.toLowerCase()) ?? null,
          amount,
          pct: power > 0 ? (amount / power) * 100 : 0,
        };
      })
      .sort(
        (a, b) =>
          b.amount - a.amount || (a.name ?? "").localeCompare(b.name ?? ""),
      );
  }, [council?.recipients, projects, votes, power]);

  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const totalPct = power > 0 ? (totalAmount / power) * 100 : 0;

  return (
    <Stack direction="vertical" gap={4}>
      <div>
        <span className="fw-semi-bold d-block mb-2">Build an integration</span>
        <p className="text-info mb-2">
          POST relative weights for the metrics bot. The API normalizes them to
          the bot&apos;s on-chain vote power
          {power > 0 ? ` (${power} votes)` : ""} and submits the ballot, so the
          caller stays stateless about vote power and spread.
        </p>
        <pre className="bg-white rounded-4 p-3 mb-2 text-break overflow-auto">
          <code>{`POST /api/flow-council/metrics/ballot
Authorization: Bearer <your-key>
Content-Type: application/json

{
  "votes": [
    { "recipient": "0xRecipientAddress", "weight": 40 },
    { "recipient": "0xRecipientAddress", "weight": 60 }
  ]
}`}</code>
        </pre>
        <ul className="text-info mb-0">
          <li>
            <span className="fw-semi-bold">weight</span> is relative and ≥ 0 (at
            least one must be &gt; 0).
          </li>
          <li>
            <span className="fw-semi-bold">recipient</span> must be a council
            recipient address (listed below). 1 to 1,000 entries, no duplicates.
          </li>
          <li>
            Submitting a ballot that matches the current one is a no-op (no
            transaction).
          </li>
          <li>Rate limit: one ballot every {rateLimitSeconds} seconds.</li>
          <li>
            Responses: <code>200</code> with <code>txHash</code> (or{" "}
            <code>skipped</code>); <code>400</code> invalid or non-recipient;{" "}
            <code>401</code> invalid key; <code>429</code> rate limited.
          </li>
        </ul>
      </div>

      <div>
        <span className="fw-semi-bold d-block mb-1">
          Recipients and current allocation
        </span>
        <p className="text-info mb-2">
          Submit votes by address. The values below are the bot&apos;s current
          on-chain ballot.
        </p>

        {!council ? (
          <Stack direction="horizontal" className="justify-content-center py-3">
            <Spinner size="sm" />
          </Stack>
        ) : rows.length === 0 ? (
          <p className="text-info mb-0">This council has no recipients yet.</p>
        ) : (
          <Table responsive hover className="bg-white rounded-4 mb-0">
            <thead>
              <tr>
                <th className="fw-semi-bold">Recipient</th>
                <th className="fw-semi-bold">Address</th>
                <th className="fw-semi-bold text-end">Current votes</th>
                <th className="fw-semi-bold text-end">Current %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.address}>
                  <td>
                    {row.name ?? <span className="text-info">Unnamed</span>}
                  </td>
                  <td>
                    <CopyTooltip
                      contentClick="Copied"
                      contentHover="Copy address"
                      target={<code>{truncateAddress(row.address)}</code>}
                      handleCopy={() =>
                        navigator.clipboard.writeText(row.address)
                      }
                    />
                  </td>
                  <td className="text-end">{row.amount}</td>
                  <td className="text-end">{row.pct.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="fw-semi-bold">
                <td>Total</td>
                <td />
                <td className="text-end">{totalAmount}</td>
                <td className="text-end">{totalPct.toFixed(1)}%</td>
              </tr>
            </tfoot>
          </Table>
        )}
      </div>
    </Stack>
  );
}
