import { useState, useRef } from "react";
import { Address, parseEventLogs } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
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
  handleClose: () => void;
  registryAddress: string;
  setNewProfileId: (newProfileId: string) => void;
};

type MetadataForm = {
  title: string;
  description: string;
  website: string;
  projectTwitter: string;
  userGithub: string;
  projectGithub: string;
};

export default function ProjectCreationModal(props: ProjectCreationModalProps) {
  const { show, handleClose, registryAddress, setNewProfileId } = props;

  const [metadataForm, setMetadataForm] = useState<MetadataForm>({
    title: "",
    description: "",
    website: "",
    projectTwitter: "",
    userGithub: "",
    projectGithub: "",
  });
  const [projectLogoBlob, setProjectLogoBlob] = useState<Blob>();
  const [projectBannerBlob, setProjectBannerBlob] = useState<Blob>();
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const fileInputRefLogo = useRef<HTMLInputElement>(null);
  const fileInputRefBanner = useRef<HTMLInputElement>(null);

  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const handleFileUploadLogo = () => {
    if (!fileInputRefLogo.current?.files) {
      return;
    }

    const file = fileInputRefLogo.current.files[0];

    setProjectLogoBlob(file);
  };

  const handleFileUploadBanner = () => {
    if (!fileInputRefBanner.current?.files) {
      return;
    }

    const file = fileInputRefBanner.current.files[0];

    setProjectBannerBlob(file);
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
        website: `https://${metadataForm.website}`,
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

  return (
    <Modal show={show} size="lg" centered scrollable onHide={handleClose}>
      <Modal.Header closeButton className="border-0">
        <Modal.Title>Create a Project</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="mb-4">
            <Form.Label>Project Name*</Form.Label>
            <Form.Control
              type="text"
              value={metadataForm.title}
              placeholder="Your project name"
              onChange={(e) =>
                setMetadataForm({ ...metadataForm, title: e.target.value })
              }
            />
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Description*</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              style={{ resize: "none" }}
              value={metadataForm.description}
              placeholder="Your project description"
              onChange={(e) =>
                setMetadataForm({
                  ...metadataForm,
                  description: e.target.value,
                })
              }
            />
          </Form.Group>
          <Form.Group className="d-flex flex-column mb-4">
            <Form.Label>Project Logo</Form.Label>
            <Form.Control
              type="file"
              hidden
              accept=".png,.jpeg,.jpg"
              ref={fileInputRefLogo}
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
                  border: "1px dashed #adb5bd",
                  color: "#adb5bd",
                }}
                onClick={() => fileInputRefLogo.current?.click()}
              >
                <Stack direction="vertical" className="align-items-center">
                  <Image src="/upload.svg" alt="upload" width={32} />
                  Upload a PNG or JPEG
                </Stack>
              </Button>
              {projectLogoBlob && (
                <Image
                  src={URL.createObjectURL(projectLogoBlob)}
                  alt="logo"
                  width={96}
                  height={96}
                  className="rounded-circle"
                />
              )}
            </Stack>
          </Form.Group>
          <Form.Group className="d-flex flex-column mb-4">
            <Form.Label>Project Banner</Form.Label>
            <Form.Control
              type="file"
              hidden
              accept=".png,.jpeg,.jpg"
              ref={fileInputRefBanner}
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
                  border: "1px dashed #adb5bd",
                  color: "#adb5bd",
                }}
                onClick={() => fileInputRefBanner.current?.click()}
              >
                <Stack direction="vertical" className="align-items-center">
                  <Image src="/upload.svg" alt="upload" width={32} />
                  Upload a PNG or JPEG
                </Stack>
              </Button>
              {projectBannerBlob && (
                <Image
                  src={URL.createObjectURL(projectBannerBlob)}
                  alt="banner"
                  width={128}
                  height={64}
                />
              )}
            </Stack>
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Project Website</Form.Label>
            <InputGroup>
              <InputGroup.Text>https://</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.website}
                placeholder="Your project website"
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
            <Form.Label>Project Twitter</Form.Label>
            <InputGroup>
              <InputGroup.Text>@</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.projectTwitter}
                placeholder="Your project Twitter handle"
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
            <Form.Label>Your Github Username</Form.Label>
            <InputGroup>
              <InputGroup.Text>https://github.com/</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.userGithub}
                placeholder="The Github username you use to contribute to the project"
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
            <Form.Label>Github Organization</Form.Label>
            <InputGroup>
              <InputGroup.Text>https://github.com/</InputGroup.Text>
              <Form.Control
                type="text"
                value={metadataForm.projectGithub}
                placeholder="The Github org name your project is part of"
                onChange={(e) =>
                  setMetadataForm({
                    ...metadataForm,
                    projectGithub: e.target.value,
                  })
                }
              />
            </InputGroup>
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer className="border-0">
        <Button
          disabled={!metadataForm.title || !metadataForm.description}
          className="w-25"
          onClick={handleCreateProject}
        >
          {isCreatingProject ? <Spinner size="sm" /> : "Create"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
