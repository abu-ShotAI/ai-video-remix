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
   * `showAttribution` controls whether to show attribution text in the outro.
   * `lang` controls the language of all on-screen text ('zh' | 'en', default 'zh').
   */
  buildProps(clips: ResolvedClip[], title: string, bgm: string | undefined, showAttribution?: boolean, lang?: 'zh' | 'en'): Record<string, unknown>;
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
  buildProps(clips, title, bgm, showAttribution = true, lang = 'zh') {
    return {
      fps:      30,
      cityName: title,
      subtitle: lang === 'en' ? 'CITY PULSE' : 'CITY PULSE',
      tagline:  showAttribution ? (lang === 'en' ? 'ShotAI Search · Remotion Render' : 'ShotAI 检索 · Remotion 合成') : undefined,
      bgm,
      clips: clips.map(c => ({
        src:       c.src,
        startTime: c.startTime,
        endTime:   c.endTime,
        summary:   c.summary,
        caption:   lang === 'en' ? (c.captionEn ?? c.caption ?? '') : (c.caption ?? ''),
        tone:      c.tone ?? 'cool',
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
  buildProps(clips, title, bgm, showAttribution = true, lang = 'zh') {
    return {
      fps: 30,
      title,
      bgm,
      attribution: showAttribution ? (lang === 'en' ? 'ShotAI Search · Remotion Render' : 'ShotAI 检索 · Remotion 合成') : undefined,
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
  buildProps(clips, title, bgm, showAttribution = true, lang = 'zh') {
    return {
      fps: 30,
      title,
      bgm,
      attribution: showAttribution ? (lang === 'en' ? 'ShotAI Search · Remotion Render' : 'ShotAI 检索 · Remotion 合成') : undefined,
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

// Bilingual slot data for NatureWild
const NATURE_SLOTS: Array<ShotSlot & { captionEn: string }> = [
  { query: 'aerial forest river landscape nature wide',         mood: 'slow', extra: { scene: 'THE LIVING EARTH',      caption: '地球上，每一天都是新的开始' }, captionEn: 'On Earth, every day is a new beginning' },
  { query: 'black panther running hunting stalking',            mood: 'slow', extra: { scene: 'SOUTH AFRICA · SAVANNA', caption: '黑豹，独行者，暗影中的猎手' }, captionEn: 'The leopard — solitary hunter in the shadows' },
  { query: 'fish swimming ocean underwater sunlight',           mood: 'slow', extra: { scene: 'PACIFIC OCEAN · DEEP',   caption: '海洋覆盖地球七成，却仍是谜' }, captionEn: 'The ocean covers 70% of Earth — yet remains a mystery' },
  { query: 'bird diving fish catching ocean wave',              mood: 'slow', extra: { scene: 'OPEN SEA',               caption: '天与海之间，猎与被猎的永恒' }, captionEn: 'Between sky and sea — the eternal hunt' },
  { query: 'flowers bloom macro petal close nature',            mood: 'slow', extra: { scene: 'TEMPERATE GARDEN',       caption: '一朵花的一生，只有几天' }, captionEn: 'A flower\'s entire life — only a few days' },
  { query: 'capybara swimming floating water peaceful',         mood: 'calm', extra: { scene: 'SOUTH AMERICA · WETLAND', caption: '水豚不慌不忙，这才是活法' }, captionEn: 'The capybara — unhurried, unbothered, living right' },
  { query: 'mountain lion cougar walking forest night dark',    mood: 'slow', extra: { scene: 'ROCKY MOUNTAINS · DUSK', caption: '暮色降临，山狮才真正醒来' }, captionEn: 'As dusk falls, the mountain lion finally wakes' },
  { query: 'rainforest canopy aerial green dense',              mood: 'slow', extra: { scene: 'AMAZON BASIN',           caption: '雨林是地球的肺，也是万物的家' }, captionEn: 'The rainforest — Earth\'s lungs and home to all' },
  { query: 'bird silhouette sunset sky flying alone',           mood: 'slow', extra: { scene: 'GOLDEN HOUR',            caption: '候鸟向南，它知道季节的秘密' }, captionEn: 'The migrant bird flies south — it knows the secret of seasons' },
  { query: 'mountain lion family cubs nocturnal night',         mood: 'slow', extra: { scene: 'AFTER DARK',             caption: '夜，才是它们的白天' }, captionEn: 'Night is their day' },
];

const natureMeta: CompositionMeta = {
  id:          'NatureWild',
  label:       '自然野生动物',
  description: 'BBC纪录片风格：溶接转场 + Ken Burns推镜 + 叙事标注卡，适合自然/野生动物主题',
  musicStyle:  'nature documentary ambient orchestral peaceful wildlife',
  shotSlots:   NATURE_SLOTS,
  buildProps(clips, title, bgm, showAttribution = true, lang = 'zh') {
    return {
      fps: 30, title, bgm,
      attribution: showAttribution ? (lang === 'en' ? 'ShotAI Search · Remotion Render' : 'ShotAI 检索 · Remotion 合成') : undefined,
      clips: clips.map((c, i) => {
        const slotCaption = lang === 'en'
          ? (NATURE_SLOTS[i]?.captionEn ?? c.caption ?? '')
          : (c.caption ?? '');
        return {
          src: c.src, startTime: c.startTime, endTime: c.endTime, summary: c.summary,
          scene: c.scene ?? '',
          caption: (c as any)._captionOverridden ? c.caption : slotCaption,
          kenBurns: c.kenBurns ?? 'zoom-in',
          textBg: c.textBg ?? {},
        };
      }),
    };
  },
};

// ─── SwitzerlandScenic ────────────────────────────────────────────────────────

// Bilingual slot data for SwitzerlandScenic
const SWITZERLAND_SLOTS: Array<ShotSlot & { captionEn: string }> = [
  { query: 'mountain peaks snow alps wide aerial',          mood: 'calm', extra: { location: 'SWISS ALPS',       caption: '世界的屋脊，从这里开始',     tone: 'cool' }, captionEn: 'The roof of the world begins here' },
  { query: 'person hiking trail mountain path',             mood: 'calm', extra: { location: 'MOUNTAIN TRAIL',   caption: '每一步，都是与自己的对话',   tone: 'cool' }, captionEn: 'Every step — a conversation with yourself' },
  { query: 'green meadow rolling hills grass',              mood: 'calm', extra: { location: 'ALPINE MEADOW',    caption: '翻过这片草甸，世界忽然开阔', tone: 'warm' }, captionEn: 'Over the meadow, the world suddenly opens up' },
  { query: 'waterfall river mountain stream swimming',      mood: 'slow', extra: { location: 'MOUNTAIN STREAM',  caption: '冰雪融化，奔流向远方',       tone: 'cool' }, captionEn: 'Ice and snow melt, rushing toward the horizon' },
  { query: 'mountain summit peak wide panorama',            mood: 'slow', extra: { location: 'SUMMIT',           caption: '站在这里，才懂得渺小的意义', tone: 'cool' }, captionEn: 'Standing here, you understand what it means to be small' },
  { query: 'lake reflection calm water mountain shore',     mood: 'slow', extra: { location: 'ALPINE LAKE',      caption: '湖面如镜，倒映另一个世界',   tone: 'cool' }, captionEn: 'The lake, a mirror reflecting another world' },
  { query: 'alpine flowers wildflowers spring mountain',    mood: 'calm', extra: { location: 'WILDFLOWER FIELD', caption: '六月的高山，是花的海洋',     tone: 'warm' }, captionEn: 'June in the mountains — a sea of wildflowers' },
  { query: 'european village small town valley overlook',   mood: 'calm', extra: { location: 'VALLEY VILLAGE',   caption: '小镇藏在山谷，时间慢下来',   tone: 'warm' }, captionEn: 'A village hidden in the valley, where time slows down' },
  { query: 'sunset golden hour mountain silhouette sky',    mood: 'slow', extra: { location: 'GOLDEN HOUR',      caption: '光线拉长，一天的行程落幕',   tone: 'warm' }, captionEn: 'Light stretches long — the day\'s journey draws to a close' },
  { query: 'couple van road trip mountain scenic overlook', mood: 'calm', extra: { location: 'ON THE ROAD',      caption: '带上行李，去找下一座山',     tone: 'warm' }, captionEn: 'Pack your bags — the next mountain awaits' },
];

const switzerlandMeta: CompositionMeta = {
  id:          'SwitzerlandScenic',
  label:       '瑞士风光',
  description: '山地电影感：溶接转场 + Ken Burns + 底部叙事字幕，徒步者视角叙事弧，适合自然旅行主题',
  musicStyle:  'alpine acoustic orchestral cinematic peaceful mountain travel',
  shotSlots:   SWITZERLAND_SLOTS,
  buildProps(clips, title, bgm, showAttribution = true, lang = 'zh') {
    return {
      fps: 30, title, bgm,
      attribution: showAttribution ? (lang === 'en' ? 'ShotAI Search · Remotion Render' : 'ShotAI 检索 · Remotion 合成') : undefined,
      clips: clips.map((c, i) => {
        const slotCaption = lang === 'en'
          ? (SWITZERLAND_SLOTS[i]?.captionEn ?? c.caption ?? '')
          : (c.caption ?? '');
        return {
          src: c.src, startTime: c.startTime, endTime: c.endTime, summary: c.summary,
          location: c.location ?? '',
          caption: (c as any)._captionOverridden ? c.caption : slotCaption,
          tone: c.tone ?? 'cool',
          textBg: c.textBg ?? {},
        };
      }),
    };
  },
};

// ─── SportsHighlight ─────────────────────────────────────────────────────────

const sportsMeta: CompositionMeta = {
  id:          'SportsHighlight',
  label:       '运动高光时刻',
  description: 'ESPN风格运动高光集锦：快切 + 能量进度条 + 叙事字幕，适合足球/篮球/任意运动的精彩时刻混剪',
  musicStyle:  'hiphop sports energy trap beat motivational intense',
  shotSlots: [
    { query: 'athlete sprinting fast action sport competition',        mood: 'fast', extra: { sport: 'sport' } },
    { query: 'crowd fans cheering stadium celebration energy',         mood: 'fast', extra: { sport: 'sport' } },
    { query: 'player scoring goal basketball football slam dunk',      mood: 'fast', extra: { sport: 'sport' } },
    { query: 'team celebration victory moment group hug fist pump',   mood: 'fast', extra: { sport: 'sport' } },
    { query: 'close-up athlete face intense focus determination',      mood: 'fast', extra: { sport: 'sport' } },
    { query: 'dramatic tackle slide run sport action blur motion',     mood: 'fast', extra: { sport: 'sport' } },
    { query: 'sport highlight key moment winning play slow motion',    mood: 'fast', extra: { sport: 'sport' } },
  ],
  buildProps(clips, title, bgm, showAttribution = true, lang = 'zh') {
    return {
      fps: 30, title, bgm,
      attribution: showAttribution ? (lang === 'en' ? 'ShotAI Search · Remotion Render' : 'ShotAI 检索 · Remotion 合成') : undefined,
      clips: clips.map(c => ({
        src: c.src, startTime: c.startTime, endTime: c.endTime, summary: c.summary,
        sport: c.sport ?? 'sport',
        caption: lang === 'en' ? (c.captionEn ?? c.caption ?? '') : (c.caption ?? ''),
        dramatic: c.dramatic ?? false,
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
