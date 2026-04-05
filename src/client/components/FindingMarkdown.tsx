import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { PrismSyntaxHighlighter } from './PrismSyntaxHighlighter';
import type { AppearanceSettings } from './SettingsModal';

const isSafeUrl = (url: string) => /^(https?:|mailto:|#|\.{0,2}\/|\/)/i.test(url.trim());

const isElementWithChildren = (
  node: React.ReactNode,
): node is React.ReactElement<{ children?: React.ReactNode }> => React.isValidElement(node);

const isElementWithCodeProps = (
  node: React.ReactNode,
): node is React.ReactElement<{ className?: string; children?: React.ReactNode }> =>
  React.isValidElement(node);

const extractText = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isElementWithChildren(node)) return extractText(node.props.children);
  return '';
};

interface FindingMarkdownProps {
  body: string;
  syntaxTheme?: AppearanceSettings['syntaxTheme'];
}

export function FindingMarkdown({ body, syntaxTheme }: FindingMarkdownProps) {
  return (
    <div className="text-sm leading-relaxed text-github-text-secondary [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (isSafeUrl(url) ? url : '')}
        components={{
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-github-text-primary">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => {
            const safeHref = href ?? '';
            if (!safeHref || !isSafeUrl(safeHref)) return <span>{children}</span>;
            const isExternal = safeHref.startsWith('http');
            return (
              <a
                href={safeHref}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noreferrer' : undefined}
                className="text-sky-400 hover:text-sky-300 underline underline-offset-2"
              >
                {children}
              </a>
            );
          },
          code: ({ className, children }) => {
            if (className) return <code className={className}>{children}</code>;
            return (
              <code className="rounded bg-github-bg-primary/70 px-1 py-0.5 font-mono text-[12px] text-github-text-primary ring-1 ring-white/5">
                {children}
              </code>
            );
          },
          pre: ({ children }) => {
            const nodes = Array.isArray(children) ? children : [children];
            const codeElement = nodes.find(isElementWithCodeProps);
            const codeText = extractText(codeElement ?? children);
            const match = /language-(\S+)/.exec(codeElement?.props.className ?? '');
            const language = match?.[1];
            const normalized = codeText.replace(/\n$/, '');

            return (
              <pre className="markdown-preview-code my-2 overflow-x-auto rounded-md bg-github-bg-primary/70 p-3 ring-1 ring-white/5 text-[12px]">
                <PrismSyntaxHighlighter
                  code={normalized}
                  language={language}
                  syntaxTheme={syntaxTheme}
                  className="font-mono text-github-text-primary"
                />
              </pre>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-github-border pl-3 text-github-text-muted italic">
              {children}
            </blockquote>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
