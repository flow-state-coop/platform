"use client";

import Modal from "react-bootstrap/Modal";
import ProjectTab from "./ProjectTab";
import { Project } from "@/types/project";

type ProjectModalProps = {
  show: boolean;
  chainId: number;
  csrfToken: string;
  handleClose: () => void;
  onProjectCreated: () => void;
  mode: "create" | "edit";
  project: Project | null;
};

export default function ProjectModal(props: ProjectModalProps) {
  const {
    show,
    chainId,
    csrfToken,
    handleClose,
    onProjectCreated,
    mode,
    project,
  } = props;

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
        <Modal.Title className="fs-5 fw-semi-bold">
          {mode === "create" ? "Create Project" : "Edit Project"}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-4">
        <ProjectTab
          chainId={chainId}
          csrfToken={csrfToken}
          project={project}
          isLoading={false}
          onSave={() => {
            onProjectCreated();
            handleClose();
          }}
          onCancel={handleClose}
        />
      </Modal.Body>
    </Modal>
  );
}
