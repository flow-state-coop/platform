"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeExternalLinks from "rehype-external-links";

type MarkdownProps = {
  children: string | undefined;
  className?: string;
};

export default function Markdown({ children, className }: MarkdownProps) {
  if (!children) return null;

  return (
    <ReactMarkdown
      className={className}
      skipHtml={true}
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[[rehypeExternalLinks, { target: "_blank" }]]}
      components={{
        h1: (props) => <h1 className="fs-4 fw-bold" {...props} />,
        h2: (props) => <h2 className="fs-5 fw-bold" {...props} />,
        h3: (props) => <h3 className="fs-6 fw-bold" {...props} />,
        h4: (props) => <h4 className="fs-6 fw-semi-bold" {...props} />,
        h5: (props) => <h5 className="fs-6 fw-semi-bold" {...props} />,
        h6: (props) => <h6 className="fs-6" {...props} />,
        table: (props) => <table className="table table-striped" {...props} />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
