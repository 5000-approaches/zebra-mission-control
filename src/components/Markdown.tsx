"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: (props) => (
    <h1 className="text-2xl font-bold mt-6 mb-3 first:mt-0" {...props} />
  ),
  h2: (props) => (
    <h2 className="text-xl font-semibold mt-5 mb-2 first:mt-0" {...props} />
  ),
  h3: (props) => (
    <h3 className="text-base font-semibold mt-4 mb-2 first:mt-0" {...props} />
  ),
  p: (props) => <p className="my-2 leading-relaxed" {...props} />,
  ul: (props) => <ul className="my-2 ml-5 list-disc space-y-1" {...props} />,
  ol: (props) => <ol className="my-2 ml-5 list-decimal space-y-1" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  em: (props) => <em className="italic" {...props} />,
  hr: () => (
    <hr
      className="my-4 border-0 border-t"
      style={{ borderColor: "var(--page-border)" }}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="my-3 pl-4 py-1 border-l-4 italic"
      style={{
        borderColor: "var(--accent)",
        background: "var(--accent-lighter)",
        color: "var(--accent-darker)",
      }}
      {...props}
    />
  ),
  a: ({ href, ...rest }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
      style={{ color: "var(--accent-dark)" }}
      {...rest}
    />
  ),
  code: ({ className, children, ...rest }) => {
    const isBlock = /language-/.test(className ?? "");
    if (isBlock) {
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="px-1.5 py-0.5 rounded text-[0.9em] font-mono"
        style={{
          background: "var(--page-border)",
          color: "var(--page-text)",
        }}
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: (props) => (
    <pre
      className="my-3 p-3 rounded-lg overflow-x-auto text-sm font-mono"
      style={{
        background: "var(--page-border)",
        color: "var(--page-text)",
      }}
      {...props}
    />
  ),
  table: (props) => (
    <div className="my-3 overflow-x-auto">
      <table
        className="border-collapse text-sm"
        style={{ borderColor: "var(--page-border)" }}
        {...props}
      />
    </div>
  ),
  thead: (props) => (
    <thead style={{ background: "var(--page-border)" }} {...props} />
  ),
  th: (props) => (
    <th
      className="px-3 py-2 text-left font-semibold border"
      style={{ borderColor: "var(--page-border)" }}
      {...props}
    />
  ),
  td: (props) => (
    <td
      className="px-3 py-2 border align-top"
      style={{ borderColor: "var(--page-border)" }}
      {...props}
    />
  ),
};

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
