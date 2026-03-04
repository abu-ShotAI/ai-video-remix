/**
 * SportsHighlight — 进球/欢呼集锦
 *
 * 风格：ESPN/体育频道集锦
 *   - 高对比、高饱和色调
 *   - 每个镜头都是真正的进球或欢呼庆祝（3-5s）
 *   - 左上角运动类型标记（BASKETBALL / FOOTBALL）
 *   - 底部全宽能量条（随帧推进）
 *   - @remotion/transitions slide from-right（快切 athletic feel）
 *   - 每个镜头都显示字幕标注
 *   - 右上角 HIGHLIGHTS 水印
 */
import React from 'react';
import {
  AbsoluteFill, OffthreadVideo, Sequence,
  useCurrentFrame,
  interpolate, spring,
} from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { IntroCard, OutroCard, BGMAudio } from '../components/IntroOutro';

export interface SportsClip {
  src: string;
  startTime: number;
  endTime: number;
  summary: string;
  sport?: string;
  caption?: string;
  dramatic?: boolean;
  /** Per-region brightness: 'light' = overlay needed */
  textBg?: Record<string, 'light' | 'dark'>;
}

const INTRO_FRAMES   = 45;   // 1.5s — fast opener
const OUTRO_FRAMES   = 75;
const TRANSITION_DUR = 8;    // fast athletic cut

const SLIDE_TIMING = linearTiming({ durationInFrames: TRANSITION_DUR });

/** 底部能量进度条 */
function EnergyBar({ clipIndex, totalClips }: { clipIndex: number; totalClips: number }) {
  const progress = (clipIndex + 1) / totalClips;
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
      background: 'rgba(255,255,255,0.12)', zIndex: 17,
    }}>
      <div style={{
        height: '100%',
        width: `${progress * 100}%`,
        background: 'linear-gradient(90deg, #ff4e00, #ff9900)',
        transition: 'none',
      }} />
    </div>
  );
}

/** 左上角运动类型标记 */
function SportTag({ sport, dur, needsBg }: { sport?: string; dur: number; needsBg: boolean }) {
  const frame = useCurrentFrame();
  if (!sport) return null;
  const opacity = interpolate(frame, [6, 18, Math.max(19, dur - 18), Math.max(20, dur - 6)], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
  const icon = sport === 'basketball' ? '🏀' : sport === 'football' ? '⚽' : '⚡';
  const label = sport === 'basketball' ? 'BASKETBALL' : sport === 'football' ? 'FOOTBALL' : 'MOMENT';
  return (
    <div style={{
      position: 'absolute', top: 72, left: 80, zIndex: 16,
      display: 'flex', alignItems: 'center', gap: 12,
      opacity,
      // If background is bright, add a dark pill behind the tag
      ...(needsBg ? {
        background: 'rgba(0,0,0,0.55)',
        borderRadius: 8,
        padding: '6px 18px 6px 10px',
      } : {}),
    }}>
      <span style={{ fontSize: 40 }}>{icon}</span>
      <span style={{
        fontFamily: 'sans-serif', fontSize: 32, fontWeight: 700,
        color: needsBg ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.70)',
        letterSpacing: 5,
        textTransform: 'uppercase',
        textShadow: '0 1px 8px rgba(0,0,0,0.9)',
      }}>{label}</span>
    </div>
  );
}

