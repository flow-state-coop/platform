import type { FormSchema } from "@/app/flow-councils/types/formSchema";

export function generateApplicationTemplate(
  formSchema: FormSchema,
  roundName?: string,
): { content: string; filename: string } {
  const lines: string[] = ["# Application Template\n"];
  lines.push("## Project Information\n");
  lines.push("- **Project Name*** — text");
  lines.push("- **Manager Addresses*** — ETH addresses");
  lines.push("- **Description*** — 200–5000 characters, markdown");
  lines.push("- **Logo*** — 1:1 image upload");
  lines.push("- **Banner*** — 3:1 image upload");
  lines.push("- **Website*** — URL");
  lines.push("- **Demo URL** — URL");
  lines.push("- **X/Twitter** — handle or URL");
  lines.push("- **Farcaster** — handle or URL");
  lines.push("- **Telegram** — group URL");
  lines.push("- **Discord** — channel URL");
  lines.push("- **GitHub Repos*** — repository URLs");
  lines.push("- **Smart Contracts** — addresses + chain");
  lines.push("- **Other Links** — label + URL\n");
  lines.push("- **Wallet to receive funding*** — ETH address\n");

  const renderElements = (
    elements: FormSchema["round"],
    sectionTitle: string,
  ) => {
    if (elements.length === 0) return;
    lines.push(`## ${sectionTitle}\n`);

    const hasSections = elements.some((el) => el.type === "section");
    let sectionIndex = 0;
    let questionIndex = 0;

    for (const el of elements) {
      if (el.type === "section") {
        sectionIndex++;
        questionIndex = 0;
        lines.push(`### ${el.label}\n`);
      } else if (el.type === "description") {
        lines.push(`${el.content || ""}\n`);
      } else if (el.type === "divider") {
        lines.push("---\n");
      } else {
        questionIndex++;
        const num = hasSections
          ? `${sectionIndex}.${questionIndex}`
          : `${questionIndex}`;
        const req = "required" in el && el.required ? "*" : "";
        const typeName =
          el.type === "textarea"
            ? "long text"
            : el.type === "multiSelect"
              ? "multi select"
              : el.type === "ethAddress"
                ? "ETH address"
                : el.type;
        lines.push(`- **${num}. ${el.label}**${req} — ${typeName}`);
      }
    }
    lines.push("");
  };

  renderElements(formSchema.round, "Round Questions");
  renderElements(formSchema.attestation, "Attestation");

  const slug = (roundName ?? "application")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const date = new Date().toISOString().split("T")[0];
  const filename = `${slug}-${date}-application-template.md`;

  return { content: lines.join("\n"), filename };
}
