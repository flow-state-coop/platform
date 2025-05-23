"use client";

import { useState } from "react";
import Link from "next/link";
import { base } from "viem/chains";
import { useQuery, gql } from "@apollo/client";
import Container from "react-bootstrap/Container";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Alert from "react-bootstrap/Alert";
import Spinner from "react-bootstrap/Spinner";
import Toast from "react-bootstrap/Toast";
import RoundCard from "./components/RoundCard";
import { getApolloClient } from "@/lib/apollo";
import { useMediaQuery } from "@/hooks/mediaQuery";

const SQF_STREAM_QUERY = gql`
  query SQFQuery($gdaPool: String, $superapps: [String]) {
    pool(id: $gdaPool) {
      id
      flowRate
      totalAmountFlowedDistributedUntilUpdatedAt
      updatedAtTimestamp
    }
    accounts(where: { id_in: $superapps }) {
      id
      accountTokenSnapshots {
        totalAmountStreamedInUntilUpdatedAt
        updatedAtTimestamp
        totalInflowRate
      }
    }
  }
`;

const CORE_ROUND_QUERY = gql`
  query CoreRoundQuery($safeAddress: String, $token: String) {
    account(id: $safeAddress) {
      id
      accountTokenSnapshots(where: { token: $token }) {
        totalAmountStreamedInUntilUpdatedAt
        totalNetFlowRate
        updatedAtTimestamp
      }
    }
  }
`;

const SQF_ADDRESSES = {
  ["octant"]: {
    gdaPool: "0x8398c030be586c86759c4f1fc9f63df83c99813a",
    superApps: [
      "0x6e0c09d565debc9105efe51d892bda13967c32a6",
      "0x97491ffeaf4733f8cc8fd57d20c457ac3257d8aa",
      "0x6f5d20c798db69b5f0fac5a40998dd9c13be0a77",
      "0x312f110ca0077de3e51fccde0261fb59b9c8d942",
      "0x0f0b224b07655afa9239d76928399830e1fea8cf",
      "0xad69430421e41f570fe8a42a089a90b679ba4140",
      "0x297f7199c83fbb671b13d88d0cbf52b000d13de2",
      "0x81548f8eb73dcb288cc9d4de98db5cd6c5cfd61c",
      "0x1b50cea385649438c045642fab49e7f81abd7654",
      "0x9135a74b3d3cfde581379f686b7a9ee0464ac594",
      "0x8ad8b54f6a80c07afb6bf25596c59cdb9231ae5f",
      "0x04a229a85b29b25ef8c2c87e56d16a6c1fdf5f15",
      "0xb643e26381e75f1b3749ab9af01f9137bfb935be",
    ],
  },
};

const FLOW_GUILD_ADDRESSES = {
  ["core"]: {
    safe: "0x0d9d26375b882e0ddb38a781a40e80945e3d0b9b",
    token: "0x46fd5cfb4c12d87acd3a13e92baa53240c661d93",
  },
};

