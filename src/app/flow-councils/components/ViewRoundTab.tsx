"use client";

import DynamicFormSection from "./DynamicFormSection";
import type { FormSchema } from "@/app/flow-councils/types/formSchema";

type ViewRoundTabProps = {
  formSchema: FormSchema;
  dynamicValues: Record<string, unknown>;
};

export default function ViewRoundTab(props: ViewRoundTabProps) {
  const { formSchema, dynamicValues } = props;

  return (
    <div>
      <DynamicFormSection
        elements={formSchema.round}
        values={dynamicValues}
        readOnly
      />
    </div>
  );
}
