/**
 * Music Layer — resolve background music for a video remix
 *
 * Two modes (auto-detected):
 *   1. local   — user passes --bgm /path/to/file.mp3
 *   2. youtube — auto-search via yt-dlp ytsearch, no API key required
 */
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';

export interface MusicResolveOptions {
  /** If set, skip YouTube search and use this file directly. */
  localPath?: string;
  /** Directory to cache downloaded files. */
  cacheDir: string;
}

/**
 * Given a mood/style description, find and return a local MP3 path.
 * Downloads from YouTube if no localPath is provided.
 */
export async function resolveMusic(
  description: string,
  opts: MusicResolveOptions,
): Promise<string> {
  const { localPath, cacheDir } = opts;

  // ── Mode 1: local file ────────────────────────────────────────────────────
  if (localPath) {
    if (!fs.existsSync(localPath)) {
      throw new Error(`BGM file not found: ${localPath}`);
    }
    console.log(`   🎵 使用本地配乐: ${path.basename(localPath)}`);
    return localPath;
  }

  // ── Mode 2: YouTube search ────────────────────────────────────────────────
  // yt-dlp ytsearch works best with English keywords
  const englishDesc = description
    .replace(/城市混剪/g, 'city remix')
    .replace(/电子合成器/g, 'electronic synthwave')
    .replace(/赛博朋克/g, 'cyberpunk')
    .replace(/旅行/g, 'travel')
    .replace(/情绪/g, 'cinematic');
  console.log(`   🔍 搜索配乐: "${englishDesc}"`);

  // Use yt-dlp's built-in search (no API key needed)
  // --print outputs one field per line; "%(id)s\t%(title)s" gives id TAB title per result
  let searchOut: string;
  try {
    searchOut = execFileSync('yt-dlp', [
      `ytsearch5:${englishDesc} no copyright background music`,
      '--print', '%(id)s\t%(title)s',
      '--no-download',
      '--no-playlist',
      '--quiet',
      '--no-warnings',
      '--cookies-from-browser', 'chrome',
      '--remote-components', 'ejs:github',
    ], { encoding: 'utf8', timeout: 60_000 });
  } catch (err) {
    throw new Error(`yt-dlp search failed: ${(err as Error).message}`);
  }

  const lines = searchOut.trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    throw new Error('yt-dlp returned no search results');
  }

  // Pick first result (highest relevance)
  const [videoId, ...titleParts] = lines[0].split('\t');
  const title = titleParts.join('\t');
  console.log(`   🎵 自动选曲: ${title}  (${videoId})`);

  // ── Download ──────────────────────────────────────────────────────────────
  const destPath = path.join(cacheDir, `bgm-${videoId}.mp3`);
  if (fs.existsSync(destPath)) {
    console.log(`   ⏭  配乐已缓存: ${path.basename(destPath)}`);
    return destPath;
  }

  console.log(`   ⬇  下载中...`);
  execFileSync('yt-dlp', [
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '-o', destPath,
    `https://www.youtube.com/watch?v=${videoId}`,
    '--quiet',
    '--no-warnings',
    '--cookies-from-browser', 'chrome',
    '--remote-components', 'ejs:github',
  ], { timeout: 300_000 });

  if (!fs.existsSync(destPath)) {
    throw new Error(`yt-dlp download succeeded but file not found: ${destPath}`);
  }

  console.log(`   ✅ 配乐下载完成: ${path.basename(destPath)}`);
  return destPath;
}
