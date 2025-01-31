import { useMemo } from "react";
import Link from "next/link";
import { formatEther } from "viem";
import Stack from "react-bootstrap/Stack";
import Jazzicon, { jsNumberForAddress } from "react-jazzicon";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { truncateStr } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";
import { useMediaQuery } from "@/hooks/mediaQuery";

type ActivityFeedProps = {
  poolSymbol: string;
  poolAddress: string;
  network: Network;
  token: Token;
  poolCreatedEvent: PoolCreatedEvent;
  poolAdminAddedEvents: PoolAdminAddedEvent[];
  poolAdminRemovedEvents: PoolAdminRemovedEvent[];
  memberUnitsUpdatedEvents: MemberUnitsUpdatedEvent[];
  flowDistributionUpdatedEvents: FlowDistributionUpdatedEvent[];
  instantDistributionUpdatedEvents: InstantDistributionUpdatedEvent[];
};

type PoolCreationMemberUnitsUpdates = {
  poolCreatedEvent: PoolCreatedEvent;
  timestamp: `${number}`;
  memberUnitsUpdatedEvents: MemberUnitsUpdatedEvent[];
  __typename: string;
};

type PoolUpdateMemberUnitsUpdates = {
  timestamp: `${number}`;
  transactionHash: `0x${string}`;
  memberUnitsUpdatedEvents: MemberUnitsUpdatedEvent[];
  __typename: string;
};

type PoolCreatedEvent = {
  timestamp: `${number}`;
  transactionHash: `0x${string}`;
  __typename: string;
};

type MemberUnitsUpdatedEvent = {
  units: `${number}`;
  oldUnits: `${number}`;
  poolMember: {
    account: {
      id: `0x${string}`;
    };
  };
  timestamp: `${number}`;
  transactionHash: `0x${string}`;
  __typename: string;
};

type PoolAdminAddedEvent = {
  address: string;
  timestamp: `${number}`;
  transactionHash: `0x${string}`;
  __typename: string;
};

type PoolAdminRemovedEvent = {
  address: string;
  timestamp: `${number}`;
  transactionHash: `0x${string}`;
  __typename: string;
};

type FlowDistributionUpdatedEvent = {
  newDistributorToPoolFlowRate: `${number}`;
  oldFlowRate: `${number}`;
  poolDistributor: {
    account: {
      id: `0x${string}`;
    };
  };
  timestamp: `${number}`;
  transactionHash: `0x${string}`;
  __typename: string;
};

type InstantDistributionUpdatedEvent = {
  requestedAmount: `${number}`;
  poolDistributor: {
    account: {
      id: `0x${string}`;
    };
  };
  timestamp: `${number}`;
  transactionHash: `0x${string}`;
  __typename: string;
};

