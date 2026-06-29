"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Address, encodeAbiParameters, encodeFunctionData } from "viem";
import { useConfig, useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { writeContract } from "@wagmi/core";
import { useSession } from "next-auth/react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { gql, useQuery } from "@apollo/client";
import { useQueryClient } from "@tanstack/react-query";
import Stack from "react-bootstrap/Stack";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Card from "react-bootstrap/Card";
import Toast from "react-bootstrap/Toast";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Spinner from "react-bootstrap/Spinner";
import Placeholder from "react-bootstrap/Placeholder";
import MarkdownEditor from "@/components/MarkdownEditor";
import Alert from "react-bootstrap/Alert";
import Table from "react-bootstrap/Table";
import { waitForReceipt } from "@/lib/utils";
import Badge from "react-bootstrap/Badge";
import Nav from "react-bootstrap/Nav";
import Tab from "react-bootstrap/Tab";
import Dropdown from "react-bootstrap/Dropdown";
import Sidebar from "@/app/flow-councils/components/Sidebar";
import CopyTooltip from "@/components/CopyTooltip";
import InfoTooltip from "@/components/InfoTooltip";
import ViewProjectTab from "@/app/flow-councils/components/ViewProjectTab";
import ViewRoundTab from "@/app/flow-councils/components/ViewRoundTab";
import ViewAttestationTab from "@/app/flow-councils/components/ViewAttestationTab";
import InternalComments from "@/app/flow-councils/components/InternalComments";
import useDistributionPoolQuery from "@/app/flow-councils/hooks/distributionPoolQuery";
import useSiwe from "@/hooks/siwe";
import { useMediaQuery } from "@/hooks/mediaQuery";
import { useLocalDraft } from "@/hooks/useLocalDraft";
import { flowCouncilAbi } from "@/lib/abi/flowCouncil";
import { networks } from "@/lib/networks";
import { SUPERFLUID_CALL_AGREEMENT_OPERATION } from "@/lib/constants";
import { gdaForwarderAbi } from "@sfpro/sdk/abi";
import { hostAbi, gdaAbi } from "@sfpro/sdk/abi/core";
import { RECIPIENT_MANAGER_ROLE } from "../lib/constants";
import { getApolloClient } from "@/lib/apollo";
import type {
  RoundForm,
  AttestationForm,
} from "@/app/flow-councils/types/round";
import {
  type FormSchema,
  type FormElement,
  STRUCTURAL_TYPES,
} from "@/app/flow-councils/types/formSchema";
import {
  getApplicationAsDynamic,
  isDynamicApplicationDetails,
} from "@/app/flow-councils/utils/legacyFormAdapter";
import { getAllowedStatusTransitions } from "@/app/flow-councils/lib/statusTransitions";
import { ProjectDetails } from "@/types/project";

type ReviewProps = {
  chainId?: number;
  councilId?: string;
  hostname: string;
};

type ApplicationDetails = RoundForm & {
  attestation?: AttestationForm;
};

type ApplicationSummary = {
  id: number;
  projectId: number;
  fundingAddress: string;
  status: Status;
  editsUnlocked: boolean;
  projectDetails: { name?: string } | null;
};

type Application = {
  id: number;
  projectId: number;
  roundId: number;
  fundingAddress: string;
  status: Status;
  editsUnlocked: boolean;
  projectDetails: ProjectDetails | null;
  details: ApplicationDetails | null;
  managerAddresses?: string[];
  managerEmails?: string[];
};

type Status =
  | "INCOMPLETE"
  | "SUBMITTED"
  | "ACCEPTED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "REMOVED"
  | "GRADUATED";

type ConnectAllState =
  | "submitting"
  | "loading"
  | "actionable"
  | "no-members"
  | "all-connected";

const STATUS_LABELS: Record<Status, string> = {
  INCOMPLETE: "Incomplete",
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  CHANGES_REQUESTED: "Changes Requested",
  REJECTED: "Rejected",
  REMOVED: "Removed",
  GRADUATED: "Graduated",
};

const FLOW_COUNCIL_QUERY = gql`
  query FlowCouncilQuery($councilId: String!) {
    flowCouncil(id: $councilId) {
      id
      maxVotingSpread
      superToken
      distributionPool
      flowCouncilManagers {
        account
        role
      }
    }
  }
`;

export default function Review(props: ReviewProps) {
  const { chainId, councilId, hostname } = props;

  const [applications, setApplications] = useState<ApplicationSummary[]>([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState(true);
  const [selectedApplication, setSelectedApplication] =
    useState<Application | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [roundFormSchema, setRoundFormSchema] = useState<FormSchema | null>(
    null,
  );
  const [selectedTab, setSelectedTab] = useState<string>("project");
  const [newStatus, setNewStatus] = useState<Status | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reviewDraft = useLocalDraft<string>(
    selectedApplication
      ? `review:${chainId}:${councilId}:${selectedApplication.id}`
      : null,
  );

  useEffect(() => {
    setReviewComment(reviewDraft.readDraft() ?? "");
  }, [reviewDraft]);

  const [isTogglingLock, setIsTogglingLock] = useState(false);
  const [applicationsClosed, setApplicationsClosed] = useState(false);
  const [isTogglingApplicationsClosed, setIsTogglingApplicationsClosed] =
    useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [connectingAddresses, setConnectingAddresses] = useState<Set<string>>(
    new Set(),
  );
  const [isConnectingAll, setIsConnectingAll] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [connectionOverrides, setConnectionOverrides] = useState<
    Map<string, "connected" | "slots-full">
  >(new Map());

  const [tableHeight, setTableHeight] = useState(280);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const handleTableResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const container = tableContainerRef.current;
      if (!container) return;

      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);

      const startY = e.clientY;
      const startHeight = container.offsetHeight;
      const maxHeight = window.innerHeight * 0.7;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextHeight = startHeight + moveEvent.clientY - startY;
        setTableHeight(Math.min(maxHeight, Math.max(160, nextHeight)));
      };

      const handlePointerUp = () => {
        handle.removeEventListener("pointermove", handlePointerMove);
        handle.removeEventListener("pointerup", handlePointerUp);
        handle.removeEventListener("lostpointercapture", handlePointerUp);
      };

      handle.addEventListener("pointermove", handlePointerMove);
      handle.addEventListener("pointerup", handlePointerUp);
      handle.addEventListener("lostpointercapture", handlePointerUp);
    },
    [],
  );

  const queryClient = useQueryClient();
  const topRef = useRef<HTMLDivElement>(null);
  const fullScreenRef = useRef<HTMLDivElement>(null);
  const publicClient = usePublicClient();
  const wagmiConfig = useConfig();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoOpenedApplicationRef = useRef(false);
  const { address, chain: connectedChain } = useAccount();
  const { data: session } = useSession();
  const { handleSignIn } = useSiwe();
  const { isMobile } = useMediaQuery();
  const { openConnectModal } = useConnectModal();
  const { switchChain } = useSwitchChain();
  const { data: flowCouncilQueryRes, loading: flowCouncilQueryResLoading } =
    useQuery(FLOW_COUNCIL_QUERY, {
      client: getApolloClient("flowCouncil", chainId),
      variables: {
        chainId,
        councilId: councilId?.toLowerCase(),
      },
      skip: !chainId || !councilId,
      pollInterval: 10000,
    });

  const granteeApplicationLink = `${hostname}/flow-councils/application/${chainId}/${councilId}`;
  const flowCouncil = flowCouncilQueryRes?.flowCouncil;
  const network = useMemo(
    () => networks.find((n) => n.id === chainId),
    [chainId],
  );
  const { pool: distributionPool, loading: distributionPoolLoading } =
    useDistributionPoolQuery(network, flowCouncil?.distributionPool);
  const poolMembershipByAddress = useMemo(() => {
    const map = new Map<string, { isConnected: boolean }>();
    const members = distributionPool?.poolMembers as
      | { account: { id: string }; isConnected: boolean }[]
      | undefined;
    if (members) {
      for (const m of members) {
        map.set(m.account.id.toLowerCase(), { isConnected: m.isConnected });
      }
    }
    return map;
  }, [distributionPool]);
  const disconnectedRecipients = useMemo(
    () =>
      applications
        .map((a) => ({
          address: a.fundingAddress,
          addressLower: a.fundingAddress.toLowerCase(),
        }))
        .filter(({ addressLower }) => {
          if (connectionOverrides.has(addressLower)) return false;
          const membership = poolMembershipByAddress.get(addressLower);
          return !!membership && !membership.isConnected;
        })
        .map(({ address }) => address as Address),
    [applications, poolMembershipByAddress, connectionOverrides],
  );
  const slotsFullCount = useMemo(
    () =>
      Array.from(connectionOverrides.values()).filter((v) => v === "slots-full")
        .length,
    [connectionOverrides],
  );

  useEffect(() => {
    if (poolMembershipByAddress.size === 0) return;
    setConnectionOverrides((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const addr of next.keys()) {
        if (poolMembershipByAddress.get(addr)?.isConnected) {
          next.delete(addr);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [poolMembershipByAddress]);

  const isLoadingPoolData =
    flowCouncilQueryResLoading || distributionPoolLoading;

  const isAuthed = !!session;

  const connectAllState: ConnectAllState = isConnectingAll
    ? "submitting"
    : isLoadingPoolData
      ? "loading"
      : disconnectedRecipients.length > 0
        ? "actionable"
        : poolMembershipByAddress.size === 0
          ? "no-members"
          : "all-connected";

  const [roundName, setRoundName] = useState("Flow Council");

  useEffect(() => {
    if (!chainId || !councilId) return;

    (async () => {
      try {
        const res = await fetch(
          `/api/flow-council/rounds?chainId=${chainId}&flowCouncilAddress=${councilId}`,
        );
        const data = await res.json();

        if (data.success && data.round) {
          setApplicationsClosed(data.round.applicationsClosed ?? false);

          if (data.round.details) {
            const details =
              typeof data.round.details === "string"
                ? JSON.parse(data.round.details)
                : data.round.details;
            setRoundName(details?.name ?? "Flow Council");
            if (details?.formSchema) {
              setRoundFormSchema(details.formSchema);
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
    })();
  }, [chainId, councilId]);

  const handleExportCsv = useCallback(async () => {
    if (!flowCouncil || !applications.length || isExportingCsv) return;

    setIsExportingCsv(true);

    let fullApplications: Application[];

    try {
      const res = await fetch("/api/flow-council/applications", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          councilId: flowCouncil.id,
        }),
      });
      if (!res.ok) {
        setIsExportingCsv(false);
        setError("Failed to export CSV");
        return;
      }
      const data = await res.json();
      if (!data.success) {
        setIsExportingCsv(false);
        setError("Failed to export CSV");
        return;
      }
      fullApplications = data.applications;
    } catch {
      setIsExportingCsv(false);
      setError("Failed to export CSV");
      return;
    }

    const escCsv = (value: string) => {
      const safe = /^[=+\-@]/.test(value) ? `\t${value}` : value;
      if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
        return `"${safe.replace(/"/g, '""')}"`;
      }
      return safe;
    };

    const projectHeaders = [
      "project_addresses",
      "goodcollective_pool_addresses",
      "x_handle",
      "farcaster_handle",
      "github_repo",
    ];

    const formatProjectColumns = (
      projectDetails: ProjectDetails | null,
    ): string[] => {
      const smartContracts = projectDetails?.smartContracts ?? [];
      return [
        smartContracts
          .filter((sc) => sc.type === "projectAddress")
          .map((sc) => sc.address)
          .join("|"),
        smartContracts
          .filter((sc) => sc.type === "goodCollectivePool")
          .map((sc) => sc.address)
          .join("|"),
        projectDetails?.twitter ?? "",
        projectDetails?.farcaster ?? "",
        [projectDetails?.github, ...(projectDetails?.githubRepos ?? [])]
          .filter(Boolean)
          .join("|"),
      ];
    };

    let headers: string[];
    let rows: string[][];

    const hasDynamicForm =
      !!roundFormSchema ||
      fullApplications.some((app) => isDynamicApplicationDetails(app.details));

    if (!hasDynamicForm) {
      headers = [
        "application_status",
        "project_name",
        "funding_address",
        "manager_emails",
        "contact_name",
        "contact_telegram",
        ...projectHeaders,
      ];

      rows = fullApplications.map((app) => {
        const projectDetails = app.projectDetails;
        return [
          STATUS_LABELS[app.status] || app.status,
          projectDetails?.name ?? "",
          app.fundingAddress ?? "",
          (app.managerEmails ?? []).join("|"),
          app.details?.team?.primaryContact?.name ?? "",
          app.details?.team?.primaryContact?.telegram ?? "",
          ...formatProjectColumns(projectDetails),
        ].map(escCsv);
      });
    } else {
      const formatVal = (val: unknown) => {
        if (Array.isArray(val)) return val.join("|");
        if (typeof val === "boolean") return val ? "Yes" : "No";
        return String(val ?? "");
      };

      const appViews = fullApplications.map((app) => ({
        app,
        ...getApplicationAsDynamic(app.details, roundFormSchema),
      }));

      const isQuestion = (el: FormElement) => !STRUCTURAL_TYPES.has(el.type);
      const unionQuestions = (pick: (schema: FormSchema) => FormElement[]) => {
        const byId = new Map<string, FormElement>();
        for (const { schema } of appViews) {
          for (const el of pick(schema).filter(isQuestion)) {
            if (!byId.has(el.id)) byId.set(el.id, el);
          }
        }
        return [...byId.values()];
      };

      const roundQuestions = unionQuestions((schema) => schema.round);
      const attestationQuestions = unionQuestions(
        (schema) => schema.attestation,
      );

      headers = [
        "application_status",
        "project_name",
        "funding_address",
        "manager_emails",
        ...projectHeaders,
        ...roundQuestions.map((q) => q.label),
        ...attestationQuestions.map((q) => q.label),
      ];

      rows = appViews.map(({ app, roundValues, attestationValues }) => {
        const projectDetails = app.projectDetails;
        return [
          STATUS_LABELS[app.status] || app.status,
          projectDetails?.name ?? "",
          app.fundingAddress ?? "",
          (app.managerEmails ?? []).join("|"),
          ...formatProjectColumns(projectDetails),
          ...roundQuestions.map((q) => formatVal(roundValues[q.id])),
          ...attestationQuestions.map((q) =>
            formatVal(attestationValues[q.id]),
          ),
        ].map(escCsv);
      });
    }

    const csv = [
      headers.map(escCsv).join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const safeName = roundName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
    const filename = `${safeName}_${dateStr}.csv`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    setIsExportingCsv(false);
  }, [
    applications,
    flowCouncil,
    chainId,
    isExportingCsv,
    roundName,
    roundFormSchema,
  ]);

  const fetchApplications = useCallback(async () => {
    if (!flowCouncil || !chainId || !isAuthed) {
      return;
    }

    try {
      const applicationsRes = await fetch("/api/flow-council/applications", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          councilId: flowCouncil.id,
          mode: "list",
        }),
      });

      const { success, applications } = await applicationsRes.json();

      if (success) {
        setApplications(applications);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingApplications(false);
    }
  }, [flowCouncil, chainId, isAuthed]);

  const isManager = useMemo(() => {
    const flowCouncilManager = flowCouncil?.flowCouncilManagers?.find(
      (m: { account: string; role: string }) =>
        m.account === address?.toLowerCase() &&
        m.role === RECIPIENT_MANAGER_ROLE,
    );

    if (flowCouncilManager) {
      return true;
    }

    return false;
  }, [address, flowCouncil]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Get available statuses based on current status
  const availableStatuses = useMemo(() => {
    if (!selectedApplication) return [];
    return getAllowedStatusTransitions(selectedApplication.status);
  }, [selectedApplication]);

  const handleSelectApplication = async (summary: ApplicationSummary) => {
    setSelectedTab("project");
    setNewStatus(null);
    setReviewComment("");
    setError("");
    setIsLoadingDetail(true);

    try {
      const res = await fetch(
        `/api/flow-council/applications/${summary.id}?chainId=${chainId}&councilId=${councilId}`,
      );
      if (!res.ok) {
        setError("Failed to load application details");
        return;
      }
      const data = await res.json();

      if (data.success) {
        setSelectedApplication(data.application);
      } else {
        setError("Failed to load application details");
      }
    } catch {
      setError("Failed to load application details");
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCloseReview = () => {
    setSelectedApplication(null);
    setNewStatus(null);
    setReviewComment("");
    setError("");
    setIsFullScreen(false);
  };

  // Deep link from the inbox: /flow-councils/review/[chainId]/[councilId]
  // ?applicationId=123 opens that application's review panel once the list
  // has loaded. Guarded by a ref so it only fires once per mount.
  useEffect(() => {
    if (autoOpenedApplicationRef.current) return;
    const param = searchParams.get("applicationId");
    if (!param || applications.length === 0) return;
    const applicationId = parseInt(param, 10);
    if (isNaN(applicationId)) return;
    const summary = applications.find((a) => a.id === applicationId);
    if (!summary) return;
    autoOpenedApplicationRef.current = true;
    handleSelectApplication(summary);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
    // handleSelectApplication is a stable closure recreated each render but
    // safe to call here; excluded from deps to avoid re-triggering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, searchParams]);

  useEffect(() => {
    if (!isFullScreen) return;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    fullScreenRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullScreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isFullScreen]);

  const handleToggleEditsUnlocked = async (application: Application) => {
    if (!flowCouncil) return;

    try {
      setIsTogglingLock(true);
      setError("");

      const res = await fetch("/api/flow-council/review/unlock", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          councilId: flowCouncil.id,
          applicationId: application.id,
          editsUnlocked: !application.editsUnlocked,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error);
        setIsTogglingLock(false);
        return;
      }

      const updatedApp = {
        ...application,
        editsUnlocked: !application.editsUnlocked,
      };
      setSelectedApplication(updatedApp);
      setApplications((prev) =>
        prev.map((a) => (a.id === application.id ? updatedApp : a)),
      );

      setIsTogglingLock(false);
    } catch (err) {
      console.error(err);
      setIsTogglingLock(false);
      setError("Failed to toggle edit lock");
    }
  };

  const handleToggleApplicationsClosed = async () => {
    if (!flowCouncil) return;

    try {
      setIsTogglingApplicationsClosed(true);
      setError("");

      const res = await fetch("/api/flow-council/rounds/close-applications", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          councilId: flowCouncil.id,
          applicationsClosed: !applicationsClosed,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error);
        setIsTogglingApplicationsClosed(false);
        return;
      }

      setApplicationsClosed(!applicationsClosed);
      queryClient.invalidateQueries({ queryKey: ["councilMetadata"] });
      setIsTogglingApplicationsClosed(false);
    } catch (err) {
      console.error(err);
      setIsTogglingApplicationsClosed(false);
      setError("Failed to toggle applications status");
    }
  };

  const ensureChain = useCallback(async () => {
    if (!chainId) return false;
    if (!address) {
      openConnectModal?.();
      return false;
    }
    if (connectedChain?.id !== chainId) {
      switchChain({ chainId });
      return false;
    }
    return true;
  }, [chainId, address, connectedChain?.id, openConnectModal, switchChain]);

  const handleTryConnect = useCallback(
    async (recipient: Address) => {
      if (!network || !flowCouncil?.distributionPool || !publicClient) return;
      if (!(await ensureChain())) return;

      const key = recipient.toLowerCase();
      setConnectError("");
      setConnectingAddresses((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      try {
        const callData = encodeFunctionData({
          abi: gdaAbi,
          functionName: "tryConnectPoolFor",
          args: [
            flowCouncil.distributionPool as Address,
            recipient,
            "0x" as `0x${string}`,
          ],
        });

        const hash = await writeContract(wagmiConfig, {
          address: network.superfluidHost,
          abi: hostAbi,
          functionName: "callAgreement",
          args: [network.gda, callData, "0x"],
        });

        await waitForReceipt(publicClient, hash);

        const isConnected = await publicClient.readContract({
          address: network.gdaForwarder,
          abi: gdaForwarderAbi,
          functionName: "isMemberConnected",
          args: [flowCouncil.distributionPool as Address, recipient],
        });
        setConnectionOverrides((prev) => {
          const next = new Map(prev);
          next.set(key, isConnected ? "connected" : "slots-full");
          return next;
        });
      } catch (err) {
        console.error(err);
        setConnectError("Failed to connect recipient");
      } finally {
        setConnectingAddresses((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [
      network,
      flowCouncil?.distributionPool,
      publicClient,
      wagmiConfig,
      ensureChain,
    ],
  );

  const handleConnectAll = useCallback(async () => {
    if (!network || !flowCouncil?.distributionPool || !publicClient) return;
    const targets = disconnectedRecipients;
    if (targets.length === 0) return;
    if (!(await ensureChain())) return;

    const poolAddress = flowCouncil.distributionPool as Address;

    setConnectError("");
    setIsConnectingAll(true);

    try {
      const operations = targets.map((member) => ({
        operationType: SUPERFLUID_CALL_AGREEMENT_OPERATION,
        target: network.gda,
        data: encodeAbiParameters(
          [{ type: "bytes" }, { type: "bytes" }],
          [
            encodeFunctionData({
              abi: gdaAbi,
              functionName: "tryConnectPoolFor",
              args: [poolAddress, member, "0x" as `0x${string}`],
            }),
            "0x" as `0x${string}`,
          ],
        ),
      }));

      const hash = await writeContract(wagmiConfig, {
        address: network.superfluidHost,
        abi: hostAbi,
        functionName: "batchCall",
        args: [operations],
      });

      await waitForReceipt(publicClient, hash);

      const results = await publicClient.multicall({
        contracts: targets.map((member) => ({
          address: network.gdaForwarder,
          abi: gdaForwarderAbi,
          functionName: "isMemberConnected" as const,
          args: [poolAddress, member] as const,
        })),
        allowFailure: true,
      });
      setConnectionOverrides((prev) => {
        const next = new Map(prev);
        results.forEach((r, i) => {
          if (r.status !== "success") return;
          next.set(
            targets[i].toLowerCase(),
            r.result ? "connected" : "slots-full",
          );
        });
        return next;
      });
    } catch (err) {
      console.error(err);
      setConnectError("Failed to connect recipients");
    } finally {
      setIsConnectingAll(false);
    }
  }, [
    network,
    flowCouncil?.distributionPool,
    publicClient,
    wagmiConfig,
    disconnectedRecipients,
    ensureChain,
  ]);

  const handleSubmitReview = async () => {
    if (!session) {
      throw Error("Account is not signed in");
    }

    if (!flowCouncil || !selectedApplication || !newStatus) {
      throw Error("Missing required data");
    }

    try {
      setIsSubmitting(true);
      setError("");

      // Check if on-chain transaction is needed
      // Only need on-chain tx when actually changing on-chain state:
      // - Adding: ACCEPTED (and not already on-chain)
      // - Removing: leaving ACCEPTED for any non-accepted status
      const currentStatus = selectedApplication.status;
      const isAddingOnChain =
        newStatus === "ACCEPTED" && currentStatus !== "ACCEPTED";
      const isRemovingOnChain =
        currentStatus === "ACCEPTED" && newStatus !== "ACCEPTED";

      if (isAddingOnChain || isRemovingOnChain) {
        const recipientStatus = isAddingOnChain ? 0 : 1; // 0 = ADDED, 1 = REMOVED

        const hash = await writeContract(wagmiConfig, {
          address: flowCouncil.id as Address,
          abi: flowCouncilAbi,
          functionName: "updateRecipients",
          args: [
            [
              {
                account: selectedApplication.fundingAddress as Address,
                status: recipientStatus,
              },
            ],
            [selectedApplication.projectDetails?.name ?? ""],
          ],
        });

        await waitForReceipt(publicClient!, hash);
      }

      // Update status in DB and create automated message
      const res = await fetch("/api/flow-council/review", {
        method: "POST",
        body: JSON.stringify({
          chainId,
          councilId: flowCouncil.id,
          applicationId: selectedApplication.id,
          newStatus,
          comment: reviewComment,
        }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error);
        setIsSubmitting(false);
        return;
      }

      // Success - refresh applications and close panel
      reviewDraft.clear();
      setSuccess(true);
      fetchApplications();
      handleCloseReview();

      // Scroll to top
      topRef.current?.scrollIntoView({ behavior: "smooth" });

      setIsSubmitting(false);
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
      setError("Error: Please retry later");
    }
  };

  if (!councilId || !chainId || (!flowCouncilQueryResLoading && !flowCouncil)) {
    return (
      <span className="m-auto fs-4 fw-bold">
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
        <div ref={topRef} />
        <h1 className="mt-4 fs-5 fw-semi-bold">Manage Recipients</h1>
        <h2 className="fs-md text-info">
          Review and/or remove eligible funding recipients from your Flow
          Council.
        </h2>
        {!flowCouncil && !isManager ? (
          <Spinner className="mt-5 mx-auto" />
        ) : !isManager ? (
          <Stack
            direction="vertical"
            gap={2}
            className="align-items-center mt-5"
          >
            <Image src="/delete.svg" alt="" width={90} height={90} />
            <span className="text-center fs-5 fw-bold">
              You don't have access to this module. Check your connected
              wallet's permissions.
            </span>
          </Stack>
        ) : !session || session.address !== address ? (
          <Button
            variant="secondary"
            className="d-flex justify-content-center align-items-center gap-2 mt-5 fs-lg fw-semi-bold py-4 rounded-4"
            onClick={() => {
              !address && openConnectModal
                ? openConnectModal()
                : connectedChain?.id !== chainId
                  ? switchChain({ chainId })
                  : handleSignIn();
            }}
          >
            Sign In With Ethereum
          </Button>
        ) : (
          <>
            <Card.Text className="mt-4">Application Link</Card.Text>
            <Stack
              direction="horizontal"
              gap={2}
              className="w-100 me-auto mb-5 overflow-hidden"
            >
              <Badge className="d-flex align-items-center bg-white text-black fw-semi-bold border border-4 border-dark p-2 fw-normal text-truncate text-start h-100">
                {granteeApplicationLink}
              </Badge>
              <CopyTooltip
                contentClick="Link Copied"
                contentHover="Copy Link"
                target={<Image src="/copy.svg" alt="copy" width={28} />}
                handleCopy={() =>
                  navigator.clipboard.writeText(granteeApplicationLink)
                }
              />
            </Stack>
            <Stack
              direction="horizontal"
              gap={2}
              className="align-items-center mb-4"
            >
              <InfoTooltip
                position={{ top: true }}
                wrapperClassName="d-flex align-items-center"
                content={<>Open Applications</>}
                target={
                  <Image src="/unlock.svg" alt="Open" width={20} height={20} />
                }
              />
              <div
                className="form-switch"
                style={{
                  paddingLeft: 0,
                  display: "flex",
                  fontSize: "1.25rem",
                }}
              >
                <input
                  type="checkbox"
                  role="switch"
                  id="applications-closed-toggle"
                  className="form-check-input m-0"
                  checked={applicationsClosed}
                  disabled={isTogglingApplicationsClosed}
                  onChange={handleToggleApplicationsClosed}
                />
              </div>
              <InfoTooltip
                position={{ top: true }}
                wrapperClassName="d-flex align-items-center"
                content={<>Close Applications</>}
                target={
                  <Image src="/lock.svg" alt="Closed" width={20} height={20} />
                }
              />
            </Stack>

            {/* Applications Table */}
            <div style={{ position: "relative" }}>
              <div
                ref={tableContainerRef}
                className="border border-4 border-dark"
                style={{
                  height: tableHeight,
                  overflow: "auto",
                }}
              >
                <Table striped hover>
                  <thead
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 1,
                    }}
                  >
                    <tr>
                      <th className="bg-white w-25">Project</th>
                      <th className="bg-white text-center w-25">
                        Pool Connection
                      </th>
                      <th className="bg-white text-center w-25">Status</th>
                      <th className="bg-white text-end w-25">
                        {applications.length > 0 && (
                          <Button
                            variant="link"
                            className="p-0"
                            title="Export CSV"
                            disabled={isExportingCsv}
                            onClick={handleExportCsv}
                          >
                            {isExportingCsv ? (
                              <Spinner size="sm" />
                            ) : (
                              <Image
                                src="/csv.svg"
                                alt="Export CSV"
                                width={24}
                                height={24}
                              />
                            )}
                          </Button>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingApplications &&
                      Array.from({ length: 3 }).map((_, i) => (
                        <tr key={`skel-${i}`}>
                          <td className="w-25 align-middle">
                            <Placeholder animation="glow">
                              <Placeholder xs={8} />
                            </Placeholder>
                          </td>
                          <td className="w-25 text-center align-middle">
                            <Placeholder animation="glow">
                              <Placeholder
                                className="d-inline-block rounded-circle"
                                style={{ width: 24, height: 24 }}
                              />
                            </Placeholder>
                          </td>
                          <td className="w-25 text-center align-middle">
                            <Placeholder animation="glow">
                              <Placeholder xs={6} />
                            </Placeholder>
                          </td>
                          <td className="w-25 align-middle">
                            <Placeholder animation="glow">
                              <Placeholder.Button
                                variant="secondary"
                                xs={12}
                                className="py-4 rounded-4"
                              />
                            </Placeholder>
                          </td>
                        </tr>
                      ))}
                    {!isLoadingApplications &&
                      applications?.map(
                        (application: ApplicationSummary, i: number) => {
                          const addressLower =
                            application.fundingAddress.toLowerCase();
                          const override =
                            connectionOverrides.get(addressLower);
                          const membership =
                            poolMembershipByAddress.get(addressLower);
                          const isConnecting =
                            connectingAddresses.has(addressLower);
                          const status:
                            | "connected"
                            | "slots-full"
                            | "disconnected"
                            | null = override
                            ? override
                            : !membership
                              ? null
                              : membership.isConnected
                                ? "connected"
                                : "slots-full";
                          return (
                            <tr key={i}>
                              <td className="w-25 align-middle">
                                {application.projectDetails?.name ?? "N/A"}
                              </td>
                              <td className="w-25 text-center align-middle">
                                {status === null ? (
                                  isLoadingPoolData ? (
                                    <Placeholder animation="glow">
                                      <Placeholder
                                        className="d-inline-block rounded-circle"
                                        style={{ width: 24, height: 24 }}
                                      />
                                    </Placeholder>
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )
                                ) : status === "connected" ? (
                                  <InfoTooltip
                                    position={{ top: true }}
                                    content={<>Connected</>}
                                    target={
                                      <Image
                                        src="/plug-connected.svg"
                                        alt="Connected"
                                        width={24}
                                        height={24}
                                      />
                                    }
                                  />
                                ) : status === "slots-full" ? (
                                  <InfoTooltip
                                    position={{ top: true }}
                                    content={
                                      <>
                                        Not auto-connected - recipient needs to
                                        manually connect from the public voting
                                        UI
                                      </>
                                    }
                                    target={
                                      <Image
                                        src="/warning-triangle.svg"
                                        alt="Not auto-connected"
                                        width={24}
                                        height={24}
                                      />
                                    }
                                  />
                                ) : isConnecting || isConnectingAll ? (
                                  <Spinner size="sm" />
                                ) : (
                                  <InfoTooltip
                                    position={{ top: true }}
                                    content={<>Connect to pool</>}
                                    target={
                                      <Button
                                        variant="link"
                                        className="p-0 border-0"
                                        onClick={() =>
                                          handleTryConnect(
                                            application.fundingAddress as Address,
                                          )
                                        }
                                      >
                                        <Image
                                          src="/plug-disconnected.svg"
                                          alt="Connect to pool"
                                          width={24}
                                          height={24}
                                        />
                                      </Button>
                                    }
                                  />
                                )}
                              </td>
                              <td className="w-25 text-center align-middle">
                                {STATUS_LABELS[application.status] ||
                                  application.status}
                              </td>
                              <td className="w-25 align-middle">
                                {application.status === "SUBMITTED" ? (
                                  <Button
                                    className="w-100 px-10 py-4 rounded-4 fw-semi-bold text-light"
                                    onClick={() =>
                                      handleSelectApplication(application)
                                    }
                                  >
                                    Review
                                  </Button>
                                ) : application.status !== "INCOMPLETE" ? (
                                  <Button
                                    variant="secondary"
                                    className="w-100 py-4 rounded-4 fw-semi-bold"
                                    onClick={() =>
                                      handleSelectApplication(application)
                                    }
                                  >
                                    Edit Status
                                  </Button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        },
                      )}
                  </tbody>
                </Table>
              </div>
              <div
                onPointerDown={handleTableResize}
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  cursor: "ns-resize",
                  opacity: 0.7,
                  userSelect: "none",
                  touchAction: "none",
                  paddingTop: 10,
                  paddingLeft: 10,
                }}
              >
                <Image
                  src="/resize-handle.svg"
                  alt="resize"
                  width={24}
                  height={24}
                  style={{ transform: "rotate(-45deg)" }}
                  draggable={false}
                />
              </div>
            </div>

            {isLoadingDetail && (
              <div className="d-flex justify-content-center mt-4">
                <Spinner />
              </div>
            )}

            {selectedApplication !== null && !isLoadingDetail && (
              <Stack
                ref={fullScreenRef}
                direction="vertical"
                gap={4}
                tabIndex={isFullScreen ? -1 : undefined}
                role={isFullScreen ? "dialog" : undefined}
                aria-modal={isFullScreen ? true : undefined}
                aria-label={
                  isFullScreen
                    ? `${selectedApplication.projectDetails?.name ?? "Application"} review`
                    : undefined
                }
                className={
                  isFullScreen
                    ? "position-fixed top-0 start-0 w-100 vh-100 overflow-auto p-4 p-md-5 bg-lace-50"
                    : "mt-4"
                }
                style={isFullScreen ? { zIndex: 1050 } : undefined}
              >
                <div className="bg-lace-100 rounded-4 p-4">
                  <Stack
                    direction="horizontal"
                    className="justify-content-between mb-4"
                  >
                    <Stack
                      direction="horizontal"
                      gap={3}
                      className="align-items-center"
                    >
                      <h4 className="fw-bold mb-0">
                        {selectedApplication.projectDetails?.name ??
                          "Application Review"}
                      </h4>
                      <Button
                        variant="link"
                        className="d-flex align-items-center gap-1 p-0 text-decoration-none fw-semi-bold text-primary"
                        onClick={() => setIsFullScreen((prev) => !prev)}
                      >
                        <Image
                          src={
                            isFullScreen
                              ? "/fullscreen-exit.svg"
                              : "/fullscreen.svg"
                          }
                          alt=""
                          width={20}
                          height={20}
                        />
                        {isFullScreen
                          ? "Exit Full Screen"
                          : "Full Screen Review"}
                      </Button>
                    </Stack>
                    <Stack direction="horizontal" gap={3}>
                      {["ACCEPTED", "GRADUATED", "REMOVED"].includes(
                        selectedApplication.status,
                      ) && (
                        <Stack
                          direction="horizontal"
                          gap={2}
                          className="align-items-center"
                        >
                          <Image
                            src="/lock.svg"
                            alt="Locked"
                            width={20}
                            height={20}
                          />
                          <div
                            className="form-switch"
                            style={{
                              paddingLeft: 0,
                              display: "flex",
                              fontSize: "1.25rem",
                            }}
                          >
                            <input
                              type="checkbox"
                              role="switch"
                              id="edits-unlocked-toggle"
                              className="form-check-input m-0"
                              checked={selectedApplication.editsUnlocked}
                              disabled={isTogglingLock}
                              onChange={() =>
                                handleToggleEditsUnlocked(selectedApplication)
                              }
                            />
                          </div>
                          <Image
                            src="/unlock.svg"
                            alt="Unlocked"
                            width={20}
                            height={20}
                          />
                        </Stack>
                      )}
                      <Button
                        variant="link"
                        className="p-0"
                        onClick={handleCloseReview}
                      >
                        <Image src="/close.svg" alt="Close" width={24} />
                      </Button>
                    </Stack>
                  </Stack>

                  <Row className="mb-3">
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semi-bold">
                          Current Status
                        </Form.Label>
                        <Form.Control
                          type="text"
                          value={STATUS_LABELS[selectedApplication.status]}
                          disabled
                          className="bg-light border-0 rounded-4 py-3 px-3 fw-semi-bold"
                        />
                      </Form.Group>
                    </Col>
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semi-bold">
                          New Status
                        </Form.Label>
                        <Dropdown>
                          <Dropdown.Toggle
                            variant="white"
                            className="w-100 d-flex justify-content-between align-items-center bg-white border border-2 border-dark rounded-4 py-3 px-3"
                          >
                            {newStatus
                              ? STATUS_LABELS[newStatus]
                              : "Select new status..."}
                          </Dropdown.Toggle>
                          <Dropdown.Menu className="w-100 border border-dark p-2 lh-lg">
                            {availableStatuses.map((status) => (
                              <Dropdown.Item
                                key={status}
                                onClick={() => setNewStatus(status)}
                              >
                                {STATUS_LABELS[status]}
                              </Dropdown.Item>
                            ))}
                          </Dropdown.Menu>
                        </Dropdown>
                      </Form.Group>
                    </Col>
                  </Row>

                  <Form.Group className="mb-4">
                    <Form.Label className="fw-semi-bold">
                      Review Comment (Shared with the project)
                    </Form.Label>
                    <MarkdownEditor
                      rows={3}
                      value={reviewComment}
                      placeholder="Write a message..."
                      onChange={(e) => {
                        setReviewComment(e.target.value);
                        reviewDraft.save(e.target.value);
                      }}
                      resizable
                    />
                  </Form.Group>

                  <Button
                    className="w-100 py-4 rounded-4 fw-semi-bold"
                    disabled={!newStatus || isSubmitting}
                    onClick={() => {
                      !address && openConnectModal
                        ? openConnectModal()
                        : connectedChain?.id !== chainId
                          ? switchChain({ chainId })
                          : handleSubmitReview();
                    }}
                  >
                    {isSubmitting ? (
                      <Spinner size="sm" className="m-auto" />
                    ) : (
                      `Update to ${newStatus ? STATUS_LABELS[newStatus] : "..."}`
                    )}
                  </Button>

                  {error && (
                    <Alert
                      variant="danger"
                      className="mt-3 p-3 fw-semi-bold text-danger"
                    >
                      {error}
                    </Alert>
                  )}
                </div>

                <div className="bg-lace-100 rounded-4 p-4">
                  <Tab.Container
                    activeKey={selectedTab}
                    onSelect={(k) => setSelectedTab(k || "project")}
                  >
                    <Nav className="gap-2 mb-4 border-0">
                      <Nav.Item>
                        <Nav.Link
                          eventKey="project"
                          className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${
                            selectedTab === "project"
                              ? "bg-primary text-white"
                              : "bg-white text-primary"
                          }`}
                          style={{ width: 140 }}
                        >
                          Project
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link
                          eventKey="round"
                          className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${
                            selectedTab === "round"
                              ? "bg-primary text-white"
                              : "bg-white text-primary"
                          }`}
                          style={{ width: 140 }}
                        >
                          Round
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link
                          eventKey="eligibility"
                          className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${
                            selectedTab === "eligibility"
                              ? "bg-primary text-white"
                              : "bg-white text-primary"
                          }`}
                          style={{ width: 140 }}
                        >
                          Attestation
                        </Nav.Link>
                      </Nav.Item>
                      <Nav.Item>
                        <Nav.Link
                          eventKey="comments"
                          className={`py-3 rounded-4 fs-lg fw-bold text-center border border-2 border-primary ${
                            selectedTab === "comments"
                              ? "bg-primary text-white"
                              : "bg-white text-primary"
                          }`}
                          style={{ width: 140 }}
                        >
                          Comments
                        </Nav.Link>
                      </Nav.Item>
                    </Nav>

                    {(() => {
                      const { schema, roundValues, attestationValues } =
                        getApplicationAsDynamic(
                          selectedApplication.details,
                          roundFormSchema,
                        );

                      return (
                        <Tab.Content>
                          <Tab.Pane eventKey="project">
                            <ViewProjectTab
                              projectDetails={
                                selectedApplication.projectDetails
                              }
                              managerAddresses={
                                selectedApplication.managerAddresses
                              }
                            />
                          </Tab.Pane>
                          <Tab.Pane eventKey="round">
                            <ViewRoundTab
                              formSchema={schema}
                              dynamicValues={roundValues}
                              fundingAddress={
                                selectedApplication.fundingAddress
                              }
                            />
                          </Tab.Pane>
                          <Tab.Pane eventKey="eligibility">
                            <ViewAttestationTab
                              formSchema={schema}
                              dynamicValues={attestationValues}
                            />
                          </Tab.Pane>
                          <Tab.Pane eventKey="comments">
                            <InternalComments
                              applicationId={selectedApplication.id}
                              chainId={chainId}
                              councilId={councilId}
                            />
                          </Tab.Pane>
                        </Tab.Content>
                      );
                    })()}
                  </Tab.Container>
                </div>
              </Stack>
            )}

            <Stack direction="vertical" gap={3} className="mt-4 mb-30">
              <Button
                variant="primary"
                className="py-4 rounded-4 fs-lg fw-semi-bold text-light"
                disabled={connectAllState !== "actionable"}
                onClick={handleConnectAll}
              >
                {connectAllState === "submitting" ? (
                  <Spinner size="sm" />
                ) : connectAllState === "loading" ? (
                  "Loading…"
                ) : connectAllState === "actionable" ? (
                  "Connect All"
                ) : connectAllState === "no-members" ? (
                  "No Recipients in Pool"
                ) : (
                  "All Connected"
                )}
              </Button>
              {slotsFullCount > 0 && (
                <Alert variant="warning" className="mb-0">
                  {slotsFullCount} recipient
                  {slotsFullCount === 1 ? "" : "s"} couldn&apos;t autoconnect
                  because their autoconnect slots are full. They&apos;ll need to
                  connect manually from the pool page.
                </Alert>
              )}
              {connectError && (
                <Alert variant="danger" className="mb-0">
                  {connectError}
                </Alert>
              )}
              <Button
                variant="secondary"
                className="py-4 rounded-4 fs-lg fw-semi-bold"
                style={{ pointerEvents: isSubmitting ? "none" : "auto" }}
                onClick={() =>
                  router.push(
                    `/flow-councils/membership/${chainId}/${councilId}`,
                  )
                }
              >
                Next
              </Button>
              <Toast
                show={success}
                delay={4000}
                autohide={true}
                onClose={() => setSuccess(false)}
                className="w-100 bg-success p-4 fw-semi-bold fs-6 text-white"
              >
                Success!
              </Toast>
            </Stack>
          </>
        )}
      </Stack>
    </>
  );
}
