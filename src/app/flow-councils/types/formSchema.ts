export type ElementType = "section" | "description" | "divider";

export type QuestionType =
  | "text"
  | "textarea"
  | "number"
  | "url"
  | "email"
  | "select"
  | "multiSelect"
  | "boolean"
  | "telegram"
  | "ethAddress";

export type FormElementBase = {
  id: string;
  label: string;
};

export type SectionElement = FormElementBase & {
  type: "section";
};

export type DescriptionElement = FormElementBase & {
  type: "description";
  content: string;
};

export type DividerElement = FormElementBase & {
  type: "divider";
};

export type TextQuestion = FormElementBase & {
  type: "text";
  required?: boolean;
  placeholder?: string;
};

export type TextareaQuestion = FormElementBase & {
  type: "textarea";
  required?: boolean;
  placeholder?: string;
  charLimit?: number;
  minCharLimit?: number;
  markdown?: boolean;
};

export type NumberQuestion = FormElementBase & {
  type: "number";
  required?: boolean;
  min?: number;
  max?: number;
};

export type UrlQuestion = FormElementBase & {
  type: "url";
  required?: boolean;
  placeholder?: string;
  baseUrl?: string;
};

export type EmailQuestion = FormElementBase & {
  type: "email";
  required?: boolean;
};

export type SelectQuestion = FormElementBase & {
  type: "select";
  required?: boolean;
  options: string[];
};

export type MultiSelectQuestion = FormElementBase & {
  type: "multiSelect";
  required?: boolean;
  options: string[];
};

export type BooleanQuestion = FormElementBase & {
  type: "boolean";
  required?: boolean;
};

export type TelegramQuestion = FormElementBase & {
  type: "telegram";
  required?: boolean;
};

export type EthAddressQuestion = FormElementBase & {
  type: "ethAddress";
  required?: boolean;
  placeholder?: string;
};

export type FormElement =
  | SectionElement
  | DescriptionElement
  | TextQuestion
  | TextareaQuestion
  | NumberQuestion
  | UrlQuestion
  | EmailQuestion
  | SelectQuestion
  | MultiSelectQuestion
  | BooleanQuestion
  | TelegramQuestion
  | EthAddressQuestion
  | DividerElement;

export type FormSchema = {
  round: FormElement[];
  attestation: FormElement[];
};

// Stable UUIDs for templates — hardcoded so they never change across deploys
export const MINIMAL_TEMPLATE: FormSchema = {
  round: [
    {
      id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      type: "textarea",
      label: "Tell us about your goals for this round",
      required: true,
      placeholder:
        "Describe what your project aims to achieve during this round.",
    },
  ],
  attestation: [
    {
      id: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      type: "email",
      label: "Contact Email",
      required: true,
    },
  ],
};

