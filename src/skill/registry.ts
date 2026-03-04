/**
 * Remotion Composition Registry
 *
 * Each CompositionMeta describes one Remotion composition:
 *   - How to build its props from a list of resolved shots
 *   - What search queries to use per shot slot
 *   - What music style description to pass to the Music Layer
 *
 * Adding a new composition = adding one entry here. The CLI and Orchestrator
 * discover compositions purely through this registry.
 */
import path from 'path';

// ─── Core interfaces ──────────────────────────────────────────────────────────

export interface ShotSlot {
  /** Natural language query for ShotAI semantic search (Chinese or English) */
  query: string;
  /** Expected mood for shot scoring: 'fast' | 'slow' | 'urban' | 'calm' | … */
  mood?: string;
  /** Optional extra data merged into the final clip prop (e.g. cityName) */
  extra?: Record<string, unknown>;
}

export interface ResolvedClip {
  /** HTTP URL served by the local file server */
  src: string;
  startTime: number;
  endTime: number;
  summary: string;
  [key: string]: unknown;
}

export interface CompositionMeta {
  /** Must match the id used in src/remotion/Root.tsx */
  id: string;
  /** Human-readable label shown in CLI selection */
  label: string;
  /** Short description for the LLM agent to choose between compositions */
  description: string;
  /** Music style description passed to the Music Layer */
  musicStyle: string;
  /** Ordered list of shot slots — one element = one clip used in the render */
  shotSlots: ShotSlot[];
  /**
   * Build the Remotion input props from resolved clips.
   * `title` is the theme/title extracted from user intent.
   * `bgm` is the HTTP URL of the background music file (may be undefined).
   * `showAttribution` controls whether to show "ShotAI 检索 · Remotion 合成" in the outro.
   */
  buildProps(clips: ResolvedClip[], title: string, bgm: string | undefined, showAttribution?: boolean): Record<string, unknown>;
}

// ─── CyberpunkCity ────────────────────────────────────────────────────────────

const cyberpunkMeta: CompositionMeta = {
  id:          'CyberpunkCity',
  label:       '赛博朋克夜景',
  description: '扫描线叠加 + 故障闪烁 + 霓虹发光城市名标题，适合夜晚都市/科技感主题',
  musicStyle:  'cyberpunk electronic synthwave dark neon city',
  shotSlots: [
    { query: 'neon lights wet street reflection night',  mood: 'urban' },
    { query: 'Victoria Harbour night skyline lights',    mood: 'urban' },
    { query: 'Hong Kong night market signs crowd neon',  mood: 'urban' },
    { query: 'city skyline night buildings lights',      mood: 'urban' },
    { query: 'glass facade neon reflection city night',  mood: 'urban' },
    { query: 'dense skyscrapers lights high-rise night', mood: 'urban' },
  ],
  buildProps(clips, title, bgm, showAttribution = true) {
    return {
      fps:      30,
      cityName: title,
      subtitle: 'CITY PULSE',
      tagline:  showAttribution ? 'ShotAI Search · Remotion Render' : undefined,
      bgm,
      clips: clips.map(c => ({
        src:       c.src,
        startTime: c.startTime,
        endTime:   c.endTime,
        summary:   c.summary,
      })),
    };
  },
};

// ─── TravelVlog ───────────────────────────────────────────────────────────────

const DEFAULT_TRAVEL_SLOTS: ShotSlot[] = [
  { query: '红色鸟居神社',       mood: 'calm', extra: { cityName: '东京 🇯🇵', cityColor: '#e63946' } },
  { query: '富士山自然风光',     mood: 'calm', extra: { cityName: '富士山 🗻', cityColor: '#e63946' } },
  { query: '樱花河畔日本风景',   mood: 'calm', extra: { cityName: '京都 🌸',  cityColor: '#e63946' } },
  { query: '埃菲尔铁塔日落航拍', mood: 'calm', extra: { cityName: '巴黎 🇫🇷', cityColor: '#f4d03f' } },
  { query: '凯旋门交通环岛俯瞰', mood: 'calm', extra: { cityName: '巴黎 🇫🇷', cityColor: '#f4d03f' } },
  { query: '塞纳河巴黎城市全景', mood: 'calm', extra: { cityName: '巴黎 🇫🇷', cityColor: '#f4d03f' } },
];

