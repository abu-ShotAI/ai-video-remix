/**
 * MCP Layer — thin abstraction over ShotAIClient
 *
 * Adds:
 *   - validateShots(): quality-score filtering before Remotion placement
 *   - resolveVideoPath(): one-call helper (searchShots doesn't return path directly)
 */
import { ShotAIClient, Shot, Video } from '../shotai/client';

export { Shot };

export interface ValidatedShot extends Shot {
  /** Composite quality score 0–1 */
  score: number;
}

/**
 * Score a shot based on available metadata (no extra MCP round-trip needed).
 *
 * Weights:
 *   similarity  × 0.50  — semantic match to the query
 *   duration fit × 0.30  — prefer clips between 3–10 s
 *   mood tag    × 0.20  — bonus if tags contain expected mood keywords
 */
function scoreShot(shot: Shot, expectedMood?: string): number {
  const sim = shot.similarity ?? 0;

  const dur = shot.endTime - shot.startTime;
  const durScore =
    dur < 1  ? 0.1 :
    dur < 3  ? 0.5 :
    dur <= 10 ? 1.0 :
    dur <= 15 ? 0.7 : 0.4;

  let moodScore = 0.5; // neutral
  if (expectedMood && shot.tags?.mood) {
    const shotMood = shot.tags.mood.toLowerCase();
    const want     = expectedMood.toLowerCase();
    if (shotMood.includes(want) || want.includes(shotMood)) moodScore = 1.0;
    else if (isCompatibleMood(want, shotMood))              moodScore = 0.75;
    else                                                    moodScore = 0.3;
  }

  return sim * 0.50 + durScore * 0.30 + moodScore * 0.20;
}

function isCompatibleMood(want: string, got: string): boolean {
  const energetic = ['energetic', 'dynamic', 'fast', 'action', 'urban', 'busy'];
  const calm      = ['calm', 'peaceful', 'slow', 'serene', 'quiet', 'relaxed'];
  const inGroup   = (g: string[], s: string) => g.some(k => s.includes(k));
  if (inGroup(energetic, want) && inGroup(energetic, got)) return true;
  if (inGroup(calm, want)      && inGroup(calm, got))      return true;
  return false;
}

export interface SearchAndValidateOptions {
  limit?: number;
  minScore?: number;
  expectedMood?: string;
  videoId?: string;
}

export class MCPProvider {
  constructor(private client: ShotAIClient) {}

  /**
   * Search shots and return them ranked by quality score.
   * Shots below minScore are excluded.
   */
  async searchAndValidate(
    query: string,
    opts: SearchAndValidateOptions = {},
  ): Promise<ValidatedShot[]> {
    const { limit = 8, minScore = 0.45, expectedMood, videoId } = opts;

    const shots = await this.client.searchShots(query, { limit, videoId });
    const scored = shots
      .map(s => ({ ...s, score: scoreShot(s, expectedMood) }))
      .filter(s => s.score >= minScore)
      .sort((a, b) => b.score - a.score);

    return scored;
  }

  /** Resolve the local file path for a shot's source video. */
  async resolveVideoPath(shot: Shot): Promise<string> {
    const video: Video = await this.client.getVideo(shot.videoId);
    return video.path;
  }

  /** Search + validate + resolve path, return best N shots with path attached. */
  async pickShots(
    query: string,
    count: number,
    opts: SearchAndValidateOptions = {},
    retries = 1,
  ): Promise<Array<ValidatedShot & { videoPath: string }>> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const validated = await this.searchAndValidate(query, { ...opts, limit: count * 3 });
        const top = validated.slice(0, count);

        const results: Array<ValidatedShot & { videoPath: string }> = [];
        for (const shot of top) {
          const videoPath = await this.resolveVideoPath(shot);
          results.push({ ...shot, videoPath });
        }

        if (results.length < count) {
          console.warn(`   ⚠  query "${query}": wanted ${count}, got ${results.length}`);
        }
        return results;
      } catch (err) {
        if (attempt < retries) {
          console.warn(`   ↩  query "${query}" attempt ${attempt + 1} failed (${(err as Error).message}), retrying...`);
        } else {
          console.warn(`   ⚠  query "${query}" failed after ${retries + 1} attempts: ${(err as Error).message}`);
          return [];
        }
      }
    }
    return [];
  }
}
