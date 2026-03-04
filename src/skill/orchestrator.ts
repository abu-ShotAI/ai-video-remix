/**
 * Orchestrator — main pipeline that wires all skill layers together.
 *
 * Flow:
 *   1. Agent: parseIntent(userRequest) → { theme, composition, musicStyleOverride }
 *   2. Agent: refineQueries(slots, theme) → refined search terms per slot
 *   3. MCP: pickShots(query, 1, …) × N  → best shot per slot with video path
 *   4. Music: resolveMusic(musicStyle, …) → local MP3 path
 *   5. ffmpeg: extract each shot to independent clip file
 *   6. Agent: annotateClips(clips) → per-clip visual effect parameters
 *   7. File server: start HTTP server over clips dir
 *   8. Remotion: render composition with registry.buildProps(clips, title, bgm)
 *   9. Clean up file server; return output path
 */
import path from 'path';
import fs from 'fs';
import { execFileSync, spawn } from 'child_process';
import { ShotAIClient } from '../shotai/client';
import { MCPProvider, ValidatedShot } from './mcp';
import { resolveMusic } from './music';
import { createAgent, ClipAnnotation, LibrarySummary } from './agent';
import { REGISTRY, CompositionMeta, ResolvedClip, ShotSlot } from './registry';
import { startFileServer } from '../file-server';
import { SkillConfig } from './config';

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Probe the ShotAI library and build a compact LibrarySummary for the LLM.
 * Samples up to `maxVideos` videos, up to `samplesPerVideo` shots each.
 */
async function probeLibrary(
  client: ShotAIClient,
  maxVideos = 8,
  samplesPerVideo = 20,
): Promise<LibrarySummary> {
  const videos = await client.listVideos();
  const subset = videos.slice(0, maxVideos);

  const summaryVideos = await Promise.all(subset.map(async v => {
    let shots: Awaited<ReturnType<typeof client.getVideoShots>> = [];
    try { shots = await client.getVideoShots(v.id); } catch { /* ignore */ }

    const sampled = shots.slice(0, samplesPerVideo);
    const moods   = [...new Set(sampled.map(s => s.tags?.mood).filter(Boolean))] as string[];
    const scenes  = [...new Set(sampled.map(s => s.tags?.scene).filter(Boolean))] as string[];

    return {
      name:            v.name,
      duration:        v.duration,
      shotCount:       shots.length,
      sampleSummaries: sampled.map(s => s.summary).filter(Boolean),
      moods,
      scenes,
    };
  }));

  return { videos: summaryVideos };
}