const travelMeta: CompositionMeta = {
  id:          'TravelVlog',
  label:       '旅行 Vlog',
  description: '城市名片卡弹出 + 白色闪光转场 + 底部进度条，适合多地点旅行记录',
  musicStyle:  'travel acoustic cinematic upbeat vlog background',
  shotSlots:   DEFAULT_TRAVEL_SLOTS,
  buildProps(clips, title, bgm, showAttribution = true) {
    return {
      fps: 30,
      title,
      bgm,
      attribution: showAttribution ? 'ShotAI 检索 · Remotion 合成' : undefined,
      clips: clips.map(c => ({
        src:       c.src,
        startTime: c.startTime,
        endTime:   c.endTime,
        summary:   c.summary,
        cityName:  c.cityName ?? '',
        cityColor: c.cityColor ?? '#ffffff',
        textBg:    c.textBg ?? {},
      })),
    };
  },
};

// ─── MoodDriven ───────────────────────────────────────────────────────────────

const moodMeta: CompositionMeta = {
  id:          'MoodDriven',
  label:       '情绪驱动混剪',
  description: '快切能量闪光（fast） + 慢溶解歌词字幕（slow），适合情绪化短片/氛围剪辑',
  musicStyle:  'cinematic lofi ambient slow calm emotional',
  shotSlots: [
    { query: '城市快节奏街道人流', mood: 'fast', extra: { mood: 'fast' } },
    { query: '高楼密集璀璨夜光',   mood: 'fast', extra: { mood: 'fast' } },
    { query: '金色日落余晖自然',   mood: 'slow', extra: { mood: 'slow' } },
    { query: '霓虹穿梭都市快切',   mood: 'fast', extra: { mood: 'fast' } },
    { query: '阳光草地慢镜宁静',   mood: 'slow', extra: { mood: 'slow' } },
    { query: '城市建筑静谧航拍',   mood: 'slow', extra: { mood: 'slow' } },
  ],
  buildProps(clips, title, bgm, showAttribution = true) {
    return {
      fps: 30,
      title,
      bgm,
      attribution: showAttribution ? 'ShotAI 检索 · Remotion 合成' : undefined,
      clips: clips.map(c => ({
        src:       c.src,
        startTime: c.startTime,
        endTime:   c.endTime,
        summary:   c.summary,
        mood:      c.mood ?? 'slow',
        textBg:    c.textBg ?? {},
      })),
    };
  },
};

// ─── NatureWild ───────────────────────────────────────────────────────────────

const natureMeta: CompositionMeta = {
  id:          'NatureWild',
  label:       '自然野生动物',
  description: 'BBC纪录片风格：溶接转场 + Ken Burns推镜 + 叙事标注卡，适合自然/野生动物主题',
  musicStyle:  'nature documentary ambient orchestral peaceful wildlife',
  // 叙事弧：大地觉醒 → 捕食者 → 海洋世界 → 植物生命 → 群居动物 → 夜行者 → 自然循环
  shotSlots: [
    { query: 'aerial forest river landscape nature wide',         mood: 'slow', extra: { scene: 'THE LIVING EARTH',      caption: '地球上，每一天都是新的开始' } },
    { query: 'black panther running hunting stalking',            mood: 'slow', extra: { scene: 'SOUTH AFRICA · SAVANNA', caption: '黑豹，独行者，暗影中的猎手' } },
    { query: 'fish swimming ocean underwater sunlight',           mood: 'slow', extra: { scene: 'PACIFIC OCEAN · DEEP',   caption: '海洋覆盖地球七成，却仍是谜' } },
    { query: 'bird diving fish catching ocean wave',              mood: 'slow', extra: { scene: 'OPEN SEA',               caption: '天与海之间，猎与被猎的永恒' } },
    { query: 'flowers bloom macro petal close nature',            mood: 'slow', extra: { scene: 'TEMPERATE GARDEN',       caption: '一朵花的一生，只有几天' } },
    { query: 'capybara swimming floating water peaceful',         mood: 'calm', extra: { scene: 'SOUTH AMERICA · WETLAND','caption': '水豚不慌不忙，这才是活法' } },
    { query: 'mountain lion cougar walking forest night dark',    mood: 'slow', extra: { scene: 'ROCKY MOUNTAINS · DUSK', caption: '暮色降临，山狮才真正醒来' } },
    { query: 'rainforest canopy aerial green dense',              mood: 'slow', extra: { scene: 'AMAZON BASIN',           caption: '雨林是地球的肺，也是万物的家' } },
    { query: 'bird silhouette sunset sky flying alone',           mood: 'slow', extra: { scene: 'GOLDEN HOUR',            caption: '候鸟向南，它知道季节的秘密' } },
    { query: 'mountain lion family cubs nocturnal night',         mood: 'slow', extra: { scene: 'AFTER DARK',             caption: '夜，才是它们的白天' } },
  ],
  buildProps(clips, title, bgm, showAttribution = true) {
    return {
      fps: 30, title, bgm,
      attribution: showAttribution ? 'ShotAI 检索 · Remotion 合成' : undefined,
      clips: clips.map(c => ({
        src: c.src, startTime: c.startTime, endTime: c.endTime, summary: c.summary,
        scene: c.scene ?? '', caption: c.caption ?? '',
        kenBurns: c.kenBurns ?? 'zoom-in',
        textBg: c.textBg ?? {},
      })),
    };
  },
};

