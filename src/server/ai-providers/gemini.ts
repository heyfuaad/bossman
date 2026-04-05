import { GoogleGenerativeAI, type ResponseSchema, SchemaType } from '@google/generative-ai';

import type {
  AIReviewFinding,
  AIReviewArchitectureComment,
  ReviewContext,
} from '../../types/ai-review.js';

import { buildSystemPrompt, buildUserPrompt } from './prompt.js';

const GEMINI_RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    findings: {
      type: SchemaType.ARRAY,
      description: 'Line-level findings tied to specific code locations',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          filePath: { type: SchemaType.STRING },
          side: { type: SchemaType.STRING, format: 'enum', enum: ['old', 'new'] },
          line: { type: SchemaType.NUMBER, description: 'Line number from the file content' },
          severity: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['critical', 'important', 'suggestion', 'observation'],
            description:
              'critical=bugs/crashes, important=perf/logic issues, suggestion=specific change recommended, observation=praise or neutral note with NO change suggested',
          },
          title: { type: SchemaType.STRING },
          body: { type: SchemaType.STRING },
        },
        required: ['filePath', 'side', 'line', 'severity', 'title', 'body'],
      },
    },
    architectureComments: {
      type: SchemaType.ARRAY,
      description: 'High-level architecture observations not tied to specific lines',
      items: {
        type: SchemaType.OBJECT,
        properties: {
          severity: {
            type: SchemaType.STRING,
            format: 'enum',
            enum: ['critical', 'important', 'suggestion', 'observation'],
            description:
              'critical=bugs/crashes, important=perf/logic issues, suggestion=specific change recommended, observation=praise or neutral note with NO change suggested',
          },
          title: { type: SchemaType.STRING },
          body: { type: SchemaType.STRING },
          relatedFiles: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
          },
        },
        required: ['severity', 'title', 'body'],
      },
    },
    summary: { type: SchemaType.STRING },
  },
  required: ['findings', 'architectureComments', 'summary'],
};

interface GeminiReviewResult {
  findings: AIReviewFinding[];
  architectureComments: AIReviewArchitectureComment[];
}

export async function reviewWithGemini(
  context: ReviewContext,
  apiKey: string,
  model = 'gemini-2.5-pro',
): Promise<GeminiReviewResult> {
  const genAI = new GoogleGenerativeAI(apiKey);

  const generativeModel = genAI.getGenerativeModel({
    model,
    systemInstruction: buildSystemPrompt(context.conventions),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    },
  });

  const result = await generativeModel.generateContent(buildUserPrompt(context));
  const text = result.response.text();

  let parsed: { findings: AIReviewFinding[]; architectureComments?: AIReviewArchitectureComment[] };
  try {
    parsed = JSON.parse(text) as {
      findings: AIReviewFinding[];
      architectureComments?: AIReviewArchitectureComment[];
    };
  } catch {
    throw new Error(
      `Gemini returned invalid JSON. This can happen due to safety filters or output truncation. Raw response (first 200 chars): ${text.slice(0, 200)}`,
    );
  }

  return {
    findings: parsed.findings || [],
    architectureComments: parsed.architectureComments || [],
  };
}
