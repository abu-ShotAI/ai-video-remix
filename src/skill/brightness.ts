/**
 * Keyframe Region Brightness Analyzer
 *
 * Uses ffprobe signalstats to sample the average Y (luma) brightness of a
 * specific region in a keyframe image. All coordinates are expressed as
 * fractions of the image dimensions (0–1), so they work regardless of the
 * thumbnail resolution ShotAI uses.
 *
 * Returns a value 0–255. Threshold for "needs dark overlay": > 140.
 */
import { execFileSync } from 'child_process';

export interface RegionRect {
  /** Left edge as fraction of image width  (0–1) */
  x: number;
  /** Top edge as fraction of image height (0–1) */
  y: number;
  /** Width as fraction of image width    (0–1) */
  w: number;
  /** Height as fraction of image height  (0–1) */
  h: number;
}

/**
 * Named region presets — keyed by composition + element.
 * Derived from Remotion canvas (1920×1080) layout analysis.
 *
 * Convention: regions cover where the TEXT itself sits, not the gradient.
 * We want to know whether the VIDEO at that spot is bright enough to hide
 * white text, which determines whether we need a protective overlay.
 */
export const TEXT_REGIONS: Record<string, RegionRect> = {
  // NatureWild: NarrativeLabel — bottom-left, bottom 24%, left 50%
  'NatureWild.caption':       { x: 0,    y: 0.76, w: 0.50, h: 0.24 },

  // SwitzerlandScenic: CaptionCard — bottom center, bottom 26%
  'SwitzerlandScenic.caption': { x: 0.15, y: 0.74, w: 0.70, h: 0.26 },

  // SwitzerlandScenic: CoordWatermark — top-right corner
  'SwitzerlandScenic.watermark': { x: 0.85, y: 0.00, w: 0.15, h: 0.10 },

  // SportsHighlight: SportTag — top-left corner
  'SportsHighlight.sportTag':  { x: 0.00, y: 0.00, w: 0.35, h: 0.11 },

  // SportsHighlight: DramaticCaption — bottom center, bottom 22%
  'SportsHighlight.caption':   { x: 0.10, y: 0.78, w: 0.80, h: 0.22 },

  // TravelVlog: CityCard + Caption — bottom-left, bottom ~11%
  'TravelVlog.cityCard':       { x: 0.00, y: 0.89, w: 0.50, h: 0.11 },

  // MoodDriven: LyricLine — center strip
  'MoodDriven.lyric':          { x: 0.04, y: 0.41, w: 0.92, h: 0.18 },
};

/** Brightness above this threshold means the region is light → overlay needed */
export const BRIGHT_THRESHOLD = 140;

/**
 * Returns average luma (0–255) of the given region in the keyframe image.
 * Returns null if the image cannot be read (missing file, ffprobe error).
 */
export function sampleRegionBrightness(
  keyframePath: string,
  region: RegionRect,
): number | null {
  try {
    // First get image dimensions
    const dimOut = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0',
      keyframePath,
    ], { encoding: 'utf8', timeout: 5000 });

    const [w, h] = dimOut.trim().split(',').map(Number);
    if (!w || !h) return null;

    // Convert fractional region to pixel coords, clamp to image bounds
    const cropX = Math.max(0, Math.round(region.x * w));
    const cropY = Math.max(0, Math.round(region.y * h));
    const cropW = Math.max(1, Math.min(Math.round(region.w * w), w - cropX));
    const cropH = Math.max(1, Math.min(Math.round(region.h * h), h - cropY));

    // Escape path for ffprobe lavfi (handle spaces)
    const escaped = keyframePath.replace(/'/g, "'\\''");
    const lavfi = `movie='${escaped}',crop=${cropW}:${cropH}:${cropX}:${cropY},signalstats`;

    const out = execFileSync('ffprobe', [
      '-v', 'quiet',
      '-f', 'lavfi', lavfi,
      '-show_entries', 'frame_tags=lavfi.signalstats.YAVG',
      '-of', 'csv=p=0',
    ], { encoding: 'utf8', timeout: 8000 });

    const val = parseFloat(out.trim());
    return isNaN(val) ? null : val;
  } catch {
    return null;
  }
}

/**
 * Analyze a keyframe for all text regions relevant to a given composition.
 * Returns a map of region key → 'light' | 'dark'.
 *
 * 'light' = background is bright → white text would be hard to read → needs overlay
 * 'dark'  = background is dark  → white text reads fine
 */
export function analyzeKeyframe(
  keyframePath: string,
  compositionId: string,
): Record<string, 'light' | 'dark'> {
  const result: Record<string, 'light' | 'dark'> = {};

  // Collect all region keys for this composition
  const prefix = `${compositionId}.`;
  for (const [key, region] of Object.entries(TEXT_REGIONS)) {
    if (!key.startsWith(prefix)) continue;
    const brightness = sampleRegionBrightness(keyframePath, region);
    if (brightness === null) {
      // Can't read — assume dark (safe default: white text will be visible)
      result[key] = 'dark';
    } else {
      result[key] = brightness > BRIGHT_THRESHOLD ? 'light' : 'dark';
    }
  }

  return result;
}
