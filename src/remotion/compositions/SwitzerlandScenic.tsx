/**
 * SwitzerlandScenic — 阿尔卑斯山旅行纪录片
 *
 * 风格：北欧/山地旅行电影感
 *   - 冷蓝/暖金双色调（根据镜头冷暖自适应滤镜）
 *   - 底部居中位置标注：地点名（英文大写）+ 叙事文字（中文）
 *   - @remotion/transitions fade 白底溶接 + springTiming
 *   - 轻微 Ken Burns
 *   - 右上角经纬度风格水印
 */
import React from 'react';
import {
  AbsoluteFill, OffthreadVideo, Sequence,
  useCurrentFrame,
  interpolate, spring,
} from 'remotion';
import { TransitionSeries, springTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { IntroCard, OutroCard, BGMAudio } from '../components/IntroOutro';

export interface ScenicClip {
  src: string;
  startTime: number;
  endTime: number;
  summary: string;
  location?: string;
  caption?: string;
  tone?: 'warm' | 'cool';
  /** Per-region brightness: 'light' = overlay needed */
  textBg?: Record<string, 'light' | 'dark'>;
}

const INTRO_FRAMES   = 75;
const OUTRO_FRAMES   = 90;
const TRANSITION_DUR = 24; // slower dissolve for scenic feel

const FADE_TIMING = springTiming({ config: { damping: 180 }, durationInFrames: TRANSITION_DUR });

function Vignette({ strength = 0.55 }: { strength?: number }) {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 9 }}>
      <div style={{
        width: '100%', height: '100%',
        background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${strength}) 100%)`,
      }} />
    </AbsoluteFill>
  );
}

function KenBurns({ dur, children }: { dur: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, dur], [1.0, 1.04], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: '55% 50%' }}>
      {children}
    </AbsoluteFill>
  );
}

/** 底部居中字幕卡 */
function CaptionCard({ location, caption, dur, needsBg }: { location?: string; caption?: string; dur: number; needsBg: boolean }) {
  const frame = useCurrentFrame();
  if (!location && !caption) return null;

  const opacity = interpolate(
    frame,
    [32, 48, Math.max(49, dur - 32), Math.max(50, dur - 14)],
    [0,   1,  1,                       0],
    { extrapolateRight: 'clamp' },
  );
  const y = spring({ frame: Math.max(0, frame - 32), fps: 30, from: 18, to: 0, durationInFrames: 18, config: { stiffness: 85 } });

  const gradientTop = needsBg ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.65)';
  const gradientMid = needsBg ? 'rgba(0,0,0,0.52)' : 'rgba(0,0,0,0.28)';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 15, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', opacity }}>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 280,
        background: `linear-gradient(to top, ${gradientTop} 0%, ${gradientMid} 55%, transparent 100%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ transform: `translateY(${y}px)`, textAlign: 'center', paddingBottom: 80, position: 'relative' }}>
        {location && (
          <div style={{
            fontFamily: 'sans-serif', fontSize: 28, fontWeight: 500,
            color: 'rgba(255,255,255,0.75)', letterSpacing: 6,
            textTransform: 'uppercase', textShadow: '0 1px 10px rgba(0,0,0,1)', marginBottom: 12,
          }}>
            {location}
          </div>
        )}
        <div style={{ width: 48, height: 2, background: 'rgba(255,255,255,0.6)', margin: '0 auto 14px' }} />
        {caption && (
          <div style={{
            fontFamily: 'serif', fontSize: 40, fontWeight: 300,
            color: '#fff', letterSpacing: 1, lineHeight: 1.45,
            textShadow: '0 2px 14px rgba(0,0,0,0.9)', maxWidth: 800,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {caption}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

/** 右上角坐标水印 */
function CoordWatermark() {
  return (
    <div style={{
      position: 'absolute', top: 72, right: 80, zIndex: 16,
      fontFamily: 'monospace', fontSize: 32, fontWeight: 300,
      color: 'rgba(255,255,255,0.28)', letterSpacing: 3,
    }}>
      46°N · 8°E
    </div>
  );
}

/** 单个 clip 内容（用于 TransitionSeries） */
function ClipScene({ clip, dur }: { clip: ScenicClip; dur: number }) {
  const isWarm = clip.tone === 'warm';
  const filter = isWarm
    ? 'brightness(0.94) saturate(1.20) contrast(1.04) sepia(0.08)'
    : 'brightness(0.90) saturate(1.10) contrast(1.05) hue-rotate(8deg)';
  return (
    <AbsoluteFill>
      <KenBurns dur={dur}>
        <OffthreadVideo
          src={clip.src} muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter }}
        />
      </KenBurns>
      <Vignette />
      <CaptionCard location={clip.location} caption={clip.caption} dur={dur} needsBg={clip.textBg?.['SwitzerlandScenic.caption'] === 'light'} />
      <CoordWatermark />
    </AbsoluteFill>
  );
}

interface SwitzerlandScenicProps {
  clips: ScenicClip[];
  fps: number;
  title: string;
  bgm?: string;
  attribution?: string;
}

export function SwitzerlandScenic({ clips, fps, title, bgm, attribution }: SwitzerlandScenicProps) {
  const clipDurs = clips.map(c => Math.max(1, Math.round((c.endTime - c.startTime) * fps)));
  const transitionOverlap = Math.max(0, clips.length - 1) * TRANSITION_DUR;
  const clipsFrames = clipDurs.reduce((s, d) => s + d, 0) - transitionOverlap;
  const totalFrames = INTRO_FRAMES + clipsFrames + OUTRO_FRAMES;

  return (
    <AbsoluteFill style={{ background: '#fff' }}>
      {bgm && (
        <BGMAudio src={bgm} totalFrames={totalFrames} volume={0.48} fadeInFrames={55} fadeOutFrames={65} />
      )}

      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroCard
          title={title}
          subtitle="Switzerland · Alps"
          accentColor="rgba(160,200,240,0.9)"
          style="dark"
        />
      </Sequence>

      <Sequence from={INTRO_FRAMES} durationInFrames={clipsFrames}>
        <TransitionSeries>
          {clips.map((clip, i) => (
            <React.Fragment key={i}>
              <TransitionSeries.Sequence durationInFrames={clipDurs[i]}>
                <ClipScene clip={clip} dur={clipDurs[i]} />
              </TransitionSeries.Sequence>
              {i < clips.length - 1 && (
                <TransitionSeries.Transition
                  presentation={fade()}
                  timing={FADE_TIMING}
                />
              )}
            </React.Fragment>
          ))}
        </TransitionSeries>
      </Sequence>

      <Sequence from={INTRO_FRAMES + clipsFrames} durationInFrames={OUTRO_FRAMES}>
        <OutroCard
          title={title}
          tagline="Where the mountains touch the sky"
          accentColor="rgba(160,200,240,0.8)"
          style="dark"
          attribution={attribution}
        />
      </Sequence>
    </AbsoluteFill>
  );
}
