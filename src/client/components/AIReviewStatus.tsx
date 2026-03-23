import { Bot, RefreshCw, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import type { AIReviewModel } from '../../types/ai-review';

type ModelStatus = 'idle' | 'reviewing' | 'complete' | 'error';

interface ModelState {
  status: ModelStatus;
  findingCount: number;
  error?: string;
  summary?: string;
}

interface AIReviewStatusProps {
  modelStates: Record<AIReviewModel, ModelState>;
  isReviewing: boolean;
  onRerun: () => void;
}

function ModelStatusBadge({ name, state }: { name: string; state: ModelState }) {
  if (state.status === 'idle') return null;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="font-medium text-github-text-secondary">{name}:</span>
      {state.status === 'reviewing' && (
        <span className="flex items-center gap-1 text-blue-400">
          <Loader2 size={12} className="animate-spin" />
          Reviewing...
        </span>
      )}
      {state.status === 'complete' && (
        <span className="flex items-center gap-1 text-green-400">
          <CheckCircle2 size={12} />
          {state.findingCount} finding{state.findingCount === 1 ? '' : 's'}
        </span>
      )}
      {state.status === 'error' && (
        <span className="flex items-center gap-1 text-red-400" title={state.error}>
          <AlertCircle size={12} />
          Error
        </span>
      )}
    </div>
  );
}

export function AIReviewStatus({ modelStates, isReviewing, onRerun }: AIReviewStatusProps) {
  const hasAnyActivity =
    modelStates.claude.status !== 'idle' || modelStates.gemini.status !== 'idle';

  if (!hasAnyActivity) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-github-bg-secondary border border-github-border rounded-md">
      <Bot size={14} className="text-github-text-secondary shrink-0" />
      <ModelStatusBadge name="Claude" state={modelStates.claude} />
      <ModelStatusBadge name="Gemini" state={modelStates.gemini} />
      {!isReviewing && (
        <button
          onClick={onRerun}
          className="flex items-center gap-1 text-xs text-github-text-secondary hover:text-github-text-primary transition-colors ml-1"
          title="Re-run AI review"
        >
          <RefreshCw size={12} />
        </button>
      )}
    </div>
  );
}
