#!/usr/bin/env node
/**
 * City Remix Render Script (v2 — ShotAI live search + validation)
 *
 * What changed from v1:
 *   - Shot data is NO LONGER hardcoded; ShotAI MCP is queried at runtime
 *   - Each shot is scored (similarity × mood fit × duration) before use
 *   - Background music auto-searched on YouTube via yt-dlp (or --bgm override)
 *
 * Usage:
 *   npx tsx src/make-city-remixes.ts
 *   npx tsx src/make-city-remixes.ts --bgm /path/to/music.mp3   # skip YouTube search
 */

import path from 'path';
import fs from 'fs';
import { execFileSync, spawn } from 'child_process';
import dotenv from 'dotenv';
import { ShotAIClient } from './shotai/client';
import { MCPProvider } from './skill/mcp';
import { resolveMusic } from './skill/music';
import { startFileServer } from './file-server';

dotenv.config();

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const CLIPS_DIR  = path.join(OUTPUT_DIR, 'city-clips');
const FILE_PORT  = 9877;

const MCP_URL   = process.env.SHOTAI_URL   ?? 'http://127.0.0.1:23817';
const MCP_TOKEN = process.env.SHOTAI_TOKEN ?? 'esMgbYXx4vGIsXdfBiFAJNkSEO32CNFv';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractClip(src: string, start: number, end: number, dest: string) {
  if (fs.existsSync(dest)) return;
  execFileSync('ffmpeg', [
    '-y',
    '-ss', start.toFixed(3),
    '-i', src,
    '-t', (end - start).toFixed(3),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac',
    dest,
  ], { stdio: 'pipe' });
}

/** Read the actual duration of an extracted clip via ffprobe. */
function clipDuration(filePath: string): number {
  const out = execFileSync('ffprobe', [
    '-v', 'quiet',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    filePath,
  ], { encoding: 'utf8' });
  return parseFloat(out.trim());
}

