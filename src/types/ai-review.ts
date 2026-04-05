export type AIReviewSeverity = 'critical' | 'important' | 'suggestion' | 'observation';
export type AIReviewModel = 'claude' | 'gemini';

export interface AIReviewFinding {
  filePath: string;
  side: 'old' | 'new';
  line: number | { start: number; end: number };
  severity: AIReviewSeverity;
  title: string;
  body: string;
  suggestion?: {
    original: string;
    replacement: string;
  };
}

// Architecture-level observations that aren't tied to a specific line
export interface AIReviewArchitectureComment {
  severity: AIReviewSeverity;
  title: string;
  body: string;
  relatedFiles?: string[]; // files this observation relates to
}

export interface AIReviewEvent {
  type: 'finding' | 'architecture' | 'complete' | 'error' | 'progress';
  model: AIReviewModel;
  finding?: AIReviewFinding;
  architectureComment?: AIReviewArchitectureComment;
  summary?: string;
  error?: string;
  progress?: { filesAnalyzed: number; totalFiles: number };
}

export interface AIReviewConfig {
  claude?: {
    apiKey: string;
    model?: string;
    enabled?: boolean;
  };
  gemini?: {
    apiKey: string;
    model?: string;
    enabled?: boolean;
  };
  autoReview: boolean;
  maxFileSizeKB: number;
  excludePatterns: string[];
}

export interface ReviewContext {
  diff: string;
  files: ReviewFileContext[];
  conventions?: string;
}

export interface ReviewFileContext {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  oldPath?: string;
  newContent?: string;
  oldContent?: string;
}
