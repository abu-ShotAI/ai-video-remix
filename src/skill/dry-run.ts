#!/usr/bin/env node
/**
 * dry-run.ts — 模拟完整 pipeline，所有外部调用都 mock 掉
 *
 * 不需要 ShotAI 运行，不需要 ffmpeg，不需要 Remotion，不需要 LLM API key。
 * LLM 响应由内置 mock 提供（模拟真实 LLM 的合理输出）。
 *
 * 测试三个场景：
 *   scenario-1  标准模式（固定模板）
 *   scenario-2  probe 模式（库探索 → 动态 slots）
 *   scenario-3  probe + 指定模板
 *
 * 用法:
 *   npx tsx src/skill/dry-run.ts
 *   npx tsx src/skill/dry-run.ts scenario-1
 */

import { REGISTRY } from './registry';
import {
  AgentProvider, ParsedIntent, ClipAnnotation,
  LibrarySummary, DynamicPlan, LLMBackend,
} from './agent';

// ─── Mock LLM Backend ─────────────────────────────────────────────────────────
// Simulates what a real LLM would return for each call type.

class MockLLMBackend implements LLMBackend {
  private callCount = 0;

  async callLLM(system: string, user: string): Promise<string> {
    this.callCount++;
    const n = this.callCount;

    // Identify call type by system prompt content
    if (system.includes('选择最合适的合成风格')) {
      // parseIntent
      return JSON.stringify({
        theme:        '香港赛博朋克夜景',
        compositionId: 'CyberpunkCity',
        musicStyleOverride: 'cyberpunk synthwave neon electronic dark',
      });
    }

    if (system.includes('镜头搜索词优化')) {
      // refineQueries — extract slot count from user message
      const match = user.match(/共 (\d+) 个/);
      const count = match ? parseInt(match[1]) : 6;
      const queries = [
        '维多利亚港霓虹灯夜反光路面',
        '旺角夜市密集招牌人流',
        '尖沙咀海岸夜景灯光璀璨',
        '中环高楼幕墙霓虹倒影',
        '深水埗电子产品招牌夜晚',
        '港铁车窗穿梭城市灯光',
        '天际线航拍香港夜晚广角',
        '兰桂坊夜生活人群街道',
      ].slice(0, count);
      return JSON.stringify(queries);
    }

    if (system.includes('视效助手') || system.includes('视觉特效注解')) {
      // annotateClips — return one annotation per clip
      const match = user.match(/共 (\d+) 个/);
      const count = match ? parseInt(match[1]) : 4;
      const annotations = Array.from({ length: count }, (_, i) => ({
        tone: i % 3 === 0 ? 'cool' : 'warm',
        kenBurns: ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'][i % 4],
        dramatic: i === 1,
      }));
      return JSON.stringify(annotations);
    }

    if (system.includes('混剪规划师') || system.includes('库里实际')) {
      // planFromLibrary
      return JSON.stringify({
        theme: '我的素材库精选混剪',
        compositionId: 'MoodDriven',
        musicStyle: 'cinematic lofi ambient emotional',
        slots: [
          { query: '城市街道夜晚快节奏人流', mood: 'fast' },
          { query: '高楼夜景璀璨灯光航拍', mood: 'urban' },
          { query: '自然日落金色余晖草地', mood: 'slow' },
          { query: '溪流山间慢镜宁静自然', mood: 'slow' },
          { query: '运动员竞技激烈快切', mood: 'fast' },
          { query: '海边日落情侣慢速', mood: 'slow' },
        ],
      });
    }

    return '{}';
  }
}

// ─── Mock ShotAI Library ──────────────────────────────────────────────────────

