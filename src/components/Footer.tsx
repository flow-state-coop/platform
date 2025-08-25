"use client";

import Link from "next/link";
import Stack from "react-bootstrap/Stack";
import Button from "react-bootstrap/Button";
import Image from "react-bootstrap/Image";
import Form from "react-bootstrap/Form";
import InputGroup from "react-bootstrap/InputGroup";
import Toast from "react-bootstrap/Toast";
import Alert from "react-bootstrap/Alert";
import { useMediaQuery } from "@/hooks/mediaQuery";
import useMailingList from "@/hooks/mailingList";

export default function Footer() {
  const { isMobile, isBigScreen } = useMediaQuery();
  const {
    isEmailInvalid,
    setIsEmailInvalid,
    mailingListSubSuccess,
    setMailingListSubSuccess,
    mailingListSubError,
    validated,
    handleMailingListSub,
  } = useMailingList();

  return (
    <footer className="d-flex flex-column align-items-center bg-como-400">
      <Stack
        direction="vertical"
        gap={isMobile ? 0 : 20}
        className="px-2 py-16 px-lg-30 py-lg-30 px-xxl-52"
      >
        <Stack
          direction="horizontal"
          className="justify-content-between flex-wrap"
        >
          <Stack direction="vertical" gap={6} className="mb-20 mb-sm-0">
            <Image src="/logo-light.svg" alt="Logo" width={120} height={120} />
            <Image
              src="/wordmark.svg"
              alt="Flow State"
              width={236}
              height={32}
              style={{
                filter:
                  "brightness(0) saturate(100%) invert(92%) sepia(3%) saturate(657%) hue-rotate(348deg) brightness(107%) contrast(97%)",
              }}
            />
          </Stack>
          <Stack
            direction="vertical"
            gap={isMobile ? 10 : 8}
            className="mb-10 mb-lg-0 me-lg-6"
          >
            <Link
              href="/flow-splitters"
              className="text-decoration-none text-white fs-5 fw-bold"
            >
              Flow Splitters
            </Link>
            <Link
              href="/flow-councils"
              className="text-decoration-none text-white fs-5 fw-bold"
            >
              Flow Council
            </Link>
            <Link
              href="/flow-qf"
              className="text-decoration-none text-white fs-5 fw-bold"
            >
              Flow QF
            </Link>
            <Link
              href="flow-guilds"
              className="text-decoration-none text-white fs-5 fw-bold"
            >
              Flow Guild
            </Link>
          </Stack>
          <Stack direction="vertical" gap={8} className="mb-30 mb-lg-0 me-10">
            <Link
              href="https://docs.flowstate.network"
              target="_blank"
              className="text-decoration-none text-white fs-6 fw-bold"
            >
              Docs
            </Link>
            <Link
              href="https://github.com/flow-state-coop"
              target="_blank"
              className="text-decoration-none text-white fs-6 fw-bold"
            >
              Github
            </Link>
            <Link
              href="https://farcaster.xyz/flowstatecoop"
              target="_blank"
              className="text-decoration-none text-white fs-6 fw-bold"
            >
              Farcaster
            </Link>
            <Link
              href="https://x.com/flowstatecoop"
              target="_blank"
              className="text-decoration-none text-white fs-6 fw-bold"
            >
              X
            </Link>
            <Link
              href="https://t.me/flowstatecoop"
              target="_blank"
              className="text-decoration-none text-white fs-6 fw-bold"
            >
              Telegram
            </Link>
          </Stack>
          <Stack direction="vertical" className="mb-8 mb-lg-0">
            <Form
              noValidate
              validated={validated}
              className="w-100"
              onSubmit={handleMailingListSub}
            >
              <Form.Group>
                <Form.Label className="mb-4 text-white fs-6 fw-bold">
                  Sign up for update
                </Form.Label>
                <InputGroup>
                  <Form.Control
                    type="email"
                    required
                    onChange={(e) => {
                      if (e.target.form?.checkValidity()) {
                        setIsEmailInvalid(false);
                      }
                    }}
                    className="bg-como-500 rounded-start-3 text-white shadow-none outline-none"
                    style={{ height: 69 }}
                  />
                  <Button
                    type="submit"
                    variant="transparent"
                    className="d-flex justify-content-center rounded-end-3 align-items-center bg-white px-4 py-2"
                  >
                    <Image
                      src="/paper-plane.svg"
                      alt="Send"
                      width={32}
                      height={32}
                    />
                  </Button>
                </InputGroup>
                {isEmailInvalid && (
                  <p
                    className="text-danger mt-1"
                    style={{ fontSize: "0.875rem" }}
                  >
                    Please insert a valid email address
                  </p>
                )}
                <Toast
                  show={mailingListSubSuccess}
                  delay={4000}
                  autohide={true}
                  onClose={() => setMailingListSubSuccess(false)}
                  className="mt-2 bg-success px-3 py-2 fs-6 text-white"
                >
                  Success!
                </Toast>
                {mailingListSubError ? (
                  <Alert
                    variant="danger"
                    className="px-3 py-2 mt-2 text-danger"
                  >
                    {mailingListSubError}
                  </Alert>
                ) : null}
              </Form.Group>
            </Form>
          </Stack>
        </Stack>
        <Stack
          direction={isMobile ? "vertical" : "horizontal"}
          gap={isMobile ? 5 : 0}
          className="justify-content-between"
        >
          <span className="text-white">Flow State LCA - &#169; 2025</span>
          <Stack direction="horizontal" gap={10}>
            <Link href="/terms" className="text-white text-decoration-none">
              Term of use
            </Link>
            <Link href="/privacy" className="text-white text-decoration-none">
              Privacy policy
            </Link>
          </Stack>
        </Stack>
      </Stack>
      <span
        className="text-lace-100 overflow-hidden fw-bold"
        style={{
          fontSize: isMobile ? "27vw" : isBigScreen ? "9.55vw" : "10.11vw",
          lineHeight: 0.77,
          marginLeft: isBigScreen ? -10 : -12,
        }}
      >
        MAKE IMPACT FLOW
      </span>
    </footer>
  );
}
