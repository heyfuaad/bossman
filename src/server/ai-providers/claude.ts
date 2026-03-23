import Anthropic from '@anthropic-ai/sdk';

import type {
  AIReviewFinding,
  AIReviewArchitectureComment,
  ReviewContext,
} from '../../types/ai-review.js';

import { buildSystemPrompt, buildUserPrompt, AI_REVIEW_RESPONSE_SCHEMA } from './prompt.js';

interface ClaudeReviewResult {
  findings: AIReviewFinding[];
  architectureComments: AIReviewArchitectureComment[];
}

export async function reviewWithClaude(
  context: ReviewContext,
  apiKey: string,
  model = 'claude-sonnet-4-20250514',
): Promise<ClaudeReviewResult> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: buildSystemPrompt(context.conventions),
    messages: [{ role: 'user', content: buildUserPrompt(context) }],
    tools: [
      {
        name: 'submit_review_findings',
        description:
          'Submit code review findings with specific file locations and severity levels, plus architecture-level observations',
        input_schema: AI_REVIEW_RESPONSE_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_review_findings' },
  });

  // Extract findings from tool_use response
  for (const block of response.content) {
    if (block.type === 'tool_use' && block.name === 'submit_review_findings') {
      const input = block.input as {
        findings: AIReviewFinding[];
        architectureComments?: AIReviewArchitectureComment[];
      };
      return {
        findings: input.findings || [],
        architectureComments: input.architectureComments || [],
      };
    }
  }

  return { findings: [], architectureComments: [] };
}
