import Modal from "react-bootstrap/Modal";
import ListGroup from "react-bootstrap/ListGroup";
import Card from "react-bootstrap/Card";
import Button from "react-bootstrap/Button";
import Image from "next/image";
import { Network } from "@/types/network";

type PassportMintingInstructionsProps = {
  show: boolean;
  hide: () => void;
  network: Network;
};

export default function PassportMintingInstructions(
  props: PassportMintingInstructionsProps,
) {
  const { show, hide, network } = props;

  return (
    <Modal
      show={show}
      contentClassName="bg-light p-2 rounded-4"
      size="xl"
      centered
      scrollable
    >
      <Modal.Header className="text-primary border-0 pb-0">
        <Modal.Title as="h2">
          Mint a Gitcoin Passport on {network.name}
        </Modal.Title>
        <Button
          variant="link"
          size="sm"
          className="position-absolute top-0 end-0 pt-1 pe-1 px-sm-2 py-sm-2"
          onClick={hide}
        >
          <Image width={30} height={30} src="close.svg" alt="close" />
        </Button>
      </Modal.Header>
      <Modal.Body className="bg-light px-4 fs-4">
        <ListGroup as="ol" numbered>
          <ListGroup.Item
            as="li"
            className="d-inline-flex flex-wrap gap-1 bg-light border-0 px-0 py-1"
            style={{ listStylePosition: "inside" }}
          >
            Open{" "}
            <Card.Link href="https://passport.gitcoin.co/" target="_blank">
              https://passport.gitcoin.co/
            </Card.Link>{" "}
            in a new tab
          </ListGroup.Item>
          <ListGroup.Item
            as="li"
            className="bg-light border-0 px-0 py-1"
            style={{ listStylePosition: "inside" }}
          >
            Click <i>Sign in with Ethereum</i>
          </ListGroup.Item>
          <ListGroup.Item
            as="li"
            className="bg-light border-0 px-0 py-1"
            style={{ listStylePosition: "inside" }}
          >
            Connect your wallet & sign the message
          </ListGroup.Item>
          <ListGroup.Item
            as="li"
            className="bg-light border-0 px-0 py-1"
            style={{ listStylePosition: "inside" }}
          >
            Click through and read the Passport introduction
          </ListGroup.Item>
          <ListGroup.Item
            as="li"
            className="bg-light border-0 px-0 py-1"
            style={{ listStylePosition: "inside" }}
          >
            Click <i>Verify Stamps</i> to add/update your web3 stamps
            automatically
          </ListGroup.Item>
          <ListGroup.Item
            as="li"
            className="bg-light border-0 px-0 py-1"
            style={{ listStylePosition: "inside" }}
          >
            Continue to the <i>Dashboard</i> and verify additional web2 stamps
          </ListGroup.Item>
          <ListGroup.Item
            as="li"
            className="bg-light border-0 px-0 py-1 fw-bold"
            style={{ listStylePosition: "inside" }}
          >
            Earn a Unique Humanity Score of at least 3 before continuing
          </ListGroup.Item>
          <ListGroup.Item as="li" className="bg-light border-0 px-0 py-1">
            Scroll to the bottom of the <i>Dashboard</i> and click{" "}
            <i>Bring Passport Onchain</i>
          </ListGroup.Item>
          <ListGroup.Item
            as="li"
            className="bg-light border-0 px-0 py-1"
            style={{ listStylePosition: "inside" }}
          >
            Click the {network.name} <i>Mint</i> button
          </ListGroup.Item>
          <ListGroup as="ul">
            <ListGroup.Item as="li" className="bg-light border-0 ms-2 py-1">
              &#x2022; Bringing your Passport onchain requires a $2 payment in
              ETH
            </ListGroup.Item>
          </ListGroup>
          <ListGroup.Item
            as="li"
            className="bg-light border-0 px-0 py-1"
            style={{ listStylePosition: "inside" }}
          >
            Sign the minting transaction, await confirmation, & return to the
            SQF UI to open your donation stream
          </ListGroup.Item>
        </ListGroup>
        <Modal.Footer className="border-0 p-0">
          <Button
            variant="danger"
            onClick={hide}
            className="float-end px-5 mt-3"
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal.Body>
    </Modal>
  );
}
