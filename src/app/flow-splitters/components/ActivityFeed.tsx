import { useMemo } from "react";
import { Address } from "viem";
import Link from "next/link";
import { formatEther } from "viem";
import Stack from "react-bootstrap/Stack";
import Image from "react-bootstrap/Image";
import Jazzicon, { jsNumberForAddress } from "react-jazzicon";
import { Network } from "@/types/network";
import { Token } from "@/types/token";
import { truncateStr } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { formatNumber } from "@/lib/utils";
import { SECONDS_IN_MONTH } from "@/lib/constants";

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
  ensByAddress: {
    [key: Address]: { name: string | null; avatar: string | null };
  } | null;
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
    ensByAddress,
  } = props;
  const { isMobile, isTablet } = useMediaQuery();

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
      className="mt-6 mt-sm-10 lh-sm bg-lace-100 px-8 py-4 rounded-4 overflow-auto"
      style={{
        maxHeight: 600,
      }}
    >
      <p className="m-0 fs-4 fw-semi-bold">Recent Activity</p>
      {events.map((event, i) => {
        if (event.__typename === "PoolCreationMemberUnitsUpdates") {
          return (
            <Stack direction="vertical" gap={2} key={i}>
              <Stack direction="horizontal" gap={2}>
                <span
                  style={{
                    width: isMobile || isTablet ? 36 : 24,
                    height: isMobile || isTablet ? 36 : 24,
                  }}
                >
                  <Jazzicon
                    paperStyles={{ border: "1px solid black" }}
                    diameter={isMobile || isTablet ? 36 : 24}
                    seed={jsNumberForAddress(poolAddress)}
                  />
                </span>
                <Stack
                  direction={isMobile || isTablet ? "vertical" : "horizontal"}
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
                    {ensByAddress?.[
                      memberUnitsUpdatedEvent.poolMember.account.id
                    ]?.avatar ? (
                      <Image
                        src={
                          ensByAddress?.[
                            memberUnitsUpdatedEvent.poolMember.account.id
                          ].avatar ?? ""
                        }
                        alt=""
                        width={isMobile || isTablet ? 36 : 24}
                        height={isMobile || isTablet ? 36 : 24}
                        className="rounded-circle align-self-center"
                      />
                    ) : (
                      <span style={{ width: 24, height: 24 }}>
                        <Jazzicon
                          paperStyles={{ border: "1px solid black" }}
                          diameter={24}
                          seed={jsNumberForAddress(
                            memberUnitsUpdatedEvent.poolMember.account.id,
                          )}
                        />
                      </span>
                    )}
                    <p className="m-0">
                      <Link
                        href={`${network.blockExplorer}/address/${memberUnitsUpdatedEvent.poolMember.account.id}`}
                        target="_blank"
                      >
                        {ensByAddress?.[
                          memberUnitsUpdatedEvent.poolMember.account.id
                        ]?.name ??
                          truncateStr(
                            memberUnitsUpdatedEvent.poolMember.account.id,
                            15,
                          )}
                      </Link>
                      : {formatNumber(Number(memberUnitsUpdatedEvent.units))}{" "}
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
                    width: isMobile || isTablet ? 36 : 24,
                    height: isMobile || isTablet ? 36 : 24,
                  }}
                >
                  <Jazzicon
                    paperStyles={{ border: "1px solid black" }}
                    diameter={isMobile || isTablet ? 36 : 24}
                    seed={jsNumberForAddress(poolAddress)}
                  />
                </span>
                <Stack
                  direction={isMobile || isTablet ? "vertical" : "horizontal"}
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
                    {ensByAddress?.[
                      memberUnitsUpdatedEvent.poolMember.account.id
                    ]?.avatar ? (
                      <Image
                        src={
                          ensByAddress?.[
                            memberUnitsUpdatedEvent.poolMember.account.id
                          ].avatar ?? ""
                        }
                        alt=""
                        width={24}
                        height={24}
                        className="rounded-circle align-self-center"
                      />
                    ) : (
                      <span style={{ width: 24, height: 24 }}>
                        <Jazzicon
                          paperStyles={{ border: "1px solid black" }}
                          diameter={24}
                          seed={jsNumberForAddress(
                            memberUnitsUpdatedEvent.poolMember.account.id,
                          )}
                        />
                      </span>
                    )}
                    <p className="m-0">
                      <Link
                        href={`${network.blockExplorer}/address/${memberUnitsUpdatedEvent.poolMember.account.id}`}
                        target="_blank"
                      >
                        {ensByAddress?.[
                          memberUnitsUpdatedEvent.poolMember.account.id
                        ]?.name ??
                          truncateStr(
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
                      {formatNumber(
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
              {ensByAddress?.[(event as PoolAdminAddedEvent).address as Address]
                ?.avatar ? (
                <Image
                  src={
                    ensByAddress?.[
                      (event as PoolAdminAddedEvent).address as Address
                    ].avatar ?? ""
                  }
                  alt=""
                  width={isMobile || isTablet ? 36 : 24}
                  height={isMobile || isTablet ? 36 : 24}
                  className="rounded-circle align-self-center"
                />
              ) : (
                <span
                  style={{
                    width: isMobile || isTablet ? 36 : 24,
                    height: isMobile || isTablet ? 36 : 24,
                  }}
                >
                  <Jazzicon
                    paperStyles={{ border: "1px solid black" }}
                    diameter={isMobile || isTablet ? 36 : 24}
                    seed={jsNumberForAddress(
                      (event as PoolAdminAddedEvent).address,
                    )}
                  />
                </span>
              )}
              <Stack
                direction={isMobile || isTablet ? "vertical" : "horizontal"}
                className="w-100 justify-content-between"
              >
                <p className="m-0">
                  <Link
                    href={`${network.blockExplorer}/address/${(event as PoolAdminAddedEvent).address}`}
                    target="_blank"
                  >
                    {ensByAddress?.[
                      (event as PoolAdminAddedEvent).address as Address
                    ]?.name ??
                      truncateStr((event as PoolAdminAddedEvent).address, 15)}
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
              {ensByAddress?.[
                (event as PoolAdminRemovedEvent).address as Address
              ]?.avatar ? (
                <Image
                  src={
                    ensByAddress?.[
                      (event as PoolAdminRemovedEvent).address as Address
                    ].avatar ?? ""
                  }
                  alt=""
                  width={isMobile || isTablet ? 36 : 24}
                  height={isMobile || isTablet ? 36 : 24}
                  className="rounded-circle align-self-center"
                />
              ) : (
                <span
                  style={{
                    width: isMobile || isTablet ? 36 : 24,
                    height: isMobile || isTablet ? 36 : 24,
                  }}
                >
                  <Jazzicon
                    paperStyles={{ border: "1px solid black" }}
                    diameter={isMobile || isTablet ? 36 : 24}
                    seed={jsNumberForAddress(
                      (event as PoolAdminRemovedEvent).address,
                    )}
                  />
                </span>
              )}
              <Stack
                direction={isMobile || isTablet ? "vertical" : "horizontal"}
                className="w-100 justify-content-between"
              >
                <p className="m-0">
                  <Link
                    href={`${network.blockExplorer}/address/${(event as PoolAdminRemovedEvent).address}`}
                    target="_blank"
                  >
                    {ensByAddress?.[
                      (event as PoolAdminRemovedEvent).address as Address
                    ]?.name ??
                      truncateStr((event as PoolAdminRemovedEvent).address, 15)}
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
              {ensByAddress?.[
                (event as FlowDistributionUpdatedEvent).poolDistributor.account
                  .id
              ]?.avatar ? (
                <Image
                  src={
                    ensByAddress?.[
                      (event as FlowDistributionUpdatedEvent).poolDistributor
                        .account.id
                    ].avatar ?? ""
                  }
                  alt=""
                  width={isMobile || isTablet ? 36 : 24}
                  height={isMobile || isTablet ? 36 : 24}
                  className="rounded-circle align-self-center"
                />
              ) : (
                <span
                  style={{
                    width: isMobile || isTablet ? 36 : 24,
                    height: isMobile || isTablet ? 36 : 24,
                  }}
                >
                  <Jazzicon
                    paperStyles={{ border: "1px solid black" }}
                    diameter={isMobile || isTablet ? 36 : 24}
                    seed={jsNumberForAddress(
                      (event as FlowDistributionUpdatedEvent).poolDistributor
                        .account.id,
                    )}
                  />
                </span>
              )}
              <Stack
                direction={isMobile || isTablet ? "vertical" : "horizontal"}
                className="w-100 justify-content-between"
              >
                <p className="m-0">
                  <Link
                    href={`${network.blockExplorer}/address/${(event as FlowDistributionUpdatedEvent).poolDistributor.account.id}`}
                    target="_blank"
                  >
                    {ensByAddress?.[
                      (event as FlowDistributionUpdatedEvent).poolDistributor
                        .account.id
                    ]?.name ??
                      truncateStr(
                        (event as FlowDistributionUpdatedEvent).poolDistributor
                          .account.id,
                        15,
                      )}
                  </Link>{" "}
                  {(event as FlowDistributionUpdatedEvent).oldFlowRate ===
                  "0" ? (
                    <>
                      opened a{" "}
                      {formatNumber(
                        Number(
                          formatEther(
                            BigInt(
                              (event as FlowDistributionUpdatedEvent)
                                .newDistributorToPoolFlowRate,
                            ) * BigInt(SECONDS_IN_MONTH),
                          ),
                        ),
                      )}{" "}
                      {token.symbol}/mo stream
                    </>
                  ) : (event as FlowDistributionUpdatedEvent)
                      .newDistributorToPoolFlowRate === "0" ? (
                    <>
                      closed a{" "}
                      {formatNumber(
                        Number(
                          formatEther(
                            BigInt(
                              (event as FlowDistributionUpdatedEvent)
                                .oldFlowRate,
                            ) * BigInt(SECONDS_IN_MONTH),
                          ),
                        ),
                      )}{" "}
                      {token.symbol}/mo stream.
                    </>
                  ) : (
                    <>
                      updated a stream from{" "}
                      {formatNumber(
                        Number(
                          formatEther(
                            BigInt(
                              (event as FlowDistributionUpdatedEvent)
                                .oldFlowRate,
                            ) * BigInt(SECONDS_IN_MONTH),
                          ),
                        ),
                      )}{" "}
                      {token.symbol}/mo to{" "}
                      {formatNumber(
                        Number(
                          formatEther(
                            BigInt(
                              (event as FlowDistributionUpdatedEvent)
                                .newDistributorToPoolFlowRate,
                            ) * BigInt(SECONDS_IN_MONTH),
                          ),
                        ),
                      )}{" "}
                      {token.symbol}/mo
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
              {ensByAddress?.[
                (event as InstantDistributionUpdatedEvent).poolDistributor
                  .account.id
              ]?.avatar ? (
                <Image
                  src={
                    ensByAddress?.[
                      (event as InstantDistributionUpdatedEvent).poolDistributor
                        .account.id
                    ].avatar ?? ""
                  }
                  alt=""
                  width={isMobile || isTablet ? 36 : 24}
                  height={isMobile || isTablet ? 36 : 24}
                  className="rounded-circle align-self-center"
                />
              ) : (
                <span
                  style={{
                    width: isMobile || isTablet ? 36 : 24,
                    height: isMobile || isTablet ? 36 : 24,
                  }}
                >
                  <Jazzicon
                    paperStyles={{ border: "1px solid black" }}
                    diameter={isMobile || isTablet ? 36 : 24}
                    seed={jsNumberForAddress(
                      (event as InstantDistributionUpdatedEvent).poolDistributor
                        .account.id,
                    )}
                  />
                </span>
              )}
              <Stack
                direction={isMobile || isTablet ? "vertical" : "horizontal"}
                className="w-100 justify-content-between"
              >
                <p className="m-0">
                  <Link
                    href={`${network.blockExplorer}/address/${(event as FlowDistributionUpdatedEvent).poolDistributor.account.id}`}
                    target="_blank"
                  >
                    {ensByAddress?.[
                      (event as InstantDistributionUpdatedEvent).poolDistributor
                        .account.id
                    ]?.name ??
                      truncateStr(
                        (event as InstantDistributionUpdatedEvent)
                          .poolDistributor.account.id,
                        15,
                      )}
                  </Link>{" "}
                  instantly distributed{" "}
                  {formatNumber(
                    Number(
                      formatEther(
                        BigInt(
                          (event as InstantDistributionUpdatedEvent)
                            .requestedAmount,
                        ),
                      ),
                    ),
                  )}{" "}
                  {token.symbol}
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