const MOCK_LIBRARY: LibrarySummary = {
  videos: [
    {
      name: 'HongKong_Night_4K.mp4',
      duration: 3600,
      shotCount: 247,
      sampleSummaries: [
        'Aerial shot of Victoria Harbour at night, neon reflections on water',
        'Close-up of neon signs in Mong Kok street market, dense crowd',
        'Time-lapse of Central skyline with glowing buildings',
        'Underground MTR train passing through illuminated tunnel',
        'Rain-soaked street in Wan Chai reflecting colorful signs',
      ],
      moods: ['urban', 'fast', 'energetic'],
      scenes: ['city', 'night', 'street', 'aerial'],
    },
    {
      name: 'Nature_Wildlife_BBC.mp4',
      duration: 5400,
      shotCount: 389,
      sampleSummaries: [
        'Black panther stalking through dense African savanna grass',
        'Aerial view of Amazon rainforest canopy at golden hour',
        'Capybara family swimming peacefully in a South American wetland',
        'Bird of prey diving at high speed toward ocean surface',
        'Time-lapse of tropical flowers blooming in macro',
      ],
      moods: ['calm', 'slow', 'dramatic'],
      scenes: ['nature', 'wildlife', 'forest', 'ocean'],
    },
    {
      name: 'Sports_FIFA_2018.mp4',
      duration: 6300,
      shotCount: 512,
      sampleSummaries: [
        'Mbappe sprinting past three defenders in France vs Argentina',
        'Crowd erupting in stadium after goal scored',
        'Close-up of goalkeeper diving to save penalty kick',
        'Wide shot of packed stadium with fans waving flags',
        'Slow-motion replay of bicycle kick attempt',
      ],
      moods: ['energetic', 'intense', 'fast'],
      scenes: ['stadium', 'sport', 'crowd', 'field'],
    },
  ],
};

// ─── Mock Shot Results ────────────────────────────────────────────────────────

function makeMockShots(queries: string[]) {
  return queries.map((q, i) => ({
    id:           `shot-mock-${i.toString().padStart(3, '0')}`,
    videoId:      'video-mock-001',
    videoName:    'HongKong_Night_4K.mp4',
    videoPath:    '/mock/HongKong_Night_4K.mp4',
    startTime:    i * 15.0,
    endTime:      i * 15.0 + 8.5,
    duration:     8.5,
    summary:      `[Mock] ${q.slice(0, 50)}`,
    keyframePath: `/mock/keyframes/shot-${i}.jpg`,
    similarity:   0.82 - i * 0.02,
    score:        0.78 - i * 0.02,
    tags: {
      subjects: ['city', 'night'],
      actions:  ['static'],
      scene:    'urban',
      mood:     i % 2 === 0 ? 'urban' : 'calm',
    },
  }));
}

// ─── Dry-Run Runner ───────────────────────────────────────────────────────────

interface ScenarioConfig {
  name: string;
  userRequest: string;
  probe: boolean;
  compositionId?: string;
  bgmPath?: string;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    name:        'scenario-1 — 标准模式（固定模板，LLM 选合成）',
    userRequest: '帮我做香港夜景赛博朋克混剪',
    probe:       false,
  },
  {
    name:        'scenario-2 — probe 模式（LLM 看库内容 → 动态 slots）',
    userRequest: '帮我做一条混剪',
    probe:       true,
  },
  {
    name:        'scenario-3 — probe + 指定模板（库探索但锁定合成）',
    userRequest: '做一条运动感混剪',
    probe:       true,
    compositionId: 'SportsHighlight',
  },
];