export default function Explore() {
  const { isMobile, isTablet, isSmallScreen, isMediumScreen, isBigScreen } =
    useMediaQuery();

  const [isSubscribing, setIsSubscribing] = useState(false);
  const [mailingListSubSuccess, setMailingListSubSuccess] = useState(false);
  const [mailingListSubError, setMailingListSubError] = useState("");
  const [validated, setValidated] = useState(false);

  const sfApolloClient = getApolloClient("superfluid", base.id);

  const { data: sqfStreamQueryRes } = useQuery(SQF_STREAM_QUERY, {
    client: sfApolloClient,
    variables: {
      gdaPool: SQF_ADDRESSES["octant"].gdaPool,
      superapps: SQF_ADDRESSES["octant"].superApps,
    },
    pollInterval: 10000,
  });
  const { data: coreRoundQueryRes } = useQuery(CORE_ROUND_QUERY, {
    client: sfApolloClient,
    variables: {
      safeAddress: FLOW_GUILD_ADDRESSES["core"].safe,
      token: FLOW_GUILD_ADDRESSES["core"].token,
    },
    pollInterval: 10000,
  });

  const handleMailingListSub = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const form = e.currentTarget;

    setIsSubscribing(true);
    setMailingListSubError("");
    setValidated(true);

    if (form.checkValidity() === true) {
      try {
        const res = await fetch("/api/mailinglist", {
          method: "POST",
          body: JSON.stringify({
            email: (form[0] as HTMLInputElement).value,
          }),
        });

        const data = await res.json();

        if (data.success) {
          setMailingListSubSuccess(true);
        } else {
          setMailingListSubError(data.message);
        }
      } catch (err) {
        console.error(err);
        setMailingListSubError("There was an error, please try again later");
      }
    }

    setIsSubscribing(false);
  };

  return (
    <Container
      className="mx-auto px-2 px-sm-4 mb-5"
      style={{
        maxWidth:
          isMobile || isTablet
            ? "100%"
            : isSmallScreen
              ? 1000
              : isMediumScreen
                ? 1300
                : 1600,
      }}
    >
      <h1 className="mt-5">Explore</h1>
      <h2 className="fs-4 mb-4">Active streaming funding campaigns</h2>
      <div
        className="pb-5"
        style={{
          display: "grid",
          columnGap: "1.5rem",
          rowGap: "3rem",
          gridTemplateColumns: isTablet
            ? "repeat(1,minmax(0,1fr))"
            : isSmallScreen
              ? "repeat(2,minmax(0,1fr))"
              : isMediumScreen
                ? "repeat(3,minmax(0,1fr))"
                : isBigScreen
                  ? "repeat(4,minmax(0,1fr))"
                  : "",
        }}
      >
        <RoundCard
          name="Core Contributors"
          image="/logo-circle.svg"
          roundType="Flow Guild"
          totalStreamedUntilUpdatedAt={
            coreRoundQueryRes?.account.accountTokenSnapshots[0]
              .totalAmountStreamedInUntilUpdatedAt
          }
          flowRate={
            coreRoundQueryRes?.account.accountTokenSnapshots[0].totalInflowRate
          }
          updatedAt={
            coreRoundQueryRes?.account.accountTokenSnapshots[0]
              .updatedAtTimestamp
          }
          tokenSymbol="ETHx"
          link="/core"
        />
        <RoundCard
          name="Octant Builder Accelerator"
          image="/octant-circle.svg"
          roundType="Streaming Quadratic Funding"
          totalStreamedUntilUpdatedAt={(
            BigInt(
              sqfStreamQueryRes?.pool
                .totalAmountFlowedDistributedUntilUpdatedAt ?? 0,
            ) +
            BigInt(
              sqfStreamQueryRes?.accounts
                .map(
                  (account: {
                    accountTokenSnapshots: {
                      totalAmountStreamedInUntilUpdatedAt: string;
                    }[];
                  }) =>
                    BigInt(
                      account.accountTokenSnapshots[0]
                        .totalAmountStreamedInUntilUpdatedAt,
                    ),
                )
                .reduce((a: bigint, b: bigint) => a + b) ?? 0,
            )
          ).toString()}
          flowRate={(
            BigInt(sqfStreamQueryRes?.pool.flowRate ?? 0) +
            BigInt(
              sqfStreamQueryRes?.accounts
                .map(
                  (account: {
                    accountTokenSnapshots: { totalInflowRate: string }[];
                  }) =>
                    BigInt(
                      account.accountTokenSnapshots[0].totalInflowRate ?? 0,
                    ),
                )
                .reduce((a: bigint, b: bigint) => a + b) ?? 0,
            )
          ).toString()}
          updatedAt={sqfStreamQueryRes?.pool.updatedAtTimestamp}
          tokenSymbol="ETHx"
          link="/octant"
        />
        <RoundCard
          name="GoodBuilders Program"
          image="/good-dollar.png"
          roundType="Flow Council"
          link="https://gooddollar.notion.site/GoodBuilders-Program-1a6f258232f080fea8a6e3760bb8f53d"
        />
        <RoundCard
          name="Guild Guild"
          image="/guild-guild.svg"
          roundType="Flow Guild"
          link="https://guildguild.xyz"
        />
        <RoundCard
          name="Greenpill Dev Guild"
          image="/greenpill.png"
          roundType="Flow Guild"
          link="https://app.charmverse.io/greenpill-dev-guild/"
        />
      </div>
      <p className="text-center">
        Launch your own{" "}
        <Link href="/sqf" className="text-primary">
          SQF
        </Link>{" "}
        or{" "}
        <Link href="/flow-splitters/launch" className="text-primary">
          Flow Splitter
        </Link>{" "}
        Campaign.{" "}
        <Link href="mailto:fund@flowstate.network" className="text-primary">
          Get in touch
        </Link>{" "}
        to become eligible for $SUP sponsorship or run a white-glove campaign.
      </p>
      <Stack direction="vertical" className="align-items-center my-5">
        <p className="mb-1 fs-4 fw-bold">Sign up for email updates</p>
        <p>
          Hear about our product launches, new funding campaigns, & more
          opportunities to earn $SUP first.
        </p>
        <Form
          noValidate
          validated={validated}
          className="w-50 mt-2"
          onSubmit={handleMailingListSub}
        >
          <Form.Group className="position-relative">
            <Stack direction={isMobile ? "vertical" : "horizontal"} gap={2}>
              <Form.Control type="email" required className="shadow-sm" />
              <Button type="submit" className="px-5">
                {isSubscribing ? <Spinner size="sm" /> : "Submit"}
              </Button>
            </Stack>
            <Form.Control.Feedback type="invalid">
              Please insert a valid email address
            </Form.Control.Feedback>
            <Toast
              show={mailingListSubSuccess}
              delay={4000}
              autohide={true}
              onClose={() => setMailingListSubSuccess(false)}
              className="position-absolute w-100 mt-2 bg-success px-3 py-2 fs-5 text-light"
            >
              Success!
            </Toast>
            {mailingListSubError ? (
              <Alert variant="danger" className="w-100 px-3 py-2 mt-2 mb-4">
                {mailingListSubError}
              </Alert>
            ) : null}
          </Form.Group>
        </Form>
      </Stack>
    </Container>
  );
}
