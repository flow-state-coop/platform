import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeExternalLinks from "rehype-external-links";
import rehypeStringify from "rehype-stringify";

// Server-side markdown -> sanitized HTML for email bodies. Mirrors the in-app
// react-markdown stack (GFM + single-newline line breaks + external links) so
// emails render the same way the UI does.
//
// Security: the pipeline never enables `rehype-raw`, so any raw HTML a user
// types in a message is treated as text, not markup. `rehype-sanitize` runs
// before stringify as defense-in-depth, dropping unsafe attributes and
// clamping link protocols (e.g. `javascript:` hrefs).
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkBreaks)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeExternalLinks, {
    target: "_blank",
    rel: ["noopener", "noreferrer"],
  })
  .use(rehypeStringify);

export async function renderMarkdownToHtml(markdown: string): Promise<string> {
  if (!markdown) return "";
  const file = await processor.process(markdown);
  return String(file).trim();
}
