"use client";

import DynamicFormSection from "./DynamicFormSection";
import FundingAddressSection from "./FundingAddressSection";
import type { FormSchema } from "@/app/flow-councils/types/formSchema";

type ViewRoundTabProps = {
  formSchema: FormSchema;
  dynamicValues: Record<string, unknown>;
  fundingAddress?: string;
};

export default function ViewRoundTab(props: ViewRoundTabProps) {
  const { formSchema, dynamicValues, fundingAddress } = props;

  return (
    <div>
      {fundingAddress && (
        <FundingAddressSection
          value={fundingAddress}
          onChange={() => {}}
          defaultFundingAddress=""
          locked
          validated={false}
        />
      )}
      <DynamicFormSection
        elements={formSchema.round}
        values={dynamicValues}
        readOnly
      />
    </div>
  );
}
