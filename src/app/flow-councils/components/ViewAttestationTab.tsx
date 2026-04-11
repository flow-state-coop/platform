"use client";

import DynamicFormSection from "./DynamicFormSection";
import type { FormSchema } from "@/app/flow-councils/types/formSchema";

type ViewAttestationTabProps = {
  formSchema: FormSchema;
  dynamicValues: Record<string, unknown>;
};

export default function ViewAttestationTab(props: ViewAttestationTabProps) {
  const { formSchema, dynamicValues } = props;

  return (
    <div>
      <DynamicFormSection
        elements={formSchema.attestation}
        values={dynamicValues}
        readOnly
      />
    </div>
  );
}