// ─── SwitzerlandScenic ────────────────────────────────────────────────────────

const switzerlandMeta: CompositionMeta = {
  id:          'SwitzerlandScenic',
  label:       '瑞士风光',
  description: '山地电影感：溶接转场 + Ken Burns + 底部叙事字幕，徒步者视角叙事弧，适合自然旅行主题',
  musicStyle:  'alpine acoustic orchestral cinematic peaceful mountain travel',
  shotSlots: [
    { query: 'mountain peaks snow alps wide aerial',          mood: 'calm', extra: { location: 'SWISS ALPS',       caption: '世界的屋脊，从这里开始',     tone: 'cool' } },
    { query: 'person hiking trail mountain path',             mood: 'calm', extra: { location: 'MOUNTAIN TRAIL',   caption: '每一步，都是与自己的对话',   tone: 'cool' } },
    { query: 'green meadow rolling hills grass',              mood: 'calm', extra: { location: 'ALPINE MEADOW',    caption: '翻过这片草甸，世界忽然开阔', tone: 'warm' } },
    { query: 'waterfall river mountain stream swimming',      mood: 'slow', extra: { location: 'MOUNTAIN STREAM', caption: '冰雪融化，奔流向远方',       tone: 'cool' } },
    { query: 'mountain summit peak wide panorama',            mood: 'slow', extra: { location: 'SUMMIT',           caption: '站在这里，才懂得渺小的意义', tone: 'cool' } },
    { query: 'lake reflection calm water mountain shore',     mood: 'slow', extra: { location: 'ALPINE LAKE',      caption: '湖面如镜，倒映另一个世界',   tone: 'cool' } },
    { query: 'alpine flowers wildflowers spring mountain',    mood: 'calm', extra: { location: 'WILDFLOWER FIELD', caption: '六月的高山，是花的海洋',     tone: 'warm' } },
    { query: 'european village small town valley overlook',   mood: 'calm', extra: { location: 'VALLEY VILLAGE',  caption: '小镇藏在山谷，时间慢下来',   tone: 'warm' } },
    { query: 'sunset golden hour mountain silhouette sky',    mood: 'slow', extra: { location: 'GOLDEN HOUR',      caption: '光线拉长，一天的行程落幕',   tone: 'warm' } },
    { query: 'couple van road trip mountain scenic overlook', mood: 'calm', extra: { location: 'ON THE ROAD',      caption: '带上行李，去找下一座山',     tone: 'warm' } },
  ],
  buildProps(clips, title, bgm, showAttribution = true) {
    return {
      fps: 30, title, bgm,
      attribution: showAttribution ? 'ShotAI 检索 · Remotion 合成' : undefined,
      clips: clips.map(c => ({
        src: c.src, startTime: c.startTime, endTime: c.endTime, summary: c.summary,
        location: c.location ?? '', caption: c.caption ?? '', tone: c.tone ?? 'cool',
        textBg: c.textBg ?? {},
      })),
    };
  },
};

// ─── SportsHighlight ─────────────────────────────────────────────────────────

