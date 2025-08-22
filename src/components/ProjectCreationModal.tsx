import { useState, useRef } from "react";
import Link from "next/link";
import { Address, parseEventLogs } from "viem";
import {
  useAccount,
  useSwitchChain,
  usePublicClient,
  useWriteContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import Card from "react-bootstrap/Card";
import InputGroup from "react-bootstrap/InputGroup";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import { pinFileToIpfs, pinJsonToIpfs } from "@/lib/ipfs";
import { extractTwitterHandle, extractGithubUsername } from "@/lib/utils";
import { registryAbi } from "@/lib/abi/registry";

type ProjectCreationModalProps = {
  show: boolean;
  chainId: number;
  handleClose: () => void;
  registryAddress: string;
  setNewProfileId: (newProfileId: string) => void;
};

type MetadataForm = {
  title: string;
  description: string;
  website: string;
  appLink: string;
  projectTwitter: string;
  userGithub: string;
  projectGithub: string;
  karmaGap: string;
  projectTelegram: string;
  projectWarpcast: string;
  projectGuild: string;
  projectDiscord: string;
  projectLens: string;
};

export default function ProjectCreationModal(props: ProjectCreationModalProps) {
  const { show, chainId, handleClose, registryAddress, setNewProfileId } =
    props;

  const [metadataForm, setMetadataForm] = useState<MetadataForm>({
    title: "",
    description: "",
    website: "",
    appLink: "",
    projectTwitter: "",
    userGithub: "",
    projectGithub: "",
    karmaGap: "",
    projectTelegram: "",
    projectWarpcast: "",
    projectGuild: "",
    projectDiscord: "",
    projectLens: "",
  });
  const [projectLogoBlob, setProjectLogoBlob] = useState<Blob | null>(null);
  const [projectBannerBlob, setProjectBannerBlob] = useState<Blob | null>(null);
  const [validated, setValidated] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [projectLogoError, setProjectLogoError] = useState("");
  const [projectBannerError, setProjectBannerError] = useState("");

  const fileInputRefLogo = useRef<HTMLInputElement>(null);
  const fileInputRefBanner = useRef<HTMLInputElement>(null);

  const { openConnectModal } = useConnectModal();
  const { address, chain: connectedChain } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  const isValid =
    !!metadataForm.title &&
    !!metadataForm.description &&
    !!metadataForm.website &&
    !!metadataForm.appLink &&
    !!metadataForm.userGithub &&
    !!projectLogoBlob &&
    !!projectBannerBlob;

  const handleFileUploadLogo = () => {
    if (!fileInputRefLogo.current?.files) {
      return;
    }

    const file = fileInputRefLogo.current.files[0];

    if (file.size > 256000) {
      setProjectLogoError("Size too large");
    } else {
      setProjectLogoBlob(file);
      setProjectLogoError("");
    }
  };

  const handleFileUploadBanner = () => {
    if (!fileInputRefBanner.current?.files) {
      return;
    }

    const file = fileInputRefBanner.current.files[0];

    if (file.size > 1000000) {
      setProjectBannerError("Size too large");
    } else {
      setProjectBannerBlob(file);
      setProjectBannerError("");
    }
  };

  const handleCreateProject = async () => {
    if (!address || !publicClient) {
      throw Error("Account is not connected");
    }

    try {
      setIsCreatingProject(true);

      let logoImg = "";
      let bannerImg = "";

      if (projectLogoBlob) {
        const { IpfsHash: logoImgCid } = await pinFileToIpfs(projectLogoBlob);

        logoImg = logoImgCid;
      }

      if (projectBannerBlob) {
        const { IpfsHash: bannerImgCid } =
          await pinFileToIpfs(projectBannerBlob);

        bannerImg = bannerImgCid;
      }

      const { IpfsHash: metadataCid } = await pinJsonToIpfs({
        ...metadataForm,
        projectTwitter:
          extractTwitterHandle(metadataForm.projectTwitter) ??
          metadataForm.projectTwitter,
        userGithub:
          extractGithubUsername(metadataForm.userGithub) ??
          metadataForm.userGithub,
        projectGithub:
          extractGithubUsername(metadataForm.projectGithub) ??
          metadataForm.projectGithub,
        website: metadataForm.website ? `https://${metadataForm.website}` : "",
        appLink: metadataForm.appLink ? `https://${metadataForm.appLink}` : "",
        logoImg,
        bannerImg,
        logoImgData: {},
        bannerImgData: {},
        credentials: {},
        createdAt: (Date.now() / 1000) | 0,
      });

      const profile = {
        name: metadataForm.title,
        metadata: {
          protocol: BigInt(1),
          pointer: metadataCid,
        },
        members: [address],
      };

      const nonce = await publicClient.getTransactionCount({
        address,
      });
      const { name, metadata, members } = profile;

      const hash = await writeContractAsync({
        address: registryAddress as Address,
        abi: registryAbi,
        functionName: "createProfile",
        args: [BigInt(nonce), name, metadata, address, members],
      });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 5,
      });
      const logs = parseEventLogs({
        abi: registryAbi,
        logs: receipt.logs,
        eventName: "ProfileCreated",
      });

      setNewProfileId(logs[0].args.profileId);
      setIsCreatingProject(false);

      handleClose();
    } catch (err) {
      console.error(err);

      setIsCreatingProject(false);
    }
  };

  const handleSubmit = () => {
    setValidated(true);

    if (!address && openConnectModal) {
      openConnectModal();
    } else if (connectedChain?.id !== chainId) {
      switchChain({ chainId });
    } else if (isValid) {
      handleCreateProject();
    }
  };

  return (
    <Modal
      show={show}
      size="lg"
      centered
      scrollable
      contentClassName="bg-lace-100"
      onHide={handleClose}
    >
      <Modal.Header closeButton className="border-0 p-4">
        <Modal.Title className="fs-5 fw-semi-bold">Create Project</Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <Form>
          <Form.Group className="mb-4">
            <Form.Label>Project Name*</Form.Label>
            <Form.Control
              type="text"
              value={metadataForm.title}
              placeholder="Your project name"
              className="border-0 bg-white py-3"
              isInvalid={validated && !metadataForm.title}
              onChange={(e) =>
                setMetadataForm({ ...metadataForm, title: e.target.value })
              }
            />
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>
              Project Description*{" "}
              <Link
                href="https://www.markdownguide.org/basic-syntax/"
                target="_blank"
              >
                (Markdown
              </Link>{" "}
              is supported in full project views, ~140 characters will show in
              previews & social shares)
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={6}
              value={metadataForm.description}
              placeholder="Your project description"
              className="border-0 bg-white py-3"
              isInvalid={validated && !metadataForm.description}
              onChange={(e) =>
                setMetadataForm({
                  ...metadataForm,
                  description: e.target.value,
                })
              }
            />
          </Form.Group>
          <Form.Group className="d-flex flex-column mb-4">
            <Form.Label>
              Project Logo* (1:1 Aspect Ratio, No larger than 256 KB)
            </Form.Label>
            <Form.Control
              type="file"
              hidden
              accept=".png,.jpeg,.jpg"
              ref={fileInputRefLogo}
              isInvalid={validated && !projectLogoBlob}
              onChange={handleFileUploadLogo}
            />
            <Stack
              direction="horizontal"
              gap={4}
              className="align-items-center"
            >
              <Button
                className="bg-transparent"
                style={{
                  width: 256,
                  height: 128,
                  border: `1px dashed ${validated && !projectLogoBlob ? "#dc3545" : "#adb5bd"}`,
                  color: "#adb5bd",
                }}
                onClick={() => fileInputRefLogo.current?.click()}
              >
                <Stack direction="vertical" className="align-items-center">
                  <Image src="/upload.svg" alt="upload" width={32} />
                  Upload a PNG or JPEG
                </Stack>
              </Button>
              {projectLogoError ? (
                <Card.Text className="m-0 text-danger">
                  {projectLogoError}
                </Card.Text>
              ) : (
                projectLogoBlob && (
                  <>
                    <Image
                      src={URL.createObjectURL(projectLogoBlob)}
                      alt="logo"
                      width={96}
                      height={96}
                      className="rounded-4"
                    />
                    <Button
                      variant="transparent"
                      className="p-0"
                      onClick={() => setProjectLogoBlob(null)}
                    >
                      <Image
                        src="/close.svg"
                        alt="Cancel"
                        width={32}
                        height={32}
                      />
                    </Button>
                  </>
                )
              )}
            </Stack>
          </Form.Group>
          <Form.Group className="d-flex flex-column mb-4">
            <Form.Label>
              Project Banner* (3:1 Aspect Ratio, No larger than 1 MB)
            </Form.Label>
            <Form.Control
              type="file"
              hidden
              accept=".png,.jpeg,.jpg"
              ref={fileInputRefBanner}
              isInvalid={validated && !projectLogoBlob}
              onChange={handleFileUploadBanner}
            />
            <Stack
              direction="horizontal"
              gap={4}
              className="align-items-center"
            >
              <Button
                className="bg-transparent"
                style={{
                  width: 256,
                  height: 128,
                  border: `1px dashed ${validated && !projectLogoBlob ? "#dc3545" : "#adb5bd"}`,
                  color: "#adb5bd",
                }}
                onClick={() => fileInputRefBanner.current?.click()}
              >
                <Stack direction="vertical" className="align-items-center">
                  <Image src="/upload.svg" alt="upload" width={32} />
                  Upload a PNG or JPEG
                </Stack>
              </Button>
              {projectBannerError ? (
                <Card.Text className="m-0 text-danger">
                  {projectBannerError}
                </Card.Text>
              ) : (
                projectBannerBlob && (
                  <>
                    <Image
                      src={URL.createObjectURL(projectBannerBlob)}
                      alt="banner"
                      width={150}
                      height={50}
                    />
                    <Button
                      variant="transparent"
                      className="p-0"
                      onClick={() => setProjectBannerBlob(null)}
                    >
                      <Image
                        src="/close.svg"
                        alt="Cancel"
                        width={32}
                        height={32}
                      />
                    </Button>
                  </>
                )
              )}
            </Stack>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Website*</Form.Label>
            <InputGroup>
              <InputGroup.Text>https://</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.website}
                placeholder="example.com"
                className="border-0 bg-white py-3"
                isInvalid={validated && !metadataForm.website}
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    website: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Application Link*</Form.Label>
            <InputGroup>
              <InputGroup.Text>https://</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.appLink}
                isInvalid={validated && !metadataForm.appLink}
                placeholder="app.example.com"
                className="border-0 bg-white py-3"
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    appLink: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Github Organization</Form.Label>
            <InputGroup>
              <InputGroup.Text>https://github.com/</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.projectGithub}
                placeholder="your-github-org"
                className="border-0 bg-white py-3"
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    projectGithub: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Your Github Username*</Form.Label>
            <InputGroup>
              <InputGroup.Text>https://github.com/</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.userGithub}
                placeholder="yourusername"
                className="border-0 bg-white py-3"
                isInvalid={validated && !metadataForm.userGithub}
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    userGithub: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Karma GAP</Form.Label>
            <InputGroup>
              <InputGroup.Text>
                https://gap.karmahq.xyz/project/
              </InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.karmaGap}
                placeholder="your-project-page"
                className="border-0 bg-white py-3"
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    karmaGap: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Twitter</Form.Label>
            <InputGroup>
              <InputGroup.Text>@</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.projectTwitter}
                placeholder="Your project's Twitter handle"
                className="border-0 bg-white py-3"
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    projectTwitter: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Farcaster</Form.Label>
            <InputGroup>
              <InputGroup.Text>farcaster.xyz/</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.projectWarpcast}
                placeholder="Your project's Farcaster handle"
                className="border-0 bg-white py-3"
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    projectWarpcast: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Lens</Form.Label>
            <InputGroup>
              <InputGroup.Text>hey.xyz/u/</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.projectLens}
                placeholder="Your project's Lens handle"
                className="border-0 bg-white py-3"
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    projectLens: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Guild</Form.Label>
            <InputGroup>
              <InputGroup.Text>guild.xyz/</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.projectGuild}
                placeholder="Your project's Guild ID"
                className="border-0 bg-white py-3"
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    projectGuild: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Telegram</Form.Label>
            <InputGroup>
              <InputGroup.Text>t.me/</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.projectTelegram}
                placeholder="Your project's Telegram ID"
                className="border-0 bg-white py-3"
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    projectTelegram: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Discord</Form.Label>
            <InputGroup>
              <InputGroup.Text>discord.com/invite/</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.projectDiscord}
                placeholder="Your project's Discord invite"
                className="border-0 bg-white py-3"
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    projectDiscord: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer className="border-0 p-4">
        <Stack direction="vertical" gap={2} className="align-items-end">
          <Button
            disabled={validated && !isValid}
            className="w-25 py-4 text-light rounded-4 fw-semi-bold"
            onClick={handleSubmit}
          >
            {isCreatingProject ? <Spinner size="sm" /> : "Create"}
          </Button>
          {validated && !isValid && (
            <Card.Text className="text-danger fw-semi-bold">
              *Please complete the required fields.
            </Card.Text>
          )}
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}
