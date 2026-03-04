#!/usr/bin/env node
/**
 * 渲染三个新 composition 示例：NatureWild / SwitzerlandScenic / SportsHighlight
 * 每个约 60s，带叙事镜头顺序和叙事文字
 *
 * 用法：npx tsx src/make-three-examples.ts
 *       npx tsx src/make-three-examples.ts --bgm /path/to/music.mp3  (三个共用一个本地BGM)
 *       npx tsx src/make-three-examples.ts --only SportsHighlight     (只渲染指定 composition)
 */
import path from 'path';
import fs from 'fs';
import { execFileSync, spawn } from 'child_process';
import dotenv from 'dotenv';
import { ShotAIClient } from './shotai/client';
import { MCPProvider } from './skill/mcp';
import { resolveMusic } from './skill/music';
import { startFileServer } from './file-server';
import { REGISTRY, MBAPPE_MESSI_VIDEO_ID, MBAPPE_MESSI_VIDEO_PATH } from './skill/registry';
import { analyzeKeyframe } from './skill/brightness';

dotenv.config();

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const CLIPS_DIR  = path.join(OUTPUT_DIR, 'example-clips');
const FILE_PORT  = 9878;

const MCP_URL   = process.env.SHOTAI_URL   ?? 'http://127.0.0.1:23817';
const MCP_TOKEN = process.env.SHOTAI_TOKEN ?? 'esMgbYXx4vGIsXdfBiFAJNkSEO32CNFv';

function extractClip(src: string, start: number, end: number, dest: string, tailPad = 0) {
  if (fs.existsSync(dest)) return;
  execFileSync('ffmpeg', [
    '-y', '-ss', start.toFixed(3), '-i', src,
    '-t', (end - start + tailPad).toFixed(3),
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-c:a', 'aac', dest,
  ], { stdio: 'pipe' });
}

function clipDuration(filePath: string): number {
  const out = execFileSync('ffprobe', [
    '-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', filePath,
  ], { encoding: 'utf8' });
  return parseFloat(out.trim());
}

async function renderComposition(id: string, props: object, out: string) {
  console.log(`\n🎬 Rendering [${id}] → ${path.basename(out)}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', [
      'remotion', 'render', 'src/remotion/index.tsx', id, out,
      `--props=${JSON.stringify(props)}`, '--codec=h264',
    ], { stdio: 'inherit', cwd: process.cwd() });
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`Exit ${code}`)));
    child.on('error', reject);
  });
  console.log(`   ✅ → ${out}`);
}

async function resolveBgm(styleDesc: string, slug: string, bgmArgPath?: string): Promise<string | undefined> {
  try {
    const bgmPath = await resolveMusic(styleDesc, { localPath: bgmArgPath, cacheDir: CLIPS_DIR });
    const dest = path.join(CLIPS_DIR, `bgm-${slug}${path.extname(bgmPath)}`);
    fs.copyFileSync(bgmPath, dest);
    return `http://127.0.0.1:${FILE_PORT}/bgm-${slug}${path.extname(bgmPath)}`;
  } catch (e) {
    console.warn(`   ⚠  BGM 失败: ${(e as Error).message}`);
    return undefined;
  }
}

/**
 * For SportsHighlight slots: pick the candidate whose summary best matches
 * the slot's narrative intent keywords, then derive caption from summary.
 */
function selectBestSportsShot(
  shots: Array<{ summary: string; score: number; [key: string]: any }>,
  intentKeywords: string[],
): { shot: any; derivedCaption: string } | null {
  if (shots.length === 0) return null;

  // Score each candidate by how many intent keywords hit the summary
  const lower = (s: string) => s.toLowerCase();
  const scored = shots.map(shot => {
    const sum = lower(shot.summary);
    const hits = intentKeywords.filter(kw => sum.includes(lower(kw))).length;
    return { shot, hits };
  });
  scored.sort((a, b) => b.hits - a.hits || b.shot.score - a.shot.score);
  const best = scored[0].shot;

  // Derive a short caption from the summary (first meaningful clause, max 10 words)
  const raw = best.summary.replace(/[.!?]+$/, '').trim();
  const words = raw.split(/\s+/);
  const derivedCaption = words.slice(0, 10).join(' ');

  return { shot: best, derivedCaption };
}