/**
 * MBAPPE VS. MESSI — 2018 FIFA World Cup R16: France 4-3 Argentina
 * Video ID: 1e893cf4-8ddc-4c88-acad-57244a55b37f
 *
 * Goals (chronological):
 *  13' Griezmann pen  → 1-0 FRA
 *  41' Di Maria       → 1-1
 *  48' Mercado        → 2-1 ARG
 *  57' Pavard volley  → 2-2
 *  59' Mbappé         → 3-2 FRA
 *  64' Mbappé         → 4-2 FRA
 *  90' Agüero         → 4-3 ARG
 *
 * Each slot targets one goal moment. The make script will filter by this videoId,
 * fetch multiple candidates around the goal, and sort final clips by startTime.
 */
export const MBAPPE_MESSI_VIDEO_ID = '1e893cf4-8ddc-4c88-acad-57244a55b37f';
export const MBAPPE_MESSI_VIDEO_PATH = '/Users/hangdong/Downloads/MBAPPE VS. MESSI ｜ 2018 FIFA World Cup： France v Argentina.mp4';

const sportsMeta: CompositionMeta = {
  id:          'SportsHighlight',
  label:       '法阿世界杯进球集锦',
  description: 'ESPN风格足球进球集锦：快切 + 能量进度条 + 叙事字幕，完整呈现法国vs阿根廷2018世界杯全部进球',
  musicStyle:  'hiphop sports energy trap beat motivational intense',
  // 7 goals in chronological order from France 4-3 Argentina, 2018 FIFA WC R16
  // goalAt: video timestamp (seconds) confirmed by ShotAI scan of all goal moments
  shotSlots: [
    { query: 'Griezmann penalty kick goal France Argentina 2018',  mood: 'fast', extra: { sport: 'football', caption: '1-0 ⚽ 格列兹曼 13\'', goalAt: 778 } },
    { query: 'Di Maria long shot goal Argentina France',           mood: 'fast', extra: { sport: 'football', caption: '1-1 ⚽ 迪马利亚 41\'', goalAt: 648 } },
    { query: 'Mercado goal Argentina France score',                mood: 'fast', extra: { sport: 'football', caption: '2-1 ⚽ 梅卡多 48\'',  goalAt: 2858 } },
    { query: 'Pavard volley goal France Argentina spectacular',    mood: 'fast', extra: { sport: 'football', caption: '2-2 ⚽ 帕瓦尔 57\'',  goalAt: 2956 } },
    { query: 'Mbappe goal sprint France Argentina World Cup',      mood: 'fast', extra: { sport: 'football', caption: '3-2 ⚽ 姆巴佩 59\'',  goalAt: 3718 } },
    { query: 'Mbappe second goal France Argentina 64 minutes',     mood: 'fast', extra: { sport: 'football', caption: '4-2 ⚽ 姆巴佩 64\'',  goalAt: 3884 } },
    { query: 'Aguero goal Argentina France late consolation',      mood: 'fast', extra: { sport: 'football', caption: '4-3 ⚽ 阿圭罗 90\'',  goalAt: 5270 } },
  ],
  buildProps(clips, title, bgm, showAttribution = true) {
    return {
      fps: 30, title, bgm,
      attribution: showAttribution ? 'ShotAI 检索 · Remotion 合成' : undefined,
      clips: clips.map(c => ({
        src: c.src, startTime: c.startTime, endTime: c.endTime, summary: c.summary,
        sport: c.sport ?? 'football', caption: c.caption ?? '', dramatic: c.dramatic ?? false,
        textBg: c.textBg ?? {},
      })),
    };
  },
};


// ─── Registry ─────────────────────────────────────────────────────────────────

export const REGISTRY: CompositionMeta[] = [
  cyberpunkMeta,
  travelMeta,
  moodMeta,
  natureMeta,
  switzerlandMeta,
  sportsMeta,
];

/** Look up a composition by id (case-insensitive). */
export function findComposition(id: string): CompositionMeta | undefined {
  return REGISTRY.find(m => m.id.toLowerCase() === id.toLowerCase());
}

/** Derive output filename for a composition render. */
export function outputFilename(meta: CompositionMeta, outputDir: string): string {
  const slug = meta.id.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1);
  return path.join(outputDir, `${slug}-${Date.now()}.mp4`);
}
