import { Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import type { ArchitectureComment } from '../hooks/useAIReview';

interface AIArchitecturePanelProps {
  comments: ArchitectureComment[];
}

function SeverityBadge({ severity }: { severity: ArchitectureComment['severity'] }) {
  const config = {
    critical: { label: 'Critical', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
    important: {
      label: 'Important',
      className: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    },
    improvement: {
      label: 'Improvement',
      className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    },
  };

  const { label, className } = config[severity];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${className}`}
    >
      {label}
    </span>
  );
}

function ArchitectureCard({ comment }: { comment: ArchitectureComment }) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="border border-purple-600/30 border-l-4 border-l-purple-400 rounded-md bg-github-bg-tertiary">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 p-3 text-left cursor-pointer hover:bg-github-bg-secondary/50 transition-colors"
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <SeverityBadge severity={comment.severity} />
        <span className="text-sm font-medium text-github-text-primary flex-1">{comment.title}</span>
        <span className="text-[11px] text-github-text-secondary">
          {comment.model === 'claude' ? 'Claude' : 'Gemini'}
        </span>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 pt-0">
          <p className="text-sm text-github-text-secondary leading-relaxed whitespace-pre-wrap">
            {comment.body}
          </p>
          {comment.relatedFiles && comment.relatedFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {comment.relatedFiles.map((file) => (
                <span
                  key={file}
                  className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-github-bg-secondary text-github-text-secondary border border-github-border"
                >
                  {file}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AIArchitecturePanel({ comments }: AIArchitecturePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (comments.length === 0) return null;

  return (
    <div className="mx-4 mb-4 border border-github-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-github-bg-secondary hover:bg-github-bg-tertiary transition-colors cursor-pointer"
      >
        <Layers size={16} className="text-purple-400" />
        <span className="text-sm font-semibold text-github-text-primary">
          Architecture Observations
        </span>
        <span className="text-xs text-github-text-secondary">({comments.length})</span>
        {isCollapsed ? (
          <ChevronRight size={14} className="ml-auto" />
        ) : (
          <ChevronDown size={14} className="ml-auto" />
        )}
      </button>
      {!isCollapsed && (
        <div className="p-3 flex flex-col gap-2">
          {comments.map((comment) => (
            <ArchitectureCard key={comment.id} comment={comment} />
          ))}
        </div>
      )}
    </div>
  );
}