function extractClip(src: string, start: number, end: number, dest: string) {
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

function renderComposition(
  compositionId: string,
  props: object,
  outputFile: string,
): Promise<void> {
  console.log(`\n🎬 Rendering [${compositionId}] → ${path.basename(outputFile)}`);
  return new Promise<void>((resolve, reject) => {
    const child = spawn('npx', [
      'remotion', 'render',
      'src/remotion/index.tsx',
      compositionId,
      outputFile,
      `--props=${JSON.stringify(props)}`,
      '--codec=h264',
    ], { stdio: 'inherit', cwd: process.cwd() });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Remotion exited ${code}`)));
    child.on('error', reject);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RunSkillOptions {
  /** Override composition id instead of letting agent choose */
  compositionId?: string;
  /** Override output directory */
  outputDir?: string;
  /** Local BGM path — skips YouTube search when set */
  bgmPath?: string;
  /** Show "ShotAI 检索 · Remotion 合成" attribution in outro. Default: true */
  showAttribution?: boolean;
  /**
   * Probe mode: before planning, fetch the user's library content and let the
   * LLM generate slots tailored to what actually exists in their collection.
   * Without this flag the agent picks from fixed registry templates.
   */
  probe?: boolean;
}

export interface RunSkillResult {
  outputPath: string;
  compositionId: string;
  theme: string;
}

/**
 * Main skill entry point.
 * @param userRequest Natural language request (e.g. "帮我做香港夜景赛博朋克混剪")
 * @param cfg          Unified SkillConfig (from config.ts)
 * @param opts         Optional overrides
 */
export async function runSkill(
  userRequest: string,
  cfg: SkillConfig,
  opts: RunSkillOptions = {},
): Promise<RunSkillResult> {
  const outputDir = opts.outputDir ?? cfg.output.dir;
  const clipsDir  = cfg.output.clipsDir;
  const filePort  = cfg.output.filePort;

  fs.mkdirSync(clipsDir,  { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  // ── 1. Agent: parse intent (or probe library for dynamic planning) ───────────
  const agent = createAgent({
    provider: cfg.agent.provider,
    apiKey:   cfg.agent.apiKey,
    model:    cfg.agent.model,
    baseUrl:  cfg.agent.baseUrl,
  });

  const client = new ShotAIClient(cfg.mcp.baseUrl, cfg.mcp.token);

  let meta: CompositionMeta;
  let theme: string;
  let musicStyle: string;
  let activeShotSlots: ShotSlot[];

  if (opts.probe) {
    console.log('\n[1/6] 🔭 探索素材库...');
    const library = await probeLibrary(client);
    const videoNames = library.videos.map(v => `"${v.name}"`).join(', ');
    console.log(`   发现 ${library.videos.length} 个视频: ${videoNames}`);

    console.log('   🤖 根据库内容规划混剪方案...');
    const plan = await agent.planFromLibrary(userRequest, library);

    meta = opts.compositionId
      ? (REGISTRY.find(m => m.id === opts.compositionId) ?? REGISTRY.find(m => m.id === plan.compositionId) ?? REGISTRY[0])
      : (REGISTRY.find(m => m.id === plan.compositionId) ?? REGISTRY[0]);

    theme          = plan.theme;
    musicStyle     = plan.musicStyle;
    activeShotSlots = plan.slots.map(s => ({
      query: s.query,
      mood:  s.mood,
      extra: s.extra,
    }));
    console.log(`   ✅ 主题: "${theme}"  合成: ${meta.label} (${meta.id})  动态slots: ${activeShotSlots.length}个`);
  } else {
    console.log('\n[1/6] 🤖 解析混剪需求...');
    const intent = await agent.parseIntent(userRequest);

    meta = opts.compositionId
      ? (REGISTRY.find(m => m.id === opts.compositionId) ?? intent.composition)
      : intent.composition;

    theme          = intent.theme;
    musicStyle     = intent.musicStyleOverride ?? meta.musicStyle;
    activeShotSlots = meta.shotSlots;
    console.log(`   ✅ 主题: "${theme}"  合成: ${meta.label} (${meta.id})`);
  }

  // ── 2. Agent: refine shot queries ─────────────────────────────────────────
  console.log('\n[2/6] 🔍 优化镜头搜索词...');
  const refinedQueries = await agent.refineQueries(
    activeShotSlots.map(s => ({ defaultQuery: s.query, mood: s.mood })),
    theme,
  );
  console.log(`   搜索词: ${refinedQueries.join(' / ')}`);

  // ── 3. MCP: pick shots ────────────────────────────────────────────────────
  console.log('\n[3/6] 🎞  ShotAI 语义搜索镜头...');
  const mcp = new MCPProvider(client);

  const pickedShots: Array<(ValidatedShot & { videoPath: string }) | null> = [];
  for (let i = 0; i < activeShotSlots.length; i++) {
    const slot  = activeShotSlots[i];
    const query = refinedQueries[i] ?? slot.query;
    const shots = await mcp.pickShots(query, 1, {
      expectedMood: slot.mood,
      minScore:     cfg.validation.minScore,
    }, cfg.validation.maxRetries);

    const shot = shots[0] ?? null;
    if (shot) {
      console.log(`   ✓ [${i+1}/${activeShotSlots.length}] [score ${shot.score.toFixed(2)}] ${shot.summary.slice(0,50)}`);
    } else {
      console.warn(`   ⚠  [${i+1}/${activeShotSlots.length}] 无结果: ${query}`);
    }
    pickedShots.push(shot);
  }

  // ── 4. Music: resolve BGM ─────────────────────────────────────────────────
  console.log('\n[4/6] 🎵 解析配乐...');
  let bgmUrl: string | undefined;
  try {
    const bgmLocalPath = await resolveMusic(musicStyle, {
      localPath: opts.bgmPath ?? cfg.music.localPath,
      cacheDir:  clipsDir,
    });
    const bgmExt  = path.extname(bgmLocalPath);
    const bgmSlug = meta.id.toLowerCase();
    const bgmDest = path.join(clipsDir, `bgm-${bgmSlug}${bgmExt}`);
    fs.copyFileSync(bgmLocalPath, bgmDest);
    bgmUrl = `http://127.0.0.1:${filePort}/bgm-${bgmSlug}${bgmExt}`;
    console.log(`   ✅ 配乐就绪: ${path.basename(bgmDest)}`);
  } catch (err) {
    console.warn(`   ⚠  配乐失败: ${(err as Error).message}  (继续无配乐)`);
  }

  // ── 5. Extract clips with ffmpeg ─────────────────────────────────────────
  console.log('\n[5/6] ✂️  提取片段...');
  const resolvedClips: ResolvedClip[] = [];

  for (let i = 0; i < pickedShots.length; i++) {
    const shot = pickedShots[i];
    const slot = activeShotSlots[i];
    const file = `${meta.id.toLowerCase()}-${String(i).padStart(3,'0')}.mp4`;
    const dest = path.join(clipsDir, file);

    if (!shot) {
      console.warn(`   ⚠  镜头 ${i+1} 无素材，跳过`);
      continue;
    }

    // Trim a small margin from both ends to avoid ShotAI boundary frames
    // (transition frames, camera motion at cut points) that cause flicker when clips are joined
    const TRIM = 0.08; // seconds to cut from each end
    const rawDur = shot.endTime - shot.startTime;
    const trimStart = shot.startTime + (rawDur > TRIM * 3 ? TRIM : 0);
    const trimEnd   = shot.endTime   - (rawDur > TRIM * 3 ? TRIM : 0);
    console.log(`   ✂️  ${file}  [${trimStart.toFixed(2)}s → ${trimEnd.toFixed(2)}s]`);
    extractClip(shot.videoPath, trimStart, trimEnd, dest);

    const actualDuration = clipDuration(dest);
    const clip: ResolvedClip = {
      src:           `http://127.0.0.1:${filePort}/${file}`,
      startTime:     0,
      endTime:       actualDuration,
      summary:       shot.summary,
      keyframePath:  shot.keyframePath,
      // Merge extra props from slot (e.g. cityName, cityColor, mood)
      ...slot.extra,
    };
    resolvedClips.push(clip);
  }

  if (resolvedClips.length === 0) {
    throw new Error('No clips resolved — cannot render empty composition');
  }

  // ── 6. Agent: annotate clips with per-shot visual parameters ──────────────
  console.log('\n[6/8] 🎨 AI 分析镜头内容，生成特效注解...');
  const annotations: ClipAnnotation[] = await agent.annotateClips(
    resolvedClips.map((c, i) => ({
      summary:      c.summary,
      keyframePath: c.keyframePath as string | undefined,
      slotExtra:    activeShotSlots[i]?.extra,
    })),
    meta.id,
  );

  // Merge annotations into resolved clips (annotations override slot.extra for effect fields)
  for (let i = 0; i < resolvedClips.length; i++) {
    const ann = annotations[i] ?? {};
    if (ann.tone       !== undefined) resolvedClips[i].tone       = ann.tone;
    if (ann.dramatic   !== undefined) resolvedClips[i].dramatic   = ann.dramatic;
    if (ann.kenBurns   !== undefined) resolvedClips[i].kenBurns   = ann.kenBurns;
    if (ann.transition !== undefined) resolvedClips[i].transition = ann.transition;
    if (ann.caption    !== undefined && ann.caption.trim()) resolvedClips[i].caption = ann.caption;
    if (ann.textBg     !== undefined) resolvedClips[i].textBg     = ann.textBg;
    console.log(`   🎨 [${i+1}] ${JSON.stringify(ann)} ← "${resolvedClips[i].summary?.slice(0,40)}"`);
  }

  // ── 7. Render ─────────────────────────────────────────────────────────────
  console.log(`\n[7/8] 🎬 渲染视频...`);
  const slug       = meta.id.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
  const outputFile = path.join(outputDir, `${slug}-${Date.now()}.mp4`);
  const props      = meta.buildProps(resolvedClips, theme, bgmUrl, opts.showAttribution ?? true);

  // ── 8. Start file server + render ─────────────────────────────────────────
  const stopServer = await startFileServer(clipsDir, '', filePort);
  try {
    await renderComposition(meta.id, props, outputFile);
  } finally {
    stopServer();
  }

  console.log(`\n✅ 完成！输出文件: ${outputFile}`);
  return { outputPath: outputFile, compositionId: meta.id, theme };
}
