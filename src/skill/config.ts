/**
 * Skill configuration — edit this file to customise providers and output paths.
 * All values can be overridden via environment variables (see .env).
 */
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

// ─── Agent ────────────────────────────────────────────────────────────────────
export interface AgentConfig {
  provider: 'claude' | 'openai' | 'openai-compat' | 'none';
  apiKey?: string;
  model?: string;
  /** Only for 'openai-compat': base URL of the compatible endpoint */
  baseUrl?: string;
}

// ─── MCP (ShotAI) ─────────────────────────────────────────────────────────────
export interface MCPConfig {
  baseUrl: string;
  token: string;
}

// ─── Music ────────────────────────────────────────────────────────────────────
export interface MusicConfig {
  provider: 'youtube' | 'local';
  /** Absolute path to a local MP3 — when set, overrides YouTube search */
  localPath?: string;
}

// ─── Output ───────────────────────────────────────────────────────────────────
export interface OutputConfig {
  dir: string;
  clipsDir: string;
  filePort: number;
}

// ─── Validation ───────────────────────────────────────────────────────────────
export interface ValidationConfig {
  /** Minimum composite shot quality score 0–1 */
  minScore: number;
  /** How many times to retry a failed MCP query */
  maxRetries: number;
}

// ─── Full skill config ────────────────────────────────────────────────────────
export interface SkillConfig {
  agent:      AgentConfig;
  mcp:        MCPConfig;
  music:      MusicConfig;
  output:     OutputConfig;
  validation: ValidationConfig;
}

const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR ?? path.join(process.cwd(), 'output'));

export const config: SkillConfig = {
  agent: {
    provider: (process.env.AGENT_PROVIDER as AgentConfig['provider']) ?? 'claude',
    apiKey:   process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.OPENAI_COMPAT_API_KEY,
    model:    process.env.AGENT_MODEL ?? 'claude-sonnet-4-6',
    baseUrl:  process.env.OPENAI_COMPAT_BASE_URL,
  },
  mcp: {
    baseUrl: process.env.SHOTAI_URL   ?? 'http://127.0.0.1:23817',
    token:   process.env.SHOTAI_TOKEN ?? '',
  },
  music: {
    provider:  process.env.BGM_PATH ? 'local' : 'youtube',
    localPath: process.env.BGM_PATH,
  },
  output: {
    dir:      OUTPUT_DIR,
    clipsDir: path.join(OUTPUT_DIR, 'city-clips'),
    filePort: parseInt(process.env.FILE_PORT ?? '9877'),
  },
  validation: {
    minScore:   parseFloat(process.env.MIN_SCORE  ?? '0.5'),
    maxRetries: parseInt(process.env.MAX_RETRIES  ?? '1'),
  },
};
