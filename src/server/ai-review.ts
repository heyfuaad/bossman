import { EventEmitter } from 'events';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import picomatch from 'picomatch';
import { simpleGit, type SimpleGit } from 'simple-git';

import type {
  AIReviewConfig,
  AIReviewEvent,
  AIReviewFinding,
  AIReviewArchitectureComment,
  ReviewContext,
  ReviewFileContext,
} from '../types/ai-review.js';
import type { DiffResponse } from '../types/diff.js';

import { reviewWithClaude } from './ai-providers/claude.js';
import { reviewWithGemini } from './ai-providers/gemini.js';

const CONVENTION_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
];

interface ReviewResult {
  findings: AIReviewFinding[];
  architectureComments: AIReviewArchitectureComment[];
}

export class AIReviewOrchestrator extends EventEmitter {
  private git: SimpleGit;
  private repoPath: string;
  private config: AIReviewConfig;

  constructor(repoPath: string, config: AIReviewConfig) {
    super();
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
    this.config = config;
  }

  // For normal git-based diffs
  async startReview(
    diffData: DiffResponse,
    baseCommitish: string,
    targetCommitish: string,
  ): Promise<void> {
    try {
      const rawDiff = await this.getRawDiff(baseCommitish, targetCommitish);
      if (!rawDiff.trim()) {
        this.emit('event', {
          type: 'complete',
          model: 'claude',
          summary: 'No changes to review.',
        } satisfies AIReviewEvent);
        return;
      }

      const context = await this.buildContext(diffData, rawDiff, baseCommitish, targetCommitish);
      await this.runProviders(context, diffData.files.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.emit('event', {
        type: 'error',
        model: 'claude',
        error: `Review failed: ${message}`,
      } satisfies AIReviewEvent);
    }
  }

  // For stdin/PR diffs where we only have the raw diff text
  async startReviewFromDiff(diffData: DiffResponse, rawDiff: string): Promise<void> {
    try {
      if (!rawDiff.trim()) {
        this.emit('event', {
          type: 'complete',
          model: 'claude',
          summary: 'No changes to review.',
        } satisfies AIReviewEvent);
        return;
      }

      // For stdin diffs we don't have full file contents, only the diff
      const conventions = this.readConventions();
      const context: ReviewContext = {
        diff: rawDiff,
        files: [], // no full file contents available for stdin/PR diffs
        conventions,
      };

      await this.runProviders(context, diffData.files.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.emit('event', {
        type: 'error',
        model: 'claude',
        error: `Review failed: ${message}`,
      } satisfies AIReviewEvent);
    }
  }

  private async runProviders(context: ReviewContext, totalFiles: number): Promise<void> {
    const providers: Array<{
      name: 'claude' | 'gemini';
      run: () => Promise<ReviewResult>;
    }> = [];

    const claudeConfig = this.config.claude;
    if (claudeConfig?.enabled !== false && claudeConfig?.apiKey) {
      providers.push({
        name: 'claude',
        run: () => reviewWithClaude(context, claudeConfig.apiKey, claudeConfig.model),
      });
    }

    const geminiConfig = this.config.gemini;
    if (geminiConfig?.enabled !== false && geminiConfig?.apiKey) {
      providers.push({
        name: 'gemini',
        run: () => reviewWithGemini(context, geminiConfig.apiKey, geminiConfig.model),
      });
    }

    if (providers.length === 0) {
      this.emit('event', {
        type: 'error',
        model: 'claude',
        error: 'No AI providers configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY.',
      } satisfies AIReviewEvent);
      return;
    }

    // Emit progress for each active provider
    for (const provider of providers) {
      this.emit('event', {
        type: 'progress',
        model: provider.name,
        progress: { filesAnalyzed: 0, totalFiles },
      } satisfies AIReviewEvent);
    }

    // Run all providers in parallel
    const results = await Promise.allSettled(
      providers.map(async (provider) => {
        try {
          const result = await provider.run();

          // Emit line-level findings
          for (const finding of result.findings) {
            this.emit('event', {
              type: 'finding',
              model: provider.name,
              finding,
            } satisfies AIReviewEvent);
          }

          // Emit architecture comments
          for (const comment of result.architectureComments) {
            this.emit('event', {
              type: 'architecture',
              model: provider.name,
              architectureComment: comment,
            } satisfies AIReviewEvent);
          }

          this.emit('event', {
            type: 'complete',
            model: provider.name,
            summary: `${result.findings.length} line-level finding${result.findings.length === 1 ? '' : 's'}, ${result.architectureComments.length} architecture observation${result.architectureComments.length === 1 ? '' : 's'}.`,
          } satisfies AIReviewEvent);

          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          this.emit('event', {
            type: 'error',
            model: provider.name,
            error: message,
          } satisfies AIReviewEvent);
          throw err;
        }
      }),
    );

    // Log results summary
    for (const [i, provider] of providers.entries()) {
      const result = results[i];
      if (!result) continue;
      if (result.status === 'fulfilled') {
        console.log(
          `  ${provider.name}: ${result.value.findings.length} findings, ${result.value.architectureComments.length} architecture comments`,
        );
      } else {
        console.error(`  ${provider.name}: failed -`, result.reason);
      }
    }
  }

  private async getRawDiff(base: string, target: string): Promise<string> {
    if (target === 'working') {
      return await this.git.diff();
    }
    if (target === 'staged') {
      return await this.git.diff(['--cached', base]);
    }
    if (target === '.') {
      return await this.git.diff([base]);
    }
    return await this.git.diff([`${base}...${target}`]);
  }

  private async buildContext(
    diffData: DiffResponse,
    rawDiff: string,
    base: string,
    target: string,
  ): Promise<ReviewContext> {
    const conventions = this.readConventions();
    const files: ReviewFileContext[] = [];

    for (const file of diffData.files) {
      const maxSize = (this.config.maxFileSizeKB || 200) * 1024;

      if (this.shouldExclude(file.path)) {
        continue;
      }

      const fileContext: ReviewFileContext = {
        path: file.path,
        status: file.status,
        oldPath: file.oldPath,
      };

      if (file.status !== 'deleted') {
        fileContext.newContent = await this.getFileContent(file.path, target, maxSize);
      }

      if (file.status !== 'added') {
        const oldPath = file.oldPath || file.path;
        fileContext.oldContent = await this.getFileContent(oldPath, base, maxSize);
      }

      files.push(fileContext);
    }

    return { diff: rawDiff, files, conventions };
  }

  private async getFileContent(
    filePath: string,
    ref: string,
    maxSize: number,
  ): Promise<string | undefined> {
    try {
      if (ref === 'working' || ref === '.') {
        const fullPath = join(this.repoPath, filePath);
        if (!existsSync(fullPath)) return undefined;
        const content = readFileSync(fullPath, 'utf-8');
        if (content.length > maxSize) return undefined;
        return content;
      }

      if (ref === 'staged') {
        const content = await this.git.show([`:${filePath}`]);
        if (content.length > maxSize) return undefined;
        return content;
      }

      const content = await this.git.show([`${ref}:${filePath}`]);
      if (content.length > maxSize) return undefined;
      return content;
    } catch {
      return undefined;
    }
  }

  private readConventions(): string | undefined {
    const parts: string[] = [];

    for (const filename of CONVENTION_FILES) {
      const fullPath = join(this.repoPath, filename);
      if (existsSync(fullPath)) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          const truncated =
            content.length > 10000 ? content.slice(0, 10000) + '\n...(truncated)' : content;
          parts.push(`### ${filename}\n${truncated}`);
        } catch {
          // Skip unreadable files
        }
      }
    }

    if (parts.length > 0) {
      const fileNames = CONVENTION_FILES.filter((f) => existsSync(join(this.repoPath, f)));
      console.log(`  Sending project conventions to AI: ${fileNames.join(', ')}`);
    }

    return parts.length > 0 ? parts.join('\n\n') : undefined;
  }

  private shouldExclude(filePath: string): boolean {
    const patterns = this.config.excludePatterns || [];
    const defaultExcludes = [
      '*.lock',
      '*.min.js',
      '*.min.css',
      '*.map',
      'package-lock.json',
      'pnpm-lock.yaml',
      'bun.lock',
      'yarn.lock',
    ];

    const allPatterns = [...defaultExcludes, ...patterns];
    const isMatch = picomatch(allPatterns, { basename: true });
    return isMatch(filePath);
  }
}
