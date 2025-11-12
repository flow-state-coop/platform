"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Address, isAddress } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Toast from "react-bootstrap/Toast";
import Spinner from "react-bootstrap/Spinner";
import Card from "react-bootstrap/Card";
import Alert from "react-bootstrap/Alert";
import Sidebar from "../components/Sidebar";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { getApolloClient } from "@/lib/apollo";
import { councilAbi } from "@/lib/abi/council";

type PermissionsProps = { chainId?: number; councilId?: string };
type ManagerEntry = {
  address: string;
  defaultAdminRole: boolean;
  memberManagerRole: boolean;
  granteeManagerRole: boolean;
  addressValidationError: string;
};

enum StatusChange {
  ADDED,
  REMOVED,
}

const COUNCIL_QUERY = gql`
  query CouncilQuery($councilId: String!) {
    council(id: $councilId) {
      id
      councilManagers {
        account
        role
      }
    }
  }
`;

const DEFAULT_ADMIN_ROLE: `0x${string}` =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const MEMBER_MANAGER_ROLE: `0x${string}` =
  "0x39a11a76752780db927c2506d127ab4a6504bb58ada87ac478aec1ffe9c2521b";
const GRANTEE_MANAGER_ROLE: `0x${string}` =
  "0x449c4ab7d231ca4b7e4b5e8022289a1d588fa1af9c09d2603681d5a375186c50";

