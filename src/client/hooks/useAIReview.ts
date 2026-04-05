import { useState, useEffect, useCallback, useRef } from 'react';

import type {
  AIReviewEvent,
  AIReviewFinding,
  AIReviewArchitectureComment,
  AIReviewModel,
} from '../../types/ai-review';
import type { DiffComment } from '../../types/diff';
import { resolveEventSourceUrl } from '../utils/eventSourceUrl';
import { getLanguageFromPath } from '../utils/diffUtils';

type ModelStatus = 'idle' | 'reviewing' | 'complete' | 'error';

interface ModelState {
  status: ModelStatus;
  findingCount: number;
  error?: string;
  summary?: string;
}

export interface ArchitectureComment {
  id: string;
  model: AIReviewModel;
  severity: 'critical' | 'important' | 'suggestion' | 'observation';
  title: string;
  body: string;
  relatedFiles?: string[];
}

interface UseAIReviewReturn {
  aiComments: DiffComment[];
  architectureComments: ArchitectureComment[];
  isReviewing: boolean;
  modelStates: Record<AIReviewModel, ModelState>;
  rerunReview: () => void;
}

const DEFAULT_MODEL_STATE: ModelState = {
  status: 'idle',
  findingCount: 0,
};

function findingToComment(finding: AIReviewFinding, model: AIReviewModel): DiffComment {
  const severityEmoji =
    finding.severity === 'critical'
      ? '🔴'
      : finding.severity === 'important'
        ? '🟠'
        : finding.severity === 'observation'
          ? '🟢'
          : '🟡';

  let body = `${severityEmoji} **${finding.title}**\n\n${finding.body}`;

  if (finding.suggestion) {
    body += `\n\n\`\`\`suggestion\n${finding.suggestion.replacement}\n\`\`\``;
  }

  return {
    id: crypto.randomUUID(),
    filePath: finding.filePath,
    body,
    author: model === 'claude' ? 'Claude' : 'Gemini',
    severity: finding.severity,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    position: {
      side: finding.side,
      line: finding.line,
    },
    codeSnapshot: finding.suggestion
      ? {
          content: finding.suggestion.original,
          language: getLanguageFromPath(finding.filePath),
        }
      : undefined,
  };
}

// Heuristic: if the body contains action-oriented language, the comment is likely
// actionable. Otherwise it's praise/neutral and should be reclassified as observation.
const ACTION_PATTERN =
  /\b(consider|should|could|must|need to|recommend|suggest|avoid|instead|replace|rename|refactor|extract|move|change|fix|add|remove|ensure|validate|handle|missing|lacks?|risk|danger|bug|vulnerability|issue|problem|error)\b/i;

function inferSeverity(
  comment: AIReviewArchitectureComment,
): AIReviewArchitectureComment['severity'] {
  if (comment.severity === 'observation') return 'observation';
  if (comment.severity === 'critical') return 'critical';

  const hasAction = ACTION_PATTERN.test(comment.body) || ACTION_PATTERN.test(comment.title);
  if (!hasAction) return 'observation';

  return comment.severity;
}

function archCommentToState(
  comment: AIReviewArchitectureComment,
  model: AIReviewModel,
): ArchitectureComment {
  return {
    id: crypto.randomUUID(),
    model,
    severity: inferSeverity(comment),
    title: comment.title,
    body: comment.body,
    relatedFiles: comment.relatedFiles,
  };
}

export function useAIReview(autoStart: boolean): UseAIReviewReturn {
  const [aiComments, setAIComments] = useState<DiffComment[]>([]);
  const [architectureComments, setArchitectureComments] = useState<ArchitectureComment[]>([]);
  const [modelStates, setModelStates] = useState<Record<AIReviewModel, ModelState>>({
    claude: { ...DEFAULT_MODEL_STATE },
    gemini: { ...DEFAULT_MODEL_STATE },
  });
  const hasAutoStarted = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startReview = useCallback((forceRerun = false) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setAIComments([]);
    setArchitectureComments([]);
    setModelStates({
      claude: { ...DEFAULT_MODEL_STATE },
      gemini: { ...DEFAULT_MODEL_STATE },
    });

    const base = resolveEventSourceUrl('/api/ai-review');
    const url = forceRerun ? `${base}${base.includes('?') ? '&' : '?'}rerun=true` : base;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as AIReviewEvent | { type: 'done' };

        if (data.type === 'done') {
          es.close();
          return;
        }

        const reviewEvent = data as AIReviewEvent;

        switch (reviewEvent.type) {
          case 'finding': {
            if (reviewEvent.finding) {
              const comment = findingToComment(reviewEvent.finding, reviewEvent.model);
              setAIComments((prev) => [...prev, comment]);
              setModelStates((prev) => ({
                ...prev,
                [reviewEvent.model]: {
                  ...prev[reviewEvent.model],
                  findingCount: (prev[reviewEvent.model]?.findingCount ?? 0) + 1,
                },
              }));
            }
            break;
          }
          case 'architecture': {
            if (reviewEvent.architectureComment) {
              const archComment = archCommentToState(
                reviewEvent.architectureComment,
                reviewEvent.model,
              );
              setArchitectureComments((prev) => [...prev, archComment]);
              setModelStates((prev) => ({
                ...prev,
                [reviewEvent.model]: {
                  ...prev[reviewEvent.model],
                  findingCount: (prev[reviewEvent.model]?.findingCount ?? 0) + 1,
                },
              }));
            }
            break;
          }
          case 'complete': {
            setModelStates((prev) => ({
              ...prev,
              [reviewEvent.model]: {
                ...prev[reviewEvent.model],
                status: 'complete' as ModelStatus,
                summary: reviewEvent.summary,
              },
            }));
            break;
          }
          case 'error': {
            setModelStates((prev) => ({
              ...prev,
              [reviewEvent.model]: {
                ...prev[reviewEvent.model],
                status: 'error' as ModelStatus,
                error: reviewEvent.error,
              },
            }));
            break;
          }
          case 'progress': {
            setModelStates((prev) => ({
              ...prev,
              [reviewEvent.model]: {
                ...prev[reviewEvent.model],
                status: 'reviewing' as ModelStatus,
              },
            }));
            break;
          }
        }
      } catch {
        // Ignore parse errors for malformed events
      }
    };

    es.onerror = () => {
      es.close();
      setModelStates((prev) => {
        const next = { ...prev };
        for (const model of ['claude', 'gemini'] as const) {
          if (next[model]?.status === 'reviewing') {
            next[model] = {
              ...next[model],
              status: 'error',
              error: 'Connection lost',
            };
          }
        }
        return next;
      });
    };
  }, []);

  // Auto-start on mount (once)
  useEffect(() => {
    if (!autoStart || hasAutoStarted.current) return;
    hasAutoStarted.current = true;

    const timer = setTimeout(() => startReview(), 1000);
    return () => clearTimeout(timer);
  }, [autoStart, startReview]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const rerunReview = useCallback(() => {
    startReview(true);
  }, [startReview]);

  const isReviewing =
    modelStates.claude.status === 'reviewing' || modelStates.gemini.status === 'reviewing';

  return {
    aiComments,
    architectureComments,
    isReviewing,
    modelStates,
    rerunReview,
  };
}
