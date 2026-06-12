"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Address, isAddress } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import useSiwe from "@/hooks/siwe";
import { useEnsResolution } from "@/hooks/useEnsResolution";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Toast from "react-bootstrap/Toast";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import { waitForReceipt } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import {
  DEFAULT_ADMIN_ROLE,
  VOTER_MANAGER_ROLE,
  RECIPIENT_MANAGER_ROLE,
  FLOW_STATE_BOT_ADDRESS,
  KNOWN_ADDRESS_NAMES,
} from "../lib/constants";

type PermissionsProps = {
  chainId?: number;
  councilId?: string;
};
type ManagerEntry = {
  address: string;
  defaultAdminRole: boolean;
  voterManagerRole: boolean;
  recipientManagerRole: boolean;
  addressValidationError: string;
};

enum StatusChange {
  ADDED,
  REMOVED,
}

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
      flowCouncilManagers {
        account
        role
      }
    }
  }
`;

export default function Permissions(props: PermissionsProps) {
  const { chainId, councilId } = props;

  const [transactionError, setTransactionError] = useState("");
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [managersEntry, setManagersEntry] = useState<ManagerEntry[]>([]);
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();

  const needsSignIn = !session || session.address !== address;
  const { data: flowCouncilQueryRes, loading: flowCouncilQueryResLoading } =
    useQuery(FLOW_COUNCIL_QUERY, {
      client: getApolloClient("flowCouncil", chainId),
      variables: {
        chainId,
        councilId: councilId?.toLowerCase(),
      },
      skip: !councilId,
      pollInterval: 4000,
    });

  const flowCouncil = flowCouncilQueryRes?.flowCouncil ?? null;
  const isValidManagersEntry = managersEntry.every(
    (managerEntry) => managerEntry.addressValidationError === "",
  );
  const isAdmin = useMemo(() => {
    const flowCouncilAdmin = flowCouncil?.flowCouncilManagers.find(
      (m: { account: string; role: string }) =>
        m.account === address?.toLowerCase() && m.role === DEFAULT_ADMIN_ROLE,
    );

    if (flowCouncilAdmin) {
      return true;
    }

    return false;
  }, [address, flowCouncil]);

  const findChangedEntry = useCallback(
    (managerEntry: ManagerEntry) => {
      const changedEntries: {
        account: Address;
        role: `0x${string}`;
        status: StatusChange;
      }[] = [];

      if (!managerEntry.address) {
        return changedEntries;
      }

      const existingDefaultAdmin = flowCouncil?.flowCouncilManagers.find(
        (m: { account: string; role: string }) =>
          m.account === managerEntry.address.toLowerCase() &&
          m.role === DEFAULT_ADMIN_ROLE,
      );

      if (existingDefaultAdmin) {
        if (!managerEntry.defaultAdminRole) {
          changedEntries.push({
            account: managerEntry.address as Address,
            role: DEFAULT_ADMIN_ROLE,
            status: StatusChange.REMOVED,
          });
        }
      } else if (managerEntry.defaultAdminRole) {
        changedEntries.push({
          account: managerEntry.address as Address,
          role: DEFAULT_ADMIN_ROLE,
          status: StatusChange.ADDED,
        });
      }

      const existingVoterManager = flowCouncil?.flowCouncilManagers.find(
        (m: { account: string; role: string }) =>
          m.account === managerEntry.address.toLowerCase() &&
          m.role === VOTER_MANAGER_ROLE,
      );

      if (existingVoterManager) {
        if (!managerEntry.voterManagerRole) {
          changedEntries.push({
            account: managerEntry.address as Address,
            role: VOTER_MANAGER_ROLE,
            status: StatusChange.REMOVED,
          });
        }
      } else if (managerEntry.voterManagerRole) {
        changedEntries.push({
          account: managerEntry.address as Address,
          role: VOTER_MANAGER_ROLE,
          status: StatusChange.ADDED,
        });
      }

      const existingRecipientManager = flowCouncil?.flowCouncilManagers.find(
        (m: { account: string; role: string }) =>
          m.account === managerEntry.address.toLowerCase() &&
          m.role === RECIPIENT_MANAGER_ROLE,
      );

      if (existingRecipientManager) {
        if (!managerEntry.recipientManagerRole) {
          changedEntries.push({
            account: managerEntry.address as Address,
            role: RECIPIENT_MANAGER_ROLE,
            status: StatusChange.REMOVED,
          });
        }
      } else if (managerEntry.recipientManagerRole) {
        changedEntries.push({
          account: managerEntry.address as Address,
          role: RECIPIENT_MANAGER_ROLE,
          status: StatusChange.ADDED,
        });
      }

      return changedEntries;
    },
    [flowCouncil],
  );

  const hasChanges = useMemo(() => {
    for (const managerEntry of managersEntry) {
      const changedEntries = findChangedEntry(managerEntry);

      if (changedEntries.length > 0) {
        return true;
      }
    }

    return false;
  }, [managersEntry, findChangedEntry]);

  const isRemovingOnlySuperAdmin = useMemo(() => {
    const defaultAdmins = flowCouncil?.flowCouncilManagers.filter(
      (m: { role: `0x${string}` }) => m.role === DEFAULT_ADMIN_ROLE,
    );

    if (defaultAdmins?.length === 1) {
      for (const managerEntry of managersEntry) {
        const changedEntries = findChangedEntry(managerEntry);

        if (
          changedEntries.find(
            (c) =>
              c.role === DEFAULT_ADMIN_ROLE &&
              c.status === StatusChange.REMOVED,
          )
        ) {
          return true;
        }
      }
    }

    return false;
  }, [flowCouncil, managersEntry, findChangedEntry]);

  const isRemovingBotVoterManager = useMemo(() => {
    for (const managerEntry of managersEntry) {
      const changedEntries = findChangedEntry(managerEntry);

      if (
        changedEntries.find(
          (c) =>
            c.account.toLowerCase() === FLOW_STATE_BOT_ADDRESS.toLowerCase() &&
            c.role === VOTER_MANAGER_ROLE &&
            c.status === StatusChange.REMOVED,
        )
      ) {
        return true;
      }
    }

    return false;
  }, [managersEntry, findChangedEntry]);

  // Joined-string key: managersEntry gets a new identity on every keystroke,
  // so name lookups gate on the stable key instead of the array.
  const managerAddressKey = useMemo(
    () =>
      [
        ...new Set(
          managersEntry
            .map((managerEntry) => managerEntry.address.trim().toLowerCase())
            .filter((managerAddress) => isAddress(managerAddress)),
        ),
      ]
        .sort()
        .join(","),
    [managersEntry],
  );
  const managerAddresses = useMemo(
    () => (managerAddressKey === "" ? [] : managerAddressKey.split(",")),
    [managerAddressKey],
  );

  const { ensByAddress } = useEnsResolution(managerAddresses);

  useEffect(() => {
    if (managerAddresses.length === 0) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/flow-council/voter-groups/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: managerAddresses }),
        });
        const data = await res.json();

        if (cancelled || !data.success || !data.names) {
          return;
        }

        const names: Record<string, string> = {};

        for (const [managerAddress, name] of Object.entries(
          data.names as Record<string, string>,
        )) {
          names[managerAddress.toLowerCase()] = name;
        }

        setProfileNames(names);
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [managerAddresses]);

  const managerDisplayName = (managerAddress: string) => {
    const account = managerAddress.trim().toLowerCase();

    return (
      KNOWN_ADDRESS_NAMES[account] ??
      profileNames[account] ??
      ensByAddress?.[account]?.name ??
      ""
    );
  };

  useEffect(() => {
    (async () => {
      if (!flowCouncil) {
        return;
      }

      const managersEntry = [];

      for (const i in flowCouncil.flowCouncilManagers) {
        if (
          managersEntry
            .map((managerEntry) => managerEntry.address)
            .includes(flowCouncil.flowCouncilManagers[i].account)
        ) {
          continue;
        }

        const roles = flowCouncil.flowCouncilManagers
          .filter(
            (manager: { account: string }) =>
              manager.account === flowCouncil.flowCouncilManagers[i].account,
          )
          .map((manager: { role: string }) => manager.role);
        const isDefaultAdmin = roles.includes(DEFAULT_ADMIN_ROLE);
        const isVoterManager = roles.includes(VOTER_MANAGER_ROLE);
        const isRecipientManager = roles.includes(RECIPIENT_MANAGER_ROLE);

        managersEntry.push({
          address: flowCouncil.flowCouncilManagers[i].account,
          defaultAdminRole: isDefaultAdmin,
          voterManagerRole: isVoterManager,
          recipientManagerRole: isRecipientManager,
          addressValidationError: "",
        });
      }

      setManagersEntry(managersEntry);
    })();
  }, [flowCouncil]);

  const handleSubmit = async () => {
    if (!address || !publicClient || !councilId || !chainId) {
      return;
    }

    try {
      setTransactionError("");
      setIsTransactionLoading(true);

      const changedEntries = [];

      for (const managerEntry of managersEntry) {
        changedEntries.push(...findChangedEntry(managerEntry));
      }

      const hash = await writeContract(wagmiConfig, {
        address: councilId as Address,
        abi: flowCouncilAbi,
        functionName: "updateManagers",
        args: [changedEntries],
      });

      await waitForReceipt(publicClient, hash);

      const superAdmins = managersEntry
        .filter((m) => m.defaultAdminRole && m.address)
        .map((m) => m.address.toLowerCase());

      const previousSuperAdmins =
        flowCouncil?.flowCouncilManagers
          .filter((m: { role: string }) => m.role === DEFAULT_ADMIN_ROLE)
          .map((m: { account: string }) => m.account.toLowerCase()) ?? [];

      const removedAdmins = previousSuperAdmins.filter(
        (addr: string) => !superAdmins.includes(addr),
      );

      await fetch("/api/flow-council/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chainId,
          flowCouncilAddress: councilId,
          admins: superAdmins,
        }),
      });

      if (removedAdmins.length > 0) {
        await fetch("/api/flow-council/admins", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId,
            flowCouncilAddress: councilId,
            admins: removedAdmins,
          }),
        });
      }

      setTransactionSuccess(true);
      setIsTransactionLoading(false);
    } catch (err) {
      console.error(err);

      setTransactionError("Transaction Error");
      setIsTransactionLoading(false);
    }
  };

  if (!councilId || !chainId || (!flowCouncilQueryResLoading && !flowCouncil)) {
    return (
      <span className="m-auto fs-5 fw-bold">
        Council not found.{" "}
        <Link
          href="/flow-councils/launch"
          className="text-primary text-decoration-none"
        >
          Launch one
        </Link>
      </span>
    );
  }

  return (
    <>
      <Sidebar />
      <Stack
        direction="vertical"
        className={!isMobile ? "w-75 px-5" : "w-100 px-4"}
      >
        <Card className="bg-lace-100 rounded-4 border-0 p-4">
          <Card.Header className="bg-transparent border-0 rounded-4 p-0">
            <Card.Title className="fs-5 fw-semi-bold">
              Council Permissions
            </Card.Title>
            <Card.Text className="text-info">
              {isAdmin
                ? "Manage privileged roles on your Flow Council (optional)"
                : "(Read only—check your connected wallet's permissions to make changes)"}
            </Card.Text>
          </Card.Header>
          <Card.Body className="p-0 mt-4">
            <Stack
              direction="horizontal"
              gap={isMobile ? 2 : 4}
              className="justify-content-end align-items-center"
            >
              <span
                className="flex-grow-1"
                style={{ maxWidth: isMobile ? undefined : 460 }}
              />
              <span
                style={
                  isMobile
                    ? { width: 90, flexShrink: 0 }
                    : { flex: "1 1 180px", minWidth: 0 }
                }
              />
              <Stack direction="horizontal" gap={2}>
                <Card.Text
                  className="m-0 text-center flex-shrink-0"
                  style={{
                    width: isMobile ? 52 : 70,
                    fontSize: isMobile ? "0.7rem" : "inherit",
                  }}
                >
                  Super Admin
                </Card.Text>
                <Card.Text
                  className="m-0 text-center flex-shrink-0"
                  style={{
                    width: isMobile ? 52 : 70,
                    fontSize: isMobile ? "0.7rem" : "inherit",
                  }}
                >
                  Voter Review
                </Card.Text>
                <Card.Text
                  className="m-0 text-center flex-shrink-0"
                  style={{
                    width: isMobile ? 52 : 70,
                    fontSize: isMobile ? "0.7rem" : "inherit",
                  }}
                >
                  Recipient Review
                </Card.Text>
              </Stack>
            </Stack>
            {managersEntry.map((managerEntry, i) => (
              <Stack
                direction="horizontal"
                gap={isMobile ? 2 : 4}
                className="justify-content-end align-items-center mt-1 mb-3"
                key={i}
              >
                <Stack
                  direction="vertical"
                  className="position-relative flex-grow-1"
                  style={{ minWidth: 0, maxWidth: isMobile ? undefined : 460 }}
                >
                  <Form.Control
                    type="text"
                    disabled={!isAdmin}
                    placeholder="Manager Address"
                    value={managerEntry.address}
                    className="border-0 bg-white py-4 rounded-4 fw-semi-bold"
                    style={{
                      paddingTop: 12,
                      paddingBottom: 12,
                    }}
                    onChange={(e) => {
                      const prevManagersEntry = [...managersEntry];
                      const value = e.target.value;

                      if (value && !isAddress(value)) {
                        prevManagersEntry[i].addressValidationError =
                          "Invalid Address";
                      } else if (
                        value &&
                        prevManagersEntry
                          .map((prevManager) =>
                            prevManager.address.toLowerCase(),
                          )
                          .includes(value.toLowerCase())
                      ) {
                        prevManagersEntry[i].addressValidationError =
                          "Address already added";
                      } else {
                        prevManagersEntry[i].addressValidationError = "";
                      }

                      prevManagersEntry[i].address = value;

                      setManagersEntry(prevManagersEntry);
                    }}
                  />
                  {managerEntry.addressValidationError ? (
                    <Card.Text
                      className="position-absolute mt-1 mb-0 ms-2 ps-1 text-danger"
                      style={{ bottom: 1, fontSize: "0.7rem" }}
                    >
                      {managerEntry.addressValidationError}
                    </Card.Text>
                  ) : null}
                </Stack>
                <Form.Control
                  type="text"
                  disabled
                  placeholder="Name"
                  value={managerDisplayName(managerEntry.address)}
                  className="border-0 bg-white rounded-4 fw-semi-bold"
                  style={{
                    ...(isMobile
                      ? { width: 90, flexShrink: 0 }
                      : { flex: "1 1 180px", minWidth: 0 }),
                    paddingTop: 12,
                    paddingBottom: 12,
                  }}
                />
                <Stack direction="horizontal" gap={2}>
                  <Form.Check
                    className="d-flex justify-content-center"
                    style={{
                      width: isMobile ? 50 : 70,
                    }}
                  >
                    <Form.Check.Input
                      className="m-0"
                      disabled={!isAdmin}
                      style={{ padding: 12 }}
                      checked={!!managerEntry.defaultAdminRole}
                      onChange={(e) => {
                        const { checked } = e.target;

                        const prev = [...managersEntry];

                        prev[i].defaultAdminRole = checked;
                        prev[i].voterManagerRole =
                          checked ?? prev[i].voterManagerRole;
                        prev[i].recipientManagerRole =
                          checked ?? prev[i].recipientManagerRole;

                        setManagersEntry(prev);
                      }}
                    />
                  </Form.Check>
                  <Form.Check
                    className="d-flex justify-content-center"
                    style={{
                      width: isMobile ? 50 : 70,
                    }}
                  >
                    <Form.Check.Input
                      disabled={!isAdmin || !!managerEntry.defaultAdminRole}
                      checked={
                        !!managerEntry.defaultAdminRole ||
                        !!managerEntry.voterManagerRole
                      }
                      className="m-0"
                      style={{ padding: 12 }}
                      onChange={(e) => {
                        const { checked } = e.target;

                        const prev = [...managersEntry];

                        prev[i].voterManagerRole =
                          checked ?? prev[i].voterManagerRole;

                        setManagersEntry(prev);
                      }}
                    />
                  </Form.Check>
                  <Form.Check
                    className="d-flex justify-content-center"
                    style={{
                      width: isMobile ? 50 : 70,
                    }}
                  >
                    <Form.Check.Input
                      checked={
                        !!managerEntry.defaultAdminRole ||
                        !!managerEntry.recipientManagerRole
                      }
                      disabled={!isAdmin || !!managerEntry.defaultAdminRole}
                      className="m-0"
                      style={{ padding: 12 }}
                      onChange={(e) => {
                        const { checked } = e.target;

                        const prev = [...managersEntry];

                        prev[i].recipientManagerRole =
                          checked ?? prev[i].recipientManagerRole;

                        setManagersEntry(prev);
                      }}
                    />
                  </Form.Check>
                </Stack>
              </Stack>
            ))}
            {isAdmin && (
              <Stack direction="horizontal" gap={isMobile ? 2 : 4}>
                <Button
                  variant="transparent"
                  className="d-flex align-items-center w-100 p-0 text-primary text-decoration-underline fw-semi-bold"
                  onClick={() =>
                    setManagersEntry((prev) =>
                      prev.concat({
                        address: "",
                        defaultAdminRole: false,
                        voterManagerRole: false,
                        recipientManagerRole: false,
                        addressValidationError: "",
                      }),
                    )
                  }
                >
                  <Card.Text className="mb-0">
                    {isMobile ? "Add member" : "Add another admin"}
                  </Card.Text>
                </Button>
              </Stack>
            )}
          </Card.Body>
        </Card>
        {isRemovingOnlySuperAdmin && (
          <Card.Text className="text-danger mt-4 mb-0">
            Warning: You've removed your only SuperAdmin. If you proceed, you
            won't be able to make any further changes to permissions
          </Card.Text>
        )}
        {isRemovingBotVoterManager && (
          <Card.Text className="text-danger mt-4 mb-0">
            You have an active automated voter eligibility method. Removing this
            address will cause this to stop working.
          </Card.Text>
        )}
        <Stack direction="vertical" gap={3} className="mt-4 mb-30">
          {needsSignIn ? (
            <Button
              className="py-4 rounded-4 fs-lg fw-semi-bold"
              onClick={() => {
                if (!address && openConnectModal) {
                  openConnectModal();
                } else if (connectedChain?.id !== chainId) {
                  switchChain({ chainId: chainId! });
                } else {
                  handleSignIn();
                }
              }}
            >
              {!address
                ? "Connect Wallet"
                : connectedChain?.id !== chainId
                  ? "Switch Network"
                  : "Sign In With Ethereum"}
            </Button>
          ) : (
            <Button
              disabled={!isAdmin || !hasChanges || !isValidManagersEntry}
              className="py-4 rounded-4 fs-lg fw-semi-bold"
              onClick={() => {
                connectedChain?.id !== chainId
                  ? switchChain({ chainId })
                  : handleSubmit();
              }}
            >
              {isTransactionLoading ? (
                <Spinner size="sm" className="ms-2" />
              ) : (
                "Submit"
              )}
            </Button>
          )}
          <Button
            variant="secondary"
            className="py-4 rounded-4 fs-lg fw-semi-bold"
            style={{ pointerEvents: isTransactionLoading ? "none" : "auto" }}
            onClick={() =>
              router.push(`/flow-councils/form-builder/${chainId}/${councilId}`)
            }
          >
            Next
          </Button>
          <Toast
            show={transactionSuccess}
            delay={4000}
            autohide={true}
            onClose={() => setTransactionSuccess(false)}
            className="w-100 bg-success p-4 fw-semi-bold fs-6 text-white"
          >
            Success!
          </Toast>
          {transactionError ? (
            <Alert
              variant="danger"
              className="w-100 mb-4 p-4 fw-semi-bold text-danger"
            >
              {transactionError}
            </Alert>
          ) : null}
        </Stack>
      </Stack>
    </>
  );
}