export default function ActivityFeed(props: ActivityFeedProps) {
  const {
    poolSymbol,
    poolAddress,
    network,
    token,
    poolCreatedEvent,
    memberUnitsUpdatedEvents,
    poolAdminAddedEvents,
    poolAdminRemovedEvents,
    flowDistributionUpdatedEvents,
    instantDistributionUpdatedEvents,
  } = props;

  const { isMobile } = useMediaQuery();

  const events = useMemo(() => {
    const events: Array<
      | PoolCreationMemberUnitsUpdates
      | PoolUpdateMemberUnitsUpdates
      | PoolAdminAddedEvent
      | PoolAdminRemovedEvent
      | FlowDistributionUpdatedEvent
      | InstantDistributionUpdatedEvent
    > = [];
    const poolCreationMemberUnitsUpdates = {
      poolCreatedEvent,
      timestamp: poolCreatedEvent.timestamp,
      memberUnitsUpdatedEvents: [] as MemberUnitsUpdatedEvent[],
      __typename: "PoolCreationMemberUnitsUpdates",
    };

    for (const memberUnitsUpdatedEvent of memberUnitsUpdatedEvents) {
      if (memberUnitsUpdatedEvent.timestamp === poolCreatedEvent.timestamp) {
        poolCreationMemberUnitsUpdates.memberUnitsUpdatedEvents.push(
          memberUnitsUpdatedEvent,
        );
      }
    }

    const groupedMemberUnitsUpdates = memberUnitsUpdatedEvents
      .filter(
        (event) =>
          event.timestamp !== poolCreatedEvent.timestamp &&
          event.units !== event.oldUnits,
      )
      .reduce(
        (
          grouped: { [key: `0x${string}`]: MemberUnitsUpdatedEvent[] },
          event,
        ) => ({
          ...grouped,
          [event.transactionHash]: [
            ...(grouped[event.transactionHash] || []),
            event,
          ],
        }),
        {},
      );

    for (const groupedMemberUnitsUpdate of Object.entries(
      groupedMemberUnitsUpdates,
    )) {
      const poolUpdateMemberUnitsUpdates = {
        memberUnitsUpdatedEvents:
          groupedMemberUnitsUpdate[1] as MemberUnitsUpdatedEvent[],
        timestamp: (
          groupedMemberUnitsUpdate[1] as { timestamp: `${number}` }[]
        )[0].timestamp,
        transactionHash: groupedMemberUnitsUpdate[0] as `0x${string}`,
        __typename: "PoolUpdateMemberUnitsUpdates",
      };

      events.push(poolUpdateMemberUnitsUpdates);
    }

    events.push(...instantDistributionUpdatedEvents);
    events.push(...flowDistributionUpdatedEvents);
    events.push(...poolAdminAddedEvents);
    events.push(...poolAdminRemovedEvents);
    events.push(poolCreationMemberUnitsUpdates);
    events.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));

    return events;
  }, [
    poolCreatedEvent,
    memberUnitsUpdatedEvents,
    poolAdminAddedEvents,
    poolAdminRemovedEvents,
    flowDistributionUpdatedEvents,
    instantDistributionUpdatedEvents,
  ]);

  return (
    <Stack
      direction="vertical"
      gap={4}
      className="mt-5 bg-light p-4 rounded-5"
      style={{ fontSize: isMobile ? "1rem" : "1.25rem" }}
    >
      <p className="m-0 fs-3">Activity</p>
      {events.map((event, i) => {
        if (event.__typename === "PoolCreationMemberUnitsUpdates") {
          return (
            <Stack direction="vertical" gap={2} key={i}>
              <Stack direction="horizontal" gap={2}>
                <span
                  style={{
                    width: isMobile ? 36 : 24,
                    height: isMobile ? 36 : 24,
                  }}
                >
                  <Jazzicon
                    paperStyles={{ border: "1px solid black" }}
                    diameter={isMobile ? 36 : 24}
                    seed={jsNumberForAddress(poolAddress)}
                  />
                </span>
                <Stack
                  direction={isMobile ? "vertical" : "horizontal"}
                  className="w-100 justify-content-between"
                >
                  <p className="m-0">Flow Splitter Created</p>
                  <Link
                    href={`${network.blockExplorer}/tx/${(event as PoolCreationMemberUnitsUpdates).poolCreatedEvent.transactionHash}`}
                    target="_blank"
                    className="text-info"
                  >
                    {new Date(Number(event.timestamp) * 1000).toLocaleString(
                      "en-US",
                      {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "numeric",
                      },
                    )}
                  </Link>
                </Stack>
              </Stack>
              <Stack direction="vertical" gap={2} className="ms-5">
                {(
                  event as PoolCreationMemberUnitsUpdates
                ).memberUnitsUpdatedEvents.map((memberUnitsUpdatedEvent, i) => (
                  <Stack
                    direction="horizontal"
                    gap={2}
                    className="align-items-center"
                    key={i}
                  >
                    <span style={{ width: 24, height: 24 }}>
                      <Jazzicon
                        paperStyles={{ border: "1px solid black" }}
                        diameter={24}
                        seed={jsNumberForAddress(
                          memberUnitsUpdatedEvent.poolMember.account.id,
                        )}
                      />
                    </span>
                    <p className="m-0">
                      <Link
                        href={`${network.blockExplorer}/address/${memberUnitsUpdatedEvent.poolMember.account.id}`}
                        target="_blank"
                      >
                        {truncateStr(
                          memberUnitsUpdatedEvent.poolMember.account.id,
                          15,
                        )}
                      </Link>
                      :{" "}
                      {Intl.NumberFormat("en", {
                        maximumFractionDigits: 4,
                      }).format(Number(memberUnitsUpdatedEvent.units))}{" "}
                      {poolSymbol}{" "}
                      {Number(memberUnitsUpdatedEvent.units) === 1
                        ? "Share"
                        : "Shares"}
                    </p>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          );
        }

        if (event.__typename === "PoolUpdateMemberUnitsUpdates") {
          return (
            <Stack direction="vertical" gap={2} key={i}>
              <Stack direction="horizontal" gap={2}>
                <span
                  style={{
                    width: isMobile ? 36 : 24,
                    height: isMobile ? 36 : 24,
                  }}
                >
                  <Jazzicon
                    paperStyles={{ border: "1px solid black" }}
                    diameter={isMobile ? 36 : 24}
                    seed={jsNumberForAddress(poolAddress)}
                  />
                </span>
                <Stack
                  direction={isMobile ? "vertical" : "horizontal"}
                  className="w-100 justify-content-between"
                >
                  <p className="m-0">Flow Splitter Updated</p>
                  <Link
                    href={`${network.blockExplorer}/tx/${(event as PoolUpdateMemberUnitsUpdates).transactionHash}`}
                    target="_blank"
                    className="text-info"
                  >
                    {new Date(Number(event.timestamp) * 1000).toLocaleString(
                      "en-US",
                      {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "numeric",
                      },
                    )}
                  </Link>
                </Stack>
              </Stack>
              <Stack direction="vertical" gap={2} className="ms-5">
                {(
                  event as PoolUpdateMemberUnitsUpdates
                ).memberUnitsUpdatedEvents.map((memberUnitsUpdatedEvent, i) => (
                  <Stack
                    direction="horizontal"
                    gap={2}
                    className="align-items-center"
                    key={i}
                  >
                    <span style={{ width: 24, height: 24 }}>
                      <Jazzicon
                        paperStyles={{ border: "1px solid black" }}
                        diameter={24}
                        seed={jsNumberForAddress(
                          memberUnitsUpdatedEvent.poolMember.account.id,
                        )}
                      />
                    </span>
                    <p className="m-0">
                      <Link
                        href={`${network.blockExplorer}/address/${memberUnitsUpdatedEvent.poolMember.account.id}`}
                        target="_blank"
                      >
                        {truncateStr(
                          memberUnitsUpdatedEvent.poolMember.account.id,
                          15,
                        )}
                      </Link>
                      :{" "}
                      {Number(memberUnitsUpdatedEvent.units) -
                        Number(memberUnitsUpdatedEvent.oldUnits) >=
                      0
                        ? "+"
                        : ""}
                      {Intl.NumberFormat("en", {
                        maximumFractionDigits: 4,
                      }).format(
                        Number(memberUnitsUpdatedEvent.units) -
                          Number(memberUnitsUpdatedEvent.oldUnits),
                      )}{" "}
                      {poolSymbol}{" "}
                      {Math.abs(
                        Number(memberUnitsUpdatedEvent.units) -
                          Number(memberUnitsUpdatedEvent.oldUnits),
                      ) === 1
                        ? "Share"
                        : "Shares"}
                    </p>
                  </Stack>
                ))}
              </Stack>
            </Stack>
          );
        }

        if (event.__typename === "PoolAdminAddedEvent") {
          return (
            <Stack direction="horizontal" gap={2} key={i}>
              <span
                style={{
                  width: isMobile ? 36 : 24,
                  height: isMobile ? 36 : 24,
                }}
              >
                <Jazzicon
                  paperStyles={{ border: "1px solid black" }}
                  diameter={isMobile ? 36 : 24}
                  seed={jsNumberForAddress(
                    (event as PoolAdminAddedEvent).address,
                  )}
                />
              </span>
              <Stack
                direction={isMobile ? "vertical" : "horizontal"}
                className="w-100 justify-content-between"
              >
                <p className="m-0">
                  <Link
                    href={`${network.blockExplorer}/address/${(event as PoolAdminAddedEvent).address}`}
                    target="_blank"
                  >
                    {truncateStr((event as PoolAdminAddedEvent).address, 15)}{" "}
                  </Link>{" "}
                  added as a Flow Splitter admin
                </p>
                <Link
                  href={`${network.blockExplorer}/tx/${(event as PoolAdminAddedEvent).transactionHash}`}
                  target="_blank"
                  className="text-info"
                >
                  {new Date(Number(event.timestamp) * 1000).toLocaleString(
                    "en-US",
                    {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "numeric",
                    },
                  )}
                </Link>
              </Stack>
            </Stack>
          );
        }

        if (event.__typename === "PoolAdminRemovedEvent") {
          return (
            <Stack direction="horizontal" gap={2} key={i}>
              <span
                style={{
                  width: isMobile ? 36 : 24,
                  height: isMobile ? 36 : 24,
                }}
              >
                <Jazzicon
                  paperStyles={{ border: "1px solid black" }}
                  diameter={isMobile ? 36 : 24}
                  seed={jsNumberForAddress(
                    (event as PoolAdminRemovedEvent).address,
                  )}
                />
              </span>
              <Stack
                direction={isMobile ? "vertical" : "horizontal"}
                className="w-100 justify-content-between"
              >
                <p className="m-0">
                  <Link
                    href={`${network.blockExplorer}/address/${(event as PoolAdminRemovedEvent).address}`}
                    target="_blank"
                  >
                    {truncateStr((event as PoolAdminRemovedEvent).address, 15)}{" "}
                  </Link>{" "}
                  removed as a Flow Splitter admin.
                </p>
                <Link
                  href={`${network.blockExplorer}/tx/${(event as PoolAdminRemovedEvent).transactionHash}`}
                  target="_blank"
                  className="text-info"
                >
                  {new Date(Number(event.timestamp) * 1000).toLocaleString(
                    "en-US",
                    {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "numeric",
                    },
                  )}
                </Link>
              </Stack>
            </Stack>
          );
        }

        if (event.__typename === "FlowDistributionUpdatedEvent") {
          return (
            <Stack direction="horizontal" gap={2} key={i}>
              <span
                style={{
                  width: isMobile ? 36 : 24,
                  height: isMobile ? 36 : 24,
                }}
              >
                <Jazzicon
                  paperStyles={{ border: "1px solid black" }}
                  diameter={isMobile ? 36 : 24}
                  seed={jsNumberForAddress(
                    (event as FlowDistributionUpdatedEvent).poolDistributor
                      .account.id,
                  )}
                />
              </span>
              <Stack
                direction={isMobile ? "vertical" : "horizontal"}
                className="w-100 justify-content-between"
              >
                <p className="m-0">
                  <Link
                    href={`${network.blockExplorer}/address/${(event as FlowDistributionUpdatedEvent).poolDistributor.account.id}`}
                    target="_blank"
                  >
                    {truncateStr(
                      (event as FlowDistributionUpdatedEvent).poolDistributor
                        .account.id,
                      15,
                    )}{" "}
                  </Link>{" "}
                  {(event as FlowDistributionUpdatedEvent).oldFlowRate ===
                  "0" ? (
                    <>
                      opened a{" "}
                      {Intl.NumberFormat("en", {
                        maximumFractionDigits: 4,
                      }).format(
                        Number(
                          formatEther(
                            BigInt(
                              (event as FlowDistributionUpdatedEvent)
                                .newDistributorToPoolFlowRate,
                            ) * BigInt(SECONDS_IN_MONTH),
                          ),
                        ),
                      )}{" "}
                      {token.name}/mo stream
                    </>
                  ) : (event as FlowDistributionUpdatedEvent)
                      .newDistributorToPoolFlowRate === "0" ? (
                    <>
                      closed a{" "}
                      {Intl.NumberFormat("en", {
                        maximumFractionDigits: 4,
                      }).format(
                        Number(
                          formatEther(
                            BigInt(
                              (event as FlowDistributionUpdatedEvent)
                                .oldFlowRate,
                            ) * BigInt(SECONDS_IN_MONTH),
                          ),
                        ),
                      )}{" "}
                      {token.name}/mo stream.
                    </>
                  ) : (
                    <>
                      updated a stream from{" "}
                      {Intl.NumberFormat("en", {
                        maximumFractionDigits: 4,
                      }).format(
                        Number(
                          formatEther(
                            BigInt(
                              (event as FlowDistributionUpdatedEvent)
                                .oldFlowRate,
                            ) * BigInt(SECONDS_IN_MONTH),
                          ),
                        ),
                      )}{" "}
                      {token.name}/mo to{" "}
                      {Intl.NumberFormat("en", {
                        maximumFractionDigits: 4,
                      }).format(
                        Number(
                          formatEther(
                            BigInt(
                              (event as FlowDistributionUpdatedEvent)
                                .newDistributorToPoolFlowRate,
                            ) * BigInt(SECONDS_IN_MONTH),
                          ),
                        ),
                      )}{" "}
                      {token.name}/mo
                    </>
                  )}
                </p>
                <Link
                  href={`${network.blockExplorer}/tx/${(event as FlowDistributionUpdatedEvent).transactionHash}`}
                  target="_blank"
                  className="text-info"
                >
                  {new Date(Number(event.timestamp) * 1000).toLocaleString(
                    "en-US",
                    {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "numeric",
                    },
                  )}
                </Link>
              </Stack>
            </Stack>
          );
        }

        if (event.__typename === "InstantDistributionUpdatedEvent") {
          return (
            <Stack direction="horizontal" gap={2} key={i}>
              <span
                style={{
                  width: isMobile ? 36 : 24,
                  height: isMobile ? 36 : 24,
                }}
              >
                <Jazzicon
                  paperStyles={{ border: "1px solid black" }}
                  diameter={isMobile ? 36 : 24}
                  seed={jsNumberForAddress(
                    (event as InstantDistributionUpdatedEvent).poolDistributor
                      .account.id,
                  )}
                />
              </span>
              <Stack
                direction={isMobile ? "vertical" : "horizontal"}
                className="w-100 justify-content-between"
              >
                <p className="m-0">
                  <Link
                    href={`${network.blockExplorer}/address/${(event as FlowDistributionUpdatedEvent).poolDistributor.account.id}`}
                    target="_blank"
                  >
                    {truncateStr(
                      (event as InstantDistributionUpdatedEvent).poolDistributor
                        .account.id,
                      15,
                    )}
                  </Link>{" "}
                  instantly distributed{" "}
                  {Intl.NumberFormat("en", {
                    maximumFractionDigits: 4,
                  }).format(
                    Number(
                      formatEther(
                        BigInt(
                          (event as InstantDistributionUpdatedEvent)
                            .requestedAmount,
                        ),
                      ),
                    ),
                  )}{" "}
                  {token.name}
                </p>
                <Link
                  href={`${network.blockExplorer}/tx/${(event as InstantDistributionUpdatedEvent).transactionHash}`}
                  target="_blank"
                  className="text-info"
                >
                  {new Date(Number(event.timestamp) * 1000).toLocaleString(
                    "en-US",
                    {
                      month: "short",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "numeric",
                    },
                  )}
                </Link>
              </Stack>
            </Stack>
          );
        }

        return null;
      })}
    </Stack>
  );
}
