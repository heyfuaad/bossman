import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import type { AIReviewConfig } from '../types/ai-review.js';

interface CLIAIOptions {
  aiModelClaude?: string;
  aiModelGemini?: string;
  aiReview?: boolean; // --no-ai-review sets this to false
}

export function resolveAIConfig(cliOptions: CLIAIOptions): AIReviewConfig {
  // Load config file (~/.config/difit/config.json)
  const fileConfig = loadConfigFile();

  // Resolve API keys: env var > config file (no CLI flags for security)
  const claudeKey = process.env.ANTHROPIC_API_KEY || fileConfig?.claude?.apiKey;

  const geminiKey = process.env.GEMINI_API_KEY || fileConfig?.gemini?.apiKey;

  return {
    claude: claudeKey
      ? {
          apiKey: claudeKey,
          model: cliOptions.aiModelClaude || fileConfig?.claude?.model,
          enabled: true,
        }
      : undefined,
    gemini: geminiKey
      ? {
          apiKey: geminiKey,
          model: cliOptions.aiModelGemini || fileConfig?.gemini?.model,
          enabled: true,
        }
      : undefined,
    autoReview: cliOptions.aiReview !== false,
    maxFileSizeKB: fileConfig?.maxFileSizeKB || 200,
    excludePatterns: fileConfig?.excludePatterns || [],
  };
}

function loadConfigFile(): Partial<AIReviewConfig> | null {
  const configPath = join(homedir(), '.config', 'difit', 'config.json');

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as Partial<AIReviewConfig>;
  } catch {
    return null;
  }
}