async function main() {
  const bgmArg  = (() => { const i = process.argv.indexOf('--bgm');  return i !== -1 ? process.argv[i + 1] : undefined; })();
  const onlyArg = (() => { const i = process.argv.indexOf('--only'); return i !== -1 ? process.argv[i + 1] : undefined; })();

  fs.mkdirSync(CLIPS_DIR, { recursive: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const client = new ShotAIClient(MCP_URL, MCP_TOKEN);
  const mcp    = new MCPProvider(client);

  // ─── 三个 composition 配置（标题、composition ID、BGM风格）──────────────────
  const allExamples = [
    {
      compositionId: 'NatureWild',
      title:         '荒野之眼',
      bgmStyle:      'nature documentary ambient orchestral peaceful wildlife',
      bgmSlug:       'nature',
    },
    {
      compositionId: 'SwitzerlandScenic',
      title:         '阿尔卑斯之约',
      bgmStyle:      'alpine acoustic orchestral cinematic peaceful mountain travel',
      bgmSlug:       'scenic',
    },
    {
      compositionId: 'SportsHighlight',
      title:         '法阿大战·2018世界杯',
      bgmStyle:      'hiphop sports energy trap beat motivational intense',
      bgmSlug:       'sports',
    },
  ];
  const examples = onlyArg
    ? allExamples.filter(e => e.compositionId.toLowerCase() === onlyArg.toLowerCase())
    : allExamples;
  if (examples.length === 0) {
    console.error(`❌ 未找到 composition: ${onlyArg}`);
    process.exit(1);
  }

  // ── BGM: 三个分别搜索 ──────────────────────────────────────────────────────
  console.log('\n[1/4] 🎵 配乐搜索...');
  const bgmUrls: Record<string, string | undefined> = {};
  for (const ex of examples) {
    bgmUrls[ex.compositionId] = await resolveBgm(ex.bgmStyle, ex.bgmSlug, bgmArg);
  }

  // ── MCP 镜头搜索 ──────────────────────────────────────────────────────────
  console.log('\n[2/4] 🔍 搜索镜头...');

  // Expected score states after each goal, in chronological order (match time)
  // Used to match analyze_visual results to the correct slot caption
  const GOAL_SCORE_STATES: Array<{ caption: string; scoreFRA: number; scoreARG: number }> = [
    { caption: '1-0 ⚽ 格列兹曼 13\'', scoreFRA: 1, scoreARG: 0 },
    { caption: '1-1 ⚽ 迪马利亚 41\'',  scoreFRA: 1, scoreARG: 1 },
    { caption: '2-1 ⚽ 梅卡多 48\'',   scoreFRA: 1, scoreARG: 2 },
    { caption: '2-2 ⚽ 帕瓦尔 57\'',   scoreFRA: 2, scoreARG: 2 },
    { caption: '3-2 ⚽ 姆巴佩 59\'',   scoreFRA: 3, scoreARG: 2 },
    { caption: '4-2 ⚽ 姆巴佩 64\'',   scoreFRA: 4, scoreARG: 2 },
    { caption: '4-3 ⚽ 阿圭罗 90\'',   scoreFRA: 4, scoreARG: 3 },
  ];

  /**
   * Parse analyze_visual response to extract whether a goal just happened and what
   * score the scoreboard shows. Returns { isGoal, fra, arg } or null if unparseable.
   */
  function parseGoalAnalysis(analysis: string): { isGoal: boolean; fra: number; arg: number } | null {
    const upper = analysis.toUpperCase();
    const isGoal = upper.includes('GOAL') && !upper.includes('NO GOAL') && !upper.includes('NO-GOAL') &&
                   !upper.includes('NOT A GOAL') && !upper.includes('NOT BEING SCORED');
    // Look for score patterns: "FRA X-Y ARG", "X – Y", "FRA X ARG Y", etc.
    const scoreMatch =
      analysis.match(/FRA\s*[:\-–]?\s*(\d)\s*[-–:]\s*(\d)\s*[:\-–]?\s*ARG/i) ??
      analysis.match(/(\d)\s*[-–:]\s*(\d)/);
    if (!scoreMatch) return null;
    const fra = parseInt(scoreMatch[1], 10);
    const arg = parseInt(scoreMatch[2], 10);
    return { isGoal, fra, arg };
  }

  /**
   * Find goal shots from the France-Argentina 2018 WC video using ShotAI search
   * followed by analyze_visual verification. Returns 7 shots in chronological order,
   * each matched to the correct score state by scoreboard reading.
   */
  async function findGoalShotsViaShotAI(
    client: ShotAIClient,
    videoId: string,
    videoPath: string,
  ): Promise<Array<{ shot: any; caption: string }>> {
    // Broad queries to cast a wide net for goal moments
    const broadQueries = [
      'football player scores goal celebration',
      'player shoots ball into net goal',
      'penalty kick goal keeper dives',
      'spectacular strike volley goal',
      'sprint dribble goal scored',
      'goal celebration stadium crowd',
      'ball crosses goal line score',
      // Targeted for missing goals: 3-2 Mbappé (59\') and 4-3 Agüero (90\')
      'young striker sprints breaks away scores',
      'late consolation goal injury time 90 minutes',
      'substitute scores last minute equalizer',
    ];

    console.log('     🔍 ShotAI: 搜索候选进球镜头...');
    const seen = new Set<string>();
    const candidates: any[] = [];

    // NOTE: search_shots videoId param is ignored by the server — filter client-side instead
    for (const q of broadQueries) {
      const shots = await client.searchShots(q, { limit: 15 });
      for (const s of shots) {
        if (s.videoId === videoId && !seen.has(s.id)) {
          seen.add(s.id);
          candidates.push(s);
        }
      }
    }
    console.log(`     📋 候选镜头: ${candidates.length} 个 (已过滤到目标视频)`);

    // analyze_visual: verify each candidate
    // Strict prompt: we need the exact goal-scoring moment, not post-goal play
    const PROMPT = [
      'This keyframe is from the 2018 FIFA World Cup match France vs Argentina.',
      'Task: determine if this is the EXACT moment a goal is being scored.',
      'Answer ONLY these two lines:',
      'LINE1: GOAL if the ball is entering/in the net OR a player is in the immediate act of scoring (shot just taken, keeper beaten). NO-GOAL for everything else (celebration after, regular play, goalkeeper kicking, corner kick, etc.).',
      'LINE2: Score shown on screen scoreboard as "FRA X-Y ARG". Write SCORE_UNKNOWN if not visible.',
      'Do not add any other text.',
    ].join(' ');

    console.log('     🔬 analyze_visual: 逐一验证镜头...');
    const verified: Array<{ shot: any; fra: number; arg: number; isGoal: boolean }> = [];

    for (let ci = 0; ci < candidates.length; ci++) {
      const shot = candidates[ci];
      try {
        const analysis = await client.analyzeVisual(shot.id, PROMPT);
        const parsed = parseGoalAnalysis(analysis);
        if (parsed) {
          const { isGoal, fra, arg } = parsed;
          const scoreStr = `FRA ${fra}-${arg} ARG`;
          console.log(`     [${ci+1}/${candidates.length}] t=${shot.startTime.toFixed(0)}s  ${isGoal ? '⚽ GOAL' : '  —    '}  ${scoreStr}  "${shot.summary.slice(0, 40)}"`);
          if (isGoal) {
            verified.push({ shot, fra, arg, isGoal: true });
          } else if (fra + arg > 0) {
            // Keep as last-resort fallback only — mark clearly as non-goal
            verified.push({ shot, fra, arg, isGoal: false });
          }
        } else {
          console.log(`     [${ci+1}/${candidates.length}] t=${shot.startTime.toFixed(0)}s  (unparseable) "${shot.summary.slice(0, 40)}"`);
        }
      } catch (e) {
        console.warn(`     [${ci+1}/${candidates.length}] analyze_visual failed: ${(e as Error).message}`);
      }
    }

    // Match verified shots to the 7 expected score states
    // For each expected score state, find the best matching verified shot
    const results: Array<{ shot: any; caption: string }> = [];

    for (const expected of GOAL_SCORE_STATES) {
      // Find verified shots whose scoreboard matches this goal's resulting score
      // Prefer shots where isGoal=true; fall back to closest score state
      const matching = verified.filter(v => v.fra === expected.scoreFRA && v.arg === expected.scoreARG);
      const goalShots = matching.filter(v => v.isGoal);
      const fallbackShots = matching.filter(v => !v.isGoal);

      let chosen: { shot: any; fra: number; arg: number; isGoal: boolean } | null = null;
      if (goalShots.length > 0) {
        chosen = goalShots[0];
      } else if (fallbackShots.length > 0) {
        chosen = fallbackShots[0];
        console.warn(`     ⚠️  ${expected.caption}: 仅找到非进球帧作为 fallback (t=${chosen.shot.startTime.toFixed(0)}s)`);
      }

      if (chosen) {
        const tag = chosen.isGoal ? '✅' : '⚠️ (fallback)';
        console.log(`     ${tag} ${expected.caption}: t=${chosen.shot.startTime.toFixed(0)}s (score ${chosen.fra}-${chosen.arg})`);
        results.push({ shot: chosen.shot, caption: expected.caption });
      } else {
        console.warn(`     ❌  ${expected.caption}: 无匹配镜头 (FRA ${expected.scoreFRA}-${expected.scoreARG} ARG)`);
      }
    }

    // Sort chronologically by video timestamp so clip order follows match timeline
    results.sort((a, b) => a.shot.startTime - b.shot.startTime);
    return results;
  }

  const allResults: Record<string, Array<{ shot: any; slot: any; fileSlug: string }>> = {};

  for (const ex of examples) {
    const meta = REGISTRY.find(m => m.id === ex.compositionId)!;
    const isSports = ex.compositionId === 'SportsHighlight';
    console.log(`\n  [${meta.label}] ${meta.shotSlots.length} 个镜头槽位`);
    allResults[ex.compositionId] = [];

    if (isSports) {
      // ── ShotAI search + analyze_visual verification pipeline ─────────────
      console.log('\n     ⚽ 启动 ShotAI 搜索 + analyze_visual 验证进球镜头...');
      const goalShots = await findGoalShotsViaShotAI(client, MBAPPE_MESSI_VIDEO_ID, MBAPPE_MESSI_VIDEO_PATH);

      for (let gi = 0; gi < goalShots.length && gi < meta.shotSlots.length; gi++) {
        const { shot, caption } = goalShots[gi];
        const slot = meta.shotSlots[gi];
        const fileSlug = `${ex.compositionId.toLowerCase()}-${String(gi).padStart(3, '0')}.mp4`;

        // Attach video path for ffmpeg extraction (ShotAI shots have .videoId, need .videoPath)
        shot.videoPath = MBAPPE_MESSI_VIDEO_PATH;

        // Override the slot caption with the verified goal caption
        const mergedSlot = { ...slot, extra: { ...slot.extra, caption } };
        allResults[ex.compositionId].push({ shot, slot: mergedSlot, fileSlug });
      }
    } else {
      for (let i = 0; i < meta.shotSlots.length; i++) {
        const slot = meta.shotSlots[i];
        const shots = await mcp.pickShots(slot.query, 1, {
          expectedMood: slot.mood,
          minScore: 0.30,
        }, 1);
        const shot = shots[0] ?? null;
        const fileSlug = `${ex.compositionId.toLowerCase()}-${String(i).padStart(3,'0')}.mp4`;
        if (shot) {
          console.log(`     ✓ [${i+1}/${meta.shotSlots.length}] [${shot.score.toFixed(2)}] ${shot.summary.slice(0,50)}`);
          allResults[ex.compositionId].push({ shot, slot, fileSlug });
        } else {
          console.warn(`     ⚠  [${i+1}/${meta.shotSlots.length}] 无结果: ${slot.query}`);
          allResults[ex.compositionId].push({ shot: null, slot, fileSlug });
        }
      }
    }
  }

  // ── 提取片段 ───────────────────────────────────────────────────────────────
  console.log('\n[3/4] ✂️  提取片段...');
  for (const [compId, items] of Object.entries(allResults)) {
    // For sports goal clips, add tail padding so we don't cut off the celebration
    const tailPad = compId === 'SportsHighlight' ? 1.5 : 0;
    for (const { shot, fileSlug } of items) {
      if (!shot) continue;
      const dest = path.join(CLIPS_DIR, fileSlug);
      console.log(`   ✂️  ${fileSlug}  [${shot.startTime.toFixed(1)}s → ${(shot.endTime + tailPad).toFixed(1)}s]${tailPad > 0 ? ` (+${tailPad}s pad)` : ''}`);
      extractClip(shot.videoPath, shot.startTime, shot.endTime, dest, tailPad);
    }
  }

  // ── 渲染 ───────────────────────────────────────────────────────────────────
  console.log('\n[4/4] 🎬 渲染...');
  const stopServer = await startFileServer(CLIPS_DIR, '', FILE_PORT);
  const base = `http://127.0.0.1:${FILE_PORT}`;
  const ts = Date.now();

  try {
    for (const ex of examples) {
      const meta = REGISTRY.find(m => m.id === ex.compositionId)!;
      const items = allResults[ex.compositionId];

      // Build ResolvedClip array
      const resolvedClips: any[] = [];
      for (const { shot, slot, fileSlug } of items) {
        if (!shot) continue;
        const filePath = path.join(CLIPS_DIR, fileSlug);
        const dur = clipDuration(filePath);
        resolvedClips.push({
          src:          `${base}/${fileSlug}`,
          startTime:    0,
          endTime:      dur,
          summary:      shot.summary,
          keyframePath: shot.keyframePath,
          // Spread slot.extra to carry narrative labels (scene/caption/location/sport etc.)
          ...(slot.extra ?? {}),
        });
      }

      if (resolvedClips.length === 0) {
        console.warn(`   ⚠  ${ex.compositionId} 无有效镜头，跳过`);
        continue;
      }

      // ── AI 特效注解 ─────────────────────────────────────────────────────────
      // Pre-generated annotations (agent-curated based on slot context + composition type)
      const STATIC_ANNOTATIONS: Record<string, Array<Record<string, unknown>>> = {
        NatureWild: [
          { kenBurns: 'zoom-out'  },  // aerial forest landscape — pull back to reveal scale
          { kenBurns: 'pan-right' },  // black panther stalking — lateral tracking shot feel
          { kenBurns: 'zoom-in'   },  // fish underwater — slow approach into the blue
          { kenBurns: 'pan-left'  },  // bird diving ocean — trajectory follows the dive
          { kenBurns: 'zoom-in'   },  // flower macro — close-in on petal detail
          { kenBurns: 'pan-right' },  // capybara floating — lazy drift across water
          { kenBurns: 'pan-left'  },  // mountain lion walking — follows predator through forest
          { kenBurns: 'zoom-out'  },  // rainforest canopy aerial — rise above the canopy
          { kenBurns: 'pan-left'  },  // bird silhouette sunset — wings carry the eye left
          { kenBurns: 'zoom-in'   },  // mountain lion family night — draw closer to the cubs
        ],
        SwitzerlandScenic: [
          { tone: 'cool' },  // mountain peaks snow alps — icy blue
          { tone: 'cool' },  // person hiking mountain trail — cool altitude air
          { tone: 'warm' },  // green meadow rolling hills — lush warm green
          { tone: 'cool' },  // waterfall mountain stream — crystal cold water
          { tone: 'cool' },  // mountain summit panorama — crisp cold summit light
          { tone: 'cool' },  // lake reflection calm — mirror-still cool water
          { tone: 'warm' },  // alpine wildflowers — warm summer bloom
          { tone: 'warm' },  // valley village — warm stone village light
          { tone: 'warm' },  // sunset golden hour — golden warm fade
          { tone: 'warm' },  // couple van road trip — warm journey mood
        ],
        SportsHighlight: [
          { dramatic: true },  // Griezmann penalty — 1-0 France
          { dramatic: true },  // Di Maria wonder strike — 1-1
          { dramatic: true },  // Mercado goal — 2-1 Argentina
          { dramatic: true },  // Pavard volley — 2-2
          { dramatic: true },  // Mbappé first — 3-2 France
          { dramatic: true },  // Mbappé second — 4-2 France
          { dramatic: true },  // Agüero consolation — 4-3 Argentina
        ],
      };

      console.log(`\n   🎨 注入预生成特效注解 + keyframe亮度分析 [${ex.compositionId}]...`);
      const annotationList = STATIC_ANNOTATIONS[ex.compositionId] ?? [];
      for (let i = 0; i < resolvedClips.length; i++) {
        const ann = annotationList[i] ?? {};
        if (ann.tone       !== undefined) resolvedClips[i].tone       = ann.tone;
        if (ann.dramatic   !== undefined) resolvedClips[i].dramatic   = ann.dramatic;
        if (ann.kenBurns   !== undefined) resolvedClips[i].kenBurns   = ann.kenBurns;
        if (ann.transition !== undefined) resolvedClips[i].transition = ann.transition;
        if ((ann.caption as string | undefined)?.trim()) resolvedClips[i].caption = ann.caption;
        // Keyframe brightness analysis — determines whether overlay is needed per region
        const kf = resolvedClips[i].keyframePath as string | undefined;
        if (kf) {
          const textBg = analyzeKeyframe(kf, ex.compositionId);
          resolvedClips[i].textBg = textBg;
          const bgSummary = Object.entries(textBg).map(([k, v]) => `${k.split('.')[1]}:${v}`).join(' ');
          console.log(`      [${i+1}] ${JSON.stringify(ann)} bg:[${bgSummary}] ← "${resolvedClips[i].summary?.slice(0,40)}"`);
        } else {
          console.log(`      [${i+1}] ${JSON.stringify(ann)} ← "${resolvedClips[i].summary?.slice(0,45)}"`);
        }
      }

      const props = meta.buildProps(resolvedClips, ex.title, bgmUrls[ex.compositionId]);
      const outFile = path.join(OUTPUT_DIR, `${ex.bgmSlug}-${ts}.mp4`);
      await renderComposition(ex.compositionId, props, outFile);
    }
    console.log('\n🎉 全部渲染完成！');
    console.log(`   📁 ${OUTPUT_DIR}`);
  } finally {
    stopServer();
  }
}

main().catch(err => {
  console.error('\n💥 Fatal:', err.message);
  process.exit(1);
});