/** 底部字幕（每个镜头都显示） */
function GoalCaption({ caption, dur }: { caption?: string; dur: number }) {
  const frame = useCurrentFrame();
  if (!caption) return null;
  // 进球镜头较短，字幕入场要快（8帧内出现）
  const opacity = interpolate(frame, [8, 18, Math.max(19, dur - 18), Math.max(20, dur - 8)], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
  const y = spring({ frame: Math.max(0, frame - 8), fps: 30, from: 12, to: 0, durationInFrames: 12, config: { stiffness: 130 } });

  return (
    <AbsoluteFill style={{
      pointerEvents: 'none', zIndex: 15,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      opacity,
    }}>
      {/* 底部渐变遮罩，确保字幕对比度 */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 240,
        background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.30) 55%, transparent 100%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        transform: `translateY(${y}px)`,
        paddingBottom: 80,
        paddingLeft: 80,
        paddingRight: 80,
        position: 'relative',
        // Constrain to safe inner width so long captions don't bleed off-screen
        maxWidth: '100%',
        boxSizing: 'border-box',
        width: '100%',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'sans-serif', fontSize: 52, fontWeight: 900,
          color: '#fff', letterSpacing: 5, textTransform: 'uppercase',
          textShadow: '0 2px 16px rgba(0,0,0,1)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: 'block',
        }}>
          {caption}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** 右上角水印 */
function Watermark() {
  return (
    <div style={{
      position: 'absolute', top: 72, right: 80, zIndex: 16,
      fontFamily: 'sans-serif', fontSize: 32, fontWeight: 700,
      color: 'rgba(255,255,255,0.28)', letterSpacing: 5,
      textTransform: 'uppercase',
    }}>
      HIGHLIGHTS
    </div>
  );
}

/** 单个 clip 内容 */
function ClipScene({ clip, dur, clipIndex, totalClips }: { clip: SportsClip; dur: number; clipIndex: number; totalClips: number }) {
  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={clip.src} muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(1.0) saturate(1.4) contrast(1.12)' }}
      />
      <SportTag sport={clip.sport} dur={dur} needsBg={clip.textBg?.['SportsHighlight.sportTag'] === 'light'} />
      <GoalCaption caption={clip.caption} dur={dur} />
      <EnergyBar clipIndex={clipIndex} totalClips={totalClips} />
      <Watermark />
    </AbsoluteFill>
  );
}

interface SportsHighlightProps {
  clips: SportsClip[];
  fps: number;
  title: string;
  bgm?: string;
  attribution?: string;
}

export function SportsHighlight({ clips, fps, title, bgm, attribution }: SportsHighlightProps) {
  const clipDurs = clips.map(c => Math.max(1, Math.round((c.endTime - c.startTime) * fps)));
  const transitionOverlap = Math.max(0, clips.length - 1) * TRANSITION_DUR;
  const clipsFrames = clipDurs.reduce((s, d) => s + d, 0) - transitionOverlap;
  const totalFrames = INTRO_FRAMES + clipsFrames + OUTRO_FRAMES;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {bgm && (
        <BGMAudio src={bgm} totalFrames={totalFrames} volume={0.52} fadeInFrames={30} fadeOutFrames={55} />
      )}

      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroCard
          title={title}
          subtitle="Best Moments"
          accentColor="rgba(255,100,0,0.95)"
          style="dark"
        />
      </Sequence>

      <Sequence from={INTRO_FRAMES} durationInFrames={clipsFrames}>
        <TransitionSeries>
          {clips.map((clip, i) => (
            <React.Fragment key={i}>
              <TransitionSeries.Sequence durationInFrames={clipDurs[i]}>
                <ClipScene clip={clip} dur={clipDurs[i]} clipIndex={i} totalClips={clips.length} />
              </TransitionSeries.Sequence>
              {i < clips.length - 1 && (
                <TransitionSeries.Transition
                  presentation={slide({ direction: 'from-right' })}
                  timing={SLIDE_TIMING}
                />
              )}
            </React.Fragment>
          ))}
        </TransitionSeries>
      </Sequence>

      <Sequence from={INTRO_FRAMES + clipsFrames} durationInFrames={OUTRO_FRAMES}>
        <OutroCard
          title={title}
          tagline="The game never stops"
          accentColor="rgba(255,100,0,0.85)"
          style="dark"
          attribution={attribution}
        />
      </Sequence>
    </AbsoluteFill>
  );
}