async function renderComposition(compositionId: string, props: object, outputFile: string) {
  console.log(`\n🎬 Rendering [${compositionId}] → ${path.basename(outputFile)}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', [
      'remotion', 'render',
      'src/remotion/index.tsx',
      compositionId,
      outputFile,
      `--props=${JSON.stringify(props)}`,
      '--codec=h264',
    ], { stdio: 'inherit', cwd: process.cwd() });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)));
    child.on('error', reject);
  });
  console.log(`   ✅ Saved → ${outputFile}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const bgmArg = (() => {
    const i = process.argv.indexOf('--bgm');
    return i !== -1 ? process.argv[i + 1] : undefined;
  })();

  fs.mkdirSync(CLIPS_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const client = new ShotAIClient(MCP_URL, MCP_TOKEN);
  const mcp    = new MCPProvider(client);

  // ── 1. Auto-resolve BGM (per composition style) ──────────────────────────
  console.log('\n[1/5] 🎵 配乐（三种风格分别搜索）...');

  async function resolveBgmUrl(styleDesc: string, filename: string): Promise<string | undefined> {
    try {
      const bgmPath = await resolveMusic(styleDesc, {
        localPath: bgmArg,   // if --bgm provided, all three share the same file
        cacheDir: CLIPS_DIR,
      });
      const bgmExt  = path.extname(bgmPath);
      const bgmDest = path.join(CLIPS_DIR, `${filename}${bgmExt}`);
      fs.copyFileSync(bgmPath, bgmDest);
      return `http://127.0.0.1:${FILE_PORT}/${filename}${bgmExt}`;
    } catch (err) {
      console.warn(`   ⚠️  配乐失败 [${filename}]: ${(err as Error).message}`);
      return undefined;
    }
  }

  const cyberpunkBgmUrl = await resolveBgmUrl('赛博朋克 电子合成器 暗黑 neon city', 'bgm-cyberpunk');
  const travelBgmUrl    = await resolveBgmUrl('旅行 轻快 acoustic cinematic travel vlog', 'bgm-travel');
  const moodBgmUrl      = await resolveBgmUrl('情绪 cinematic lofi ambient slow calm', 'bgm-mood');

  // ── 2. Search & validate shots via ShotAI ───────────────────────────────
  console.log('\n[2/5] 🔍 ShotAI 语义搜索镜头 + 质量校验...');

  // — CyberpunkCity: 6 shots from Hong Kong night footage —
  console.log('\n  [赛博朋克] 搜索香港夜景镜头...');
  const cyberpunkQueries = [
    '霓虹灯夜街反光',
    '维多利亚港夜景灯光',
    '香港夜市人流招牌',
    '城市天际线夜晚',
    '玻璃幕墙霓虹倒影',
    '密集高楼灯光',
  ];
  type PickedShot = NonNullable<Awaited<ReturnType<typeof mcp.pickShots>>[0]>;
  const cyberpunkShots: PickedShot[] = [];
  for (let i = 0; i < cyberpunkQueries.length; i++) {
    const q = cyberpunkQueries[i];
    const r = await mcp.pickShots(q, 1, { expectedMood: 'urban', minScore: 0.35 });
    const s = r[0];
    if (!s) { console.warn(`     ⚠  镜头 #${i+1} 无结果: ${q}`); continue; }
    console.log(`     ✓ #${i+1} [score ${s.score.toFixed(2)}] ${s.summary.slice(0, 40)}`);
    cyberpunkShots.push(s);
  }

  // — TravelVlog: 6 shots (Japan×3 + Paris×3) —
  console.log('\n  [旅行Vlog] 搜索日本+巴黎地标镜头...');
  const travelQueries: Array<{ q: string; cityName: string; cityColor: string }> = [
    { q: '红色鸟居神社',       cityName: '东京 🇯🇵', cityColor: '#e63946' },
    { q: '富士山自然风光',     cityName: '富士山 🗻', cityColor: '#e63946' },
    { q: '樱花河畔日本风景',   cityName: '京都 🌸',  cityColor: '#e63946' },
    { q: '埃菲尔铁塔日落航拍', cityName: '巴黎 🇫🇷', cityColor: '#f4d03f' },
    { q: '凯旋门交通环岛俯瞰', cityName: '巴黎 🇫🇷', cityColor: '#f4d03f' },
    { q: '塞纳河巴黎城市全景', cityName: '巴黎 🇫🇷', cityColor: '#f4d03f' },
  ];
  type TravelPickedShot = PickedShot & { cityName: string; cityColor: string };
  const travelShots: TravelPickedShot[] = [];
  for (let i = 0; i < travelQueries.length; i++) {
    const { q, cityName, cityColor } = travelQueries[i];
    const [s] = await mcp.pickShots(q, 1, { expectedMood: 'calm', minScore: 0.35 });
    if (!s) { console.warn(`     ⚠  镜头 #${i+1} 无结果: ${q}`); continue; }
    console.log(`     ✓ #${i+1} [score ${s.score.toFixed(2)}] ${cityName} — ${s.summary.slice(0, 35)}`);
    travelShots.push({ ...s, cityName, cityColor });
  }

  // — MoodDriven: 6 shots alternating fast(urban)/slow(nature/sunset) —
  console.log('\n  [情绪混剪] 搜索快切+慢镜镜头...');
  const moodQueries: Array<{ q: string; mood: 'fast' | 'slow' }> = [
    { q: '城市快节奏街道人流', mood: 'fast' },
    { q: '高楼密集璀璨夜光',   mood: 'fast' },
    { q: '金色日落余晖自然',   mood: 'slow' },
    { q: '霓虹穿梭都市快切',   mood: 'fast' },
    { q: '阳光草地慢镜宁静',   mood: 'slow' },
    { q: '城市建筑静谧航拍',   mood: 'slow' },
  ];
  type MoodPickedShot = PickedShot & { mood: 'fast' | 'slow' };
  const moodShots: MoodPickedShot[] = [];
  for (let i = 0; i < moodQueries.length; i++) {
    const { q, mood } = moodQueries[i];
    const [s] = await mcp.pickShots(q, 1, { expectedMood: mood, minScore: 0.30 });
    if (!s) { console.warn(`     ⚠  镜头 #${i+1} 无结果: ${q}`); continue; }
    console.log(`     ✓ #${i+1} [${mood}][score ${s.score.toFixed(2)}] ${s.summary.slice(0, 35)}`);
    moodShots.push({ ...s, mood });
  }

  // ── 3. Extract clips with ffmpeg ─────────────────────────────────────────
  console.log('\n[3/5] ✂️  提取片段...');

  const allShots = [
    ...cyberpunkShots.map((s, i) => ({ ...s, file: `cyberpunk-${String(i).padStart(3,'0')}.mp4` })),
    ...travelShots   .map((s, i) => ({ ...s, file: `travel-${String(i).padStart(3,'0')}.mp4` })),
    ...moodShots     .map((s, i) => ({ ...s, file: `mood-${String(i).padStart(3,'0')}.mp4` })),
  ];

  for (const shot of allShots) {
    const dest = path.join(CLIPS_DIR, shot.file);
    // Always re-extract: shots may differ from previous run
    console.log(`   ✂️  ${shot.file}  [${shot.startTime.toFixed(1)}s → ${shot.endTime.toFixed(1)}s]`);
    extractClip(shot.videoPath, shot.startTime, shot.endTime, dest);
  }

  // ── 4. Start file server ─────────────────────────────────────────────────
  console.log(`\n[4/5] 🌐 文件服务 → port ${FILE_PORT}`);
  const stopServer = await startFileServer(CLIPS_DIR, '', FILE_PORT);
  const base = `http://127.0.0.1:${FILE_PORT}`;
  const url  = (file: string) => `${base}/${file}`;
  const fps  = 30;

  try {
    // ── 5. Build props & render ──────────────────────────────────────────────
    console.log('\n[5/5] 🎞  渲染三个合成...');

    const cyberpunkProps = {
      fps, cityName: '香港', bgm: cyberpunkBgmUrl,
      clips: cyberpunkShots.map((s, i) => {
        const file = path.join(CLIPS_DIR, `cyberpunk-${String(i).padStart(3,'0')}.mp4`);
        return { src: url(`cyberpunk-${String(i).padStart(3,'0')}.mp4`), startTime: 0, endTime: clipDuration(file), summary: s.summary };
      }),
    };

    const travelProps = {
      fps, title: '环球之旅', bgm: travelBgmUrl,
      clips: travelShots.map((s, i) => {
        const file = path.join(CLIPS_DIR, `travel-${String(i).padStart(3,'0')}.mp4`);
        return { src: url(`travel-${String(i).padStart(3,'0')}.mp4`), startTime: 0, endTime: clipDuration(file), summary: s.summary, cityName: s.cityName, cityColor: s.cityColor };
      }),
    };

    const moodProps = {
      fps, title: '城市与宁静', bgm: moodBgmUrl,
      clips: moodShots.map((s, i) => {
        const file = path.join(CLIPS_DIR, `mood-${String(i).padStart(3,'0')}.mp4`);
        return { src: url(`mood-${String(i).padStart(3,'0')}.mp4`), startTime: 0, endTime: clipDuration(file), summary: s.summary, mood: s.mood };
      }),
    };

    const ts = Date.now();
    await renderComposition('CyberpunkCity', cyberpunkProps,
      path.join(OUTPUT_DIR, `cyberpunk-hk-${ts}.mp4`));
    await renderComposition('TravelVlog', travelProps,
      path.join(OUTPUT_DIR, `travel-vlog-${ts}.mp4`));
    await renderComposition('MoodDriven', moodProps,
      path.join(OUTPUT_DIR, `mood-driven-${ts}.mp4`));

    stopServer();
    console.log('\n🎉 三个混剪渲染完成！');
    console.log(`   📁 ${OUTPUT_DIR}`);
  } catch (err) {
    stopServer();
    console.error('\n❌ 渲染失败:', (err as Error).message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n💥 Fatal:', err.message);
  process.exit(1);
});
