import { useState, useEffect } from "react";
import { Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import Modal from "react-bootstrap/Modal";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Spinner from "react-bootstrap/Spinner";
import { pinJsonToIpfs } from "@/lib/ipfs";
import { registryAbi } from "@/lib/abi/registry";

type ProgramCreationModalProps = {
  show: boolean;
  handleClose: () => void;
  registryAddress: string;
};

type ProgramForm = { name: string; members: Operator[] };

type Operator = {
  address: string;
};

export default function ProgramCreationModal(props: ProgramCreationModalProps) {
  const { show, handleClose, registryAddress } = props;

  const [programForm, setProgramForm] = useState<ProgramForm>({
    name: "",
    members: [],
  });
  const [isCreatingProgram, setIsCreatingProgram] = useState(false);

  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  useEffect(() => {
    if (address) {
      setProgramForm((prev) =>
        prev.members.length === 0 ? { name: "", members: [{ address }] } : prev,
      );
    }
  }, [address]);

  const handleCreateProgram = async () => {
    if (!address || !publicClient) {
      throw Error("Account is not connected");
    }

    try {
      setIsCreatingProgram(true);

      const { IpfsHash: metadataCid } = await pinJsonToIpfs({
        type: "program",
        name: programForm.name,
      });

      const profile = {
        name: programForm.name,
        metadata: {
          protocol: BigInt(1),
          pointer: metadataCid,
        },
        members: programForm.members
          .filter((member) => !!member.address)
          .map((member) => member.address) as Address[],
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

      await publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 5,
      });

      setIsCreatingProgram(false);

      handleClose();
    } catch (err) {
      console.error(err);

      setIsCreatingProgram(false);
    }
  };

  return (
    <Modal
      show={show}
      size="lg"
      centered
      scrollable
      onHide={handleClose}
      contentClassName="bg-lace-100 p-4"
    >
      <Modal.Header closeButton className="border-0">
        <Modal.Title className="fs-5 fw-semi-bold">
          Create a Program
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form>
          <Form.Group className="my-4">
            <Form.Label>Program Name*</Form.Label>
            <Form.Control
              type="text"
              value={programForm.name}
              placeholder="Your program name"
              className="border-0 bg-white py-3 fw-semi-bold"
              onChange={(e) =>
                setProgramForm({ ...programForm, name: e.target.value })
              }
            />
          </Form.Group>
          <Form.Group className="mb-4">
            <Form.Label>Add Operator(s)</Form.Label>
            {programForm.members.map((member, i) => (
              <InputGroup key={i} className="mb-4 gap-3">
                <Form.Control
                  type="text"
                  value={member.address}
                  placeholder="The operator address"
                  className="border-0 rounded-2 bg-white py-3 fw-semi-bold"
                  onChange={(e) => {
                    const members = [...programForm.members];

                    members[i].address = e.target.value;

                    setProgramForm({ ...programForm, members });
                  }}
                />
                <Button
                  variant="danger"
                  className="rounded-2"
                  onClick={() => {
                    const members = programForm.members.filter(
                      (member, index) => index !== i,
                    );

                    setProgramForm({ ...programForm, members });
                  }}
                >
                  <Image
                    src="/close.svg"
                    alt="delete"
                    width={18}
                    height={18}
                    style={{
                      filter:
                        "invert(99%) sepia(100%) saturate(0%) hue-rotate(344deg) brightness(111%) contrast(100%)",
                    }}
                  />
                </Button>
              </InputGroup>
            ))}
          </Form.Group>
        </Form>
        <Button
          variant="secondary"
          className="text-light fw-semi-bold px-10 py-4 rounded-4"
          onClick={() =>
            setProgramForm({
              name: programForm.name,
              members: [...programForm.members, { address: "" }],
            })
          }
        >
          Add Operator
        </Button>
      </Modal.Body>
      <Modal.Footer className="border-0">
        <Button
          disabled={!address || !programForm.name}
          className="w-25 text-light py-4 rounded-4 fw-semi-bold"
          onClick={handleCreateProgram}
        >
          {isCreatingProgram ? <Spinner size="sm" /> : "Create"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