async function runScenario(cfg: ScenarioConfig) {
  const sep = '─'.repeat(60);
  console.log(`\n${sep}`);
  console.log(`🎬 ${cfg.name}`);
  console.log(`   需求: "${cfg.userRequest}"`);
  if (cfg.compositionId) console.log(`   锁定合成: ${cfg.compositionId}`);
  console.log(sep);

  const backend = new MockLLMBackend();

  // ── Step 1: Intent / Library Probe ────────────────────────────────────────
  let theme: string;
  let compositionId: string;
  let musicStyle: string;
  let activeSlots: Array<{ query: string; mood?: string; extra?: Record<string, unknown> }>;

  if (cfg.probe) {
    console.log('\n[1/6] 🔭 探索素材库...');
    console.log(`   发现 ${MOCK_LIBRARY.videos.length} 个视频:`);
    MOCK_LIBRARY.videos.forEach(v =>
      console.log(`     • ${v.name}  (${Math.round(v.duration / 60)}min, ${v.shotCount}shots, moods: ${v.moods.join('/')})`),
    );

    console.log('\n   🤖 [LLM] planFromLibrary 调用...');
    console.log('   INPUT system: "你是一个视频混剪规划师..."');
    console.log(`   INPUT user: 库内容摘要(${MOCK_LIBRARY.videos.reduce((s, v) => s + v.sampleSummaries.length, 0)}条样本) + 用户需求: "${cfg.userRequest}"`);

    const plan = await backend.callLLM(
      '你是一个视频混剪规划师。用户有一个视频素材库，你需要根据库里实际存在的素材...',
      `用户需求：${cfg.userRequest}`,
    ).then(r => JSON.parse(r) as DynamicPlan);

    const resolvedMeta = cfg.compositionId
      ? (REGISTRY.find(m => m.id === cfg.compositionId) ?? REGISTRY.find(m => m.id === plan.compositionId)!)
      : (REGISTRY.find(m => m.id === plan.compositionId) ?? REGISTRY[0]);

    theme        = plan.theme;
    compositionId = resolvedMeta.id;
    musicStyle   = plan.musicStyle;
    activeSlots  = plan.slots;

    console.log(`\n   OUTPUT: {`);
    console.log(`     theme: "${theme}"`);
    console.log(`     compositionId: "${compositionId}" → ${resolvedMeta.label}`);
    console.log(`     musicStyle: "${musicStyle}"`);
    console.log(`     slots: ${activeSlots.length}个`);
    activeSlots.forEach((s, i) => console.log(`       ${i + 1}. "${s.query}"  [${s.mood ?? 'any'}]`));
    console.log('   }');
  } else {
    console.log('\n[1/6] 🤖 [LLM] parseIntent 调用...');
    console.log(`   INPUT system: "你是一个视频混剪规划助手..."`);
    console.log(`   INPUT user: 可选合成列表 + 用户需求: "${cfg.userRequest}"`);

    const result = await backend.callLLM(
      '你是一个视频混剪规划助手。根据用户的混剪需求，选择最合适的合成风格并提取主题。',
      cfg.userRequest,
    ).then(r => JSON.parse(r));

    const resolvedMeta = cfg.compositionId
      ? (REGISTRY.find(m => m.id === cfg.compositionId) ?? REGISTRY.find(m => m.id === result.compositionId)!)
      : (REGISTRY.find(m => m.id === result.compositionId) ?? REGISTRY[0]);

    theme         = result.theme;
    compositionId = resolvedMeta.id;
    musicStyle    = result.musicStyleOverride ?? resolvedMeta.musicStyle;
    activeSlots   = resolvedMeta.shotSlots;

    console.log(`\n   OUTPUT: {`);
    console.log(`     theme: "${theme}"`);
    console.log(`     compositionId: "${compositionId}" → ${resolvedMeta.label}`);
    console.log(`     musicStyle: "${musicStyle}"`);
    console.log(`     slots: ${activeSlots.length}个 (来自 registry)`);
    activeSlots.slice(0, 3).forEach((s, i) => console.log(`       ${i + 1}. "${s.query}"  [${s.mood ?? 'any'}]`));
    if (activeSlots.length > 3) console.log(`       ... 共 ${activeSlots.length} 个`);
    console.log('   }');
  }

  // ── Step 2: Refine Queries ─────────────────────────────────────────────────
  console.log('\n[2/6] 🤖 [LLM] refineQueries 调用...');
  console.log(`   INPUT: ${activeSlots.length}个默认搜索词 + 主题"${theme}"`);

  const refinedRaw = await backend.callLLM(
    '你是一个镜头搜索词优化助手。根据用户的视频主题，为每个镜头槽位生成更精准的中文语义搜索词...',
    `视频主题：${theme}\n镜头槽位（共 ${activeSlots.length} 个）：...`,
  );
  const refinedQueries = JSON.parse(refinedRaw) as string[];

  console.log(`   OUTPUT: [${refinedQueries.map(q => `"${q.slice(0, 25)}..."`).join(', ')}]`);

  // ── Step 3: ShotAI MCP ────────────────────────────────────────────────────
  console.log('\n[3/6] 🎞  ShotAI MCP 语义搜索镜头... (mock)');
  const mockShots = makeMockShots(refinedQueries);
  mockShots.forEach((s, i) =>
    console.log(`   ✓ [${i + 1}/${mockShots.length}] score=${s.score.toFixed(2)}  [${s.startTime.toFixed(1)}s→${s.endTime.toFixed(1)}s]  "${s.summary.slice(0, 45)}"`)
  );

  // ── Step 4: Music ─────────────────────────────────────────────────────────
  console.log('\n[4/6] 🎵 配乐解析... (mock)');
  console.log(`   musicStyle: "${musicStyle}"`);
  console.log(`   → mock BGM: http://127.0.0.1:9877/bgm-mock.mp3`);

  // ── Step 5: Extract Clips ────────────────────────────────────────────────
  console.log('\n[5/6] ✂️  ffmpeg 提取片段... (mock)');
  mockShots.forEach((s, i) =>
    console.log(`   ✂️  clip-${String(i).padStart(3, '0')}.mp4  [${s.startTime.toFixed(1)}s → ${s.endTime.toFixed(1)}s]  dur=${s.duration.toFixed(1)}s`)
  );

  // ── Step 6: Annotate Clips ────────────────────────────────────────────────
  console.log('\n[6/6] 🤖 [LLM] annotateClips 调用...');
  console.log(`   INPUT: ${mockShots.length}个 clip summary + compositionId="${compositionId}"`);
  mockShots.forEach((s, i) => console.log(`     ${i + 1}. "${s.summary.slice(0, 50)}"`));

  const annotationsRaw = await backend.callLLM(
    '你是一个视频剪辑视效助手。根据每个镜头的语义描述，为每个镜头生成精准的视觉特效注解。',
    `合成ID：${compositionId}\n镜头列表（共 ${mockShots.length} 个）：...`,
  );
  const annotations = JSON.parse(annotationsRaw) as ClipAnnotation[];

  console.log(`   OUTPUT:`);
  annotations.forEach((a, i) => console.log(`     [${i + 1}] ${JSON.stringify(a)}`));

  // ── Summary ───────────────────────────────────────────────────────────────
  const meta = REGISTRY.find(m => m.id === compositionId)!;
  const mockClips = mockShots.map((s, i) => ({
    src:       `http://127.0.0.1:9877/clip-${String(i).padStart(3, '0')}.mp4`,
    startTime: 0,
    endTime:   s.duration,
    summary:   s.summary,
    ...activeSlots[i]?.extra,
    ...(annotations[i] ?? {}),
  }));

  console.log('\n[7/6] 🎬 Remotion render... (mock — 跳过实际渲染)');
  console.log(`   compositionId: ${compositionId}`);
  console.log(`   props: ${JSON.stringify(meta.buildProps(mockClips, theme, 'http://127.0.0.1:9877/bgm-mock.mp3'), null, 2).split('\n').slice(0, 8).join('\n')}...`);
  console.log(`\n✅ Dry-run 完成！`);
  console.log(`   主题:  ${theme}`);
  console.log(`   合成:  ${compositionId}  (${meta.label})`);
  console.log(`   Clips: ${mockClips.length}个`);
  console.log(`   输出:  ./output/${compositionId.toLowerCase()}-dryrun-${Date.now()}.mp4 (未实际写入)`);
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2];
  const targets = arg
    ? SCENARIOS.filter(s => s.name.startsWith(arg))
    : SCENARIOS;

  if (targets.length === 0) {
    console.error(`未找到场景: ${arg}`);
    console.log('可用: ' + SCENARIOS.map(s => s.name.split(' ')[0]).join(', '));
    process.exit(1);
  }

  for (const scenario of targets) {
    await runScenario(scenario);
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