export default function Permissions(props: PermissionsProps) {
  const { chainId, councilId } = props;

  const [transactionError, setTransactionError] = useState("");
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [isTransactionLoading, setIsTransactionLoading] = useState(false);
  const [managersEntry, setManagersEntry] = useState<ManagerEntry[]>([]);

  const router = useRouter();
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const { isMobile } = useMediaQuery();
  const { address, chain: connectedChain } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: councilQueryRes, loading: councilQueryResLoading } = useQuery(
    COUNCIL_QUERY,
    {
      client: getApolloClient("flowCouncil", chainId),
      variables: {
        chainId,
        councilId: councilId?.toLowerCase(),
      },
      skip: !councilId,
      pollInterval: 4000,
    },
  );

  const council = councilQueryRes?.council ?? null;
  const isValidManagersEntry = managersEntry.every(
    (managerEntry) => managerEntry.addressValidationError === "",
  );
  const isAdmin = useMemo(() => {
    const councilAdmin = council?.councilManagers.find(
      (m: { account: string; role: string }) =>
        m.account === address?.toLowerCase() && m.role === DEFAULT_ADMIN_ROLE,
    );

    if (councilAdmin) {
      return true;
    }

    return false;
  }, [address, council]);

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

      const existingDefaultAdmin = council?.councilManagers.find(
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

      const existingMemberManager = council?.councilManagers.find(
        (m: { account: string; role: string }) =>
          m.account === managerEntry.address.toLowerCase() &&
          m.role === MEMBER_MANAGER_ROLE,
      );

      if (existingMemberManager) {
        if (!managerEntry.memberManagerRole) {
          changedEntries.push({
            account: managerEntry.address as Address,
            role: MEMBER_MANAGER_ROLE,
            status: StatusChange.REMOVED,
          });
        }
      } else if (managerEntry.memberManagerRole) {
        changedEntries.push({
          account: managerEntry.address as Address,
          role: MEMBER_MANAGER_ROLE,
          status: StatusChange.ADDED,
        });
      }

      const existingGranteeManager = council?.councilManagers.find(
        (m: { account: string; role: string }) =>
          m.account === managerEntry.address.toLowerCase() &&
          m.role === GRANTEE_MANAGER_ROLE,
      );

      if (existingGranteeManager) {
        if (!managerEntry.granteeManagerRole) {
          changedEntries.push({
            account: managerEntry.address as Address,
            role: GRANTEE_MANAGER_ROLE,
            status: StatusChange.REMOVED,
          });
        }
      } else if (managerEntry.granteeManagerRole) {
        changedEntries.push({
          account: managerEntry.address as Address,
          role: GRANTEE_MANAGER_ROLE,
          status: StatusChange.ADDED,
        });
      }

      return changedEntries;
    },
    [council],
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
    const defaultAdmins = council?.councilManagers.filter(
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
  }, [council, managersEntry, findChangedEntry]);

  useEffect(() => {
    (async () => {
      if (!council) {
        return;
      }

      const managersEntry = [];

      for (const i in council.councilManagers) {
        if (
          managersEntry
            .map((managerEntry) => managerEntry.address)
            .includes(council.councilManagers[i].account)
        ) {
          continue;
        }

        const roles = council.councilManagers
          .filter(
            (manager: { account: string }) =>
              manager.account === council.councilManagers[i].account,
          )
          .map((manager: { role: string }) => manager.role);
        const isDefaultAdmin = roles.includes(DEFAULT_ADMIN_ROLE);
        const isMemberManager = roles.includes(MEMBER_MANAGER_ROLE);
        const isGranteeManager = roles.includes(GRANTEE_MANAGER_ROLE);

        managersEntry.push({
          address: council.councilManagers[i].account,
          defaultAdminRole: isDefaultAdmin,
          memberManagerRole: isMemberManager,
          granteeManagerRole: isGranteeManager,
          addressValidationError: "",
        });
      }

      setManagersEntry(managersEntry);
    })();
  }, [council]);

  const handleSubmit = async () => {
    if (!address || !publicClient || !councilId) {
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
        abi: councilAbi,
        functionName: "updateCouncilManagers",
        args: [changedEntries],
      });

      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 3,
      });

      setTransactionSuccess(true);
      setIsTransactionLoading(false);
    } catch (err) {
      console.error(err);

      setTransactionError("Transaction Error");
      setIsTransactionLoading(false);
    }
  };

  if (!councilId || !chainId || (!councilQueryResLoading && !council)) {
    return (
      <span className="m-auto fs-5 fw-bold">
        Council not found.{" "}
        <Link
          href="/gooddollar/admin"
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
            <Card.Text className="fs-6 text-info">
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
              <span className="w-50" />
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
                  Member Review
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
                <Stack direction="vertical" className="position-relative w-50">
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
                        prev[i].memberManagerRole =
                          checked ?? prev[i].memberManagerRole;
                        prev[i].granteeManagerRole =
                          checked ?? prev[i].granteeManagerRole;

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
                        !!managerEntry.memberManagerRole
                      }
                      className="m-0"
                      style={{ padding: 12 }}
                      onChange={(e) => {
                        const { checked } = e.target;

                        const prev = [...managersEntry];

                        prev[i].memberManagerRole =
                          checked ?? prev[i].memberManagerRole;

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
                        !!managerEntry.granteeManagerRole
                      }
                      disabled={!isAdmin || !!managerEntry.defaultAdminRole}
                      className="m-0"
                      style={{ padding: 12 }}
                      onChange={(e) => {
                        const { checked } = e.target;

                        const prev = [...managersEntry];

                        prev[i].granteeManagerRole =
                          checked ?? prev[i].granteeManagerRole;

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
                        granteeManagerRole: false,
                        memberManagerRole: false,
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
        <Stack direction="vertical" gap={3} className="mt-4 mb-30">
          <Button
            disabled={!isAdmin || !hasChanges || !isValidManagersEntry}
            className="py-4 rounded-4 fs-lg fw-semi-bold"
            onClick={() => {
              !address && openConnectModal
                ? openConnectModal()
                : connectedChain?.id !== chainId
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
          <Button
            variant="secondary"
            className="py-4 rounded-4 fs-lg fw-semi-bold"
            style={{ pointerEvents: isTransactionLoading ? "none" : "auto" }}
            onClick={() =>
              router.push(`/gooddollar/membership/?chainId=${chainId}`)
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