export const GOODBUILDERS_TEMPLATE: FormSchema = {
  round: [
    // Section 1: Previous Participation
    { id: "gb-r-s01", type: "section", label: "1. Previous Participation" },
    {
      id: "gb-r-q01",
      type: "boolean",
      label: "Have you participated in GoodBuilders before?",
      required: true,
    },
    {
      id: "gb-r-q02",
      type: "number",
      label: "Number of Rounds",
    },
    {
      id: "gb-r-q03",
      type: "url",
      label: "Previous Karma Updates",
      placeholder: "https://karmahq.xyz/project/...",
    },
    {
      id: "gb-r-q04",
      type: "textarea",
      label: "What's the current state of your project today?",
      required: true,
      charLimit: 2000,
      placeholder:
        "Progress made, milestones completed, blockers, and what you've been up to.",
    },
    // Section 2: Maturity & Usage
    { id: "gb-r-s02", type: "section", label: "2. Maturity & Usage" },
    {
      id: "gb-r-q05",
      type: "select",
      label: "Project Stage",
      required: true,
      options: [
        "Early stage",
        "Live product",
        "Mature product with active users",
      ],
    },
    {
      id: "gb-r-q06",
      type: "number",
      label: "Lifetime Users (0 is valid if you're early)",
      required: true,
    },
    {
      id: "gb-r-q07",
      type: "number",
      label: "Active Users",
      required: true,
    },
    {
      id: "gb-r-q08",
      type: "select",
      label: "Active Users Frequency",
      required: true,
      options: [
        "Daily Active Users",
        "Weekly Active Users",
        "Monthly Active Users",
      ],
    },
    {
      id: "gb-r-q09",
      type: "textarea",
      label: "Other relevant usage data (if available)",
    },
    // Section 3: Integration
    { id: "gb-r-s03", type: "section", label: "3. Integration" },
    {
      id: "gb-r-q10",
      type: "select",
      label: "G$ Integration Status",
      required: true,
      options: ["Live", "Ready soon", "Planned (eligible only if delivered)"],
    },
    {
      id: "gb-r-q11",
      type: "multiSelect",
      label: "Integration Type",
      required: true,
      options: [
        "Payments/rewards using G$",
        "Identity",
        "Claim flow",
        "GoodCollective pools",
        "G$ Supertoken/streaming",
        "Activity fees → UBI Pool",
        "Other",
      ],
    },
    {
      id: "gb-r-q12",
      type: "textarea",
      label: "Describe your G$ integration & why it matters (1-3 sentences)",
      required: true,
      placeholder: "Value for users + GoodDollar ecosystem",
    },
    // Section 4: What you'll build
    { id: "gb-r-s04", type: "section", label: "4. What you'll build" },
    {
      id: "gb-r-q13",
      type: "textarea",
      label: "Primary Build Goal (1 sentence)",
      required: true,
      placeholder:
        "A clear statement of your team's main objective for building in this round.",
    },
    {
      id: "gb-r-q14",
      type: "textarea",
      label: "Build Milestones",
      required: true,
      placeholder:
        "List your build milestones with titles, descriptions, and deliverables.",
    },
    {
      id: "gb-r-q15",
      type: "textarea",
      label: "Ecosystem Impact (1-2 sentences)",
      placeholder: "Why your build matters for the GoodDollar ecosystem.",
      charLimit: 500,
    },
    // Section 5: How you'll grow
    { id: "gb-r-s05", type: "section", label: "5. How you'll grow" },
    {
      id: "gb-r-q16",
      type: "textarea",
      label: "Primary Growth Goal (1 sentence)",
      required: true,
      placeholder: "What you aim to grow or activate during this round.",
    },
    {
      id: "gb-r-q17",
      type: "textarea",
      label: "Target Users, Communities, and/or Partners",
      required: true,
      placeholder: "Who will drive this growth?",
    },
    {
      id: "gb-r-q18",
      type: "textarea",
      label: "Growth Milestones",
      required: true,
      placeholder:
        "List your growth milestones with titles, descriptions, and activations.",
    },
    {
      id: "gb-r-q19",
      type: "textarea",
      label: "Ecosystem Impact (1-2 sentences)",
      placeholder: "Why your growth matters for the GoodDollar ecosystem.",
      charLimit: 500,
    },
    // Section 6: Team
    { id: "gb-r-s06", type: "section", label: "6. Team" },
    {
      id: "gb-r-q20",
      type: "text",
      label: "Primary Contact Name",
      required: true,
    },
    {
      id: "gb-r-q21",
      type: "textarea",
      label: "Primary Contact Role Description",
      required: true,
    },
    {
      id: "gb-r-q22",
      type: "telegram",
      label: "Primary Contact Telegram",
    },
    {
      id: "gb-r-q23",
      type: "url",
      label: "Primary Contact GitHub or LinkedIn",
    },
    {
      id: "gb-r-q24",
      type: "textarea",
      label: "Additional Teammates",
      placeholder: "Name, role, telegram, GitHub/LinkedIn for each teammate.",
    },
    // Section 7: Additional
    { id: "gb-r-s07", type: "section", label: "7. Additional" },
    {
      id: "gb-r-q25",
      type: "textarea",
      label: "Additional comments",
      placeholder: "Provide any additional context or comments.",
    },
  ],
  attestation: [
    // Section 1: Commitment
    { id: "gb-a-s01", type: "section", label: "1. Commitment" },
    {
      id: "gb-a-q01",
      type: "boolean",
      label:
        "If accepted into GoodBuilders, I agree to: post progress updates, join Demo Days, join office hours, share KPI data, communicate in program channels, and provide feedback.",
      required: true,
    },
    // Section 2: Identity & KYC
    { id: "gb-a-s02", type: "section", label: "2. Identity & KYC" },
    {
      id: "gb-a-q02",
      type: "select",
      label: "Recipient Type",
      required: true,
      options: ["Individual", "Organization"],
    },
    {
      id: "gb-a-q03",
      type: "text",
      label: "Legal Name / Company Name",
      required: true,
    },
    {
      id: "gb-a-q04",
      type: "text",
      label: "Country of residence / registration",
      required: true,
    },
    {
      id: "gb-a-q05",
      type: "text",
      label: "Address",
      required: true,
    },
    {
      id: "gb-a-q06",
      type: "email",
      label: "Contact Email",
      required: true,
    },
    // Section 3: Data Acknowledgement
    { id: "gb-a-s03", type: "section", label: "3. Data Acknowledgement" },
    {
      id: "gb-a-q07",
      type: "boolean",
      label:
        "I consent to the collection and use of my data for the purposes of participating in the GoodBuilders program and receiving a grant via the Flow State platform.",
      required: true,
    },
    // Section 4: Privacy & Transparency
    { id: "gb-a-s04", type: "section", label: "4. Privacy & Transparency" },
    {
      id: "gb-a-q08",
      type: "boolean",
      label:
        "I acknowledge and agree to the public accountability, on-chain records, strategic use of data, confidentiality, analytics, and marketing terms.",
      required: true,
    },
  ],
};
