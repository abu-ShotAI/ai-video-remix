/**
 * 方案三：情绪驱动氛围混剪
 * 效果：快切城市节奏 → 慢镜日落过渡 + 颗粒感胶片叠层 + 中心歌词字幕
 */
import React from 'react';
import {
  AbsoluteFill, OffthreadVideo, Sequence,
  useCurrentFrame, useVideoConfig,
  interpolate, spring,
} from 'remotion';
import { IntroCard, OutroCard, BGMAudio } from '../components/IntroOutro';

export interface MoodClip {
  src: string;
  startTime: number;
  endTime: number;
  summary: string;
  mood: 'fast' | 'slow';
  /** Per-region brightness: 'light' = overlay needed */
  textBg?: Record<string, 'light' | 'dark'>;
}

const INTRO_FRAMES = 60;
const OUTRO_FRAMES = 90;  // 3s — warm fade-out feels longer

// 胶片颗粒叠层
function FilmGrain({ strength = 0.04 }: { strength?: number }) {
  const frame = useCurrentFrame();
  const seed = (frame * 37 + 13) % 256;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 10, mixBlendMode: 'overlay' as any, opacity: strength * 10 }}>
      <svg width="100%" height="100%" style={{ position: 'absolute' }}>
        <filter id={`grain-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed={seed} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
}

// 暗角效果
function Vignette({ intensity = 0.5 }: { intensity?: number }) {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 9 }}>
      <div style={{
        width: '100%', height: '100%',
        background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${intensity}) 100%)`,
      }} />
    </AbsoluteFill>
  );
}

// 快切闪转（黑色）
function CutFlash({ dur }: { dur: number }) {
  const frame = useCurrentFrame();
  const fadeIn  = interpolate(frame, [0, 3], [1, 0], { extrapolateRight: 'clamp' });
  const fadeOut = interpolate(frame, [dur - 3, dur], [0, 1], { extrapolateRight: 'clamp' });
  const opacity = Math.max(fadeIn, fadeOut);
  if (opacity < 0.01) return null;
  return <AbsoluteFill style={{ background: '#000', opacity, pointerEvents: 'none', zIndex: 20 }} />;
}

// 慢镜溶解转场
function SlowDissolve({ dur }: { dur: number }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 18, dur - 18, dur], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(rgba(255,220,120,0.08) 0%, transparent 60%)',
      opacity, pointerEvents: 'none', zIndex: 8,
    }} />
  );
}

// 中心歌词字幕（slow 模式）
function LyricLine({ text, dur, needsBg }: { text: string; dur: number; needsBg: boolean }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [12, 22, dur - 20, dur - 10], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
  const y = spring({ frame, fps: 30, from: 12, to: 0, durationInFrames: 18, config: { stiffness: 100 } });
  return (
    <AbsoluteFill style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none', zIndex: 15, opacity,
    }}>
      {/* Conditional dark stripe behind text when video center is bright */}
      {needsBg && (
        <div style={{
          position: 'absolute',
          top: '50%', left: 0, right: 0,
          transform: 'translateY(-50%)',
          height: 120,
          background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.55) 70%, transparent)',
          pointerEvents: 'none',
        }} />
      )}
      <div style={{ transform: `translateY(${y}px)`, textAlign: 'center', padding: '0 80px', position: 'relative' }}>
        <div style={{
          fontFamily: 'serif', fontSize: 36, fontWeight: 400,
          color: needsBg ? 'rgba(255,255,255,0.95)' : 'rgba(255,240,200,0.92)',
          textShadow: '0 2px 20px rgba(0,0,0,0.9)',
          letterSpacing: 2, lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
}

// 快切能量闪光条（fast 模式）
function EnergyBeat({ dur }: { dur: number }) {
  const frame = useCurrentFrame();
  const isBeat = (frame % 30 === 0 || frame % 30 === 6 || frame % 30 === 12) && frame < dur - 4;
  const opacity = isBeat ? interpolate(frame % 6, [0, 1, 3, 6], [0, 0.5, 0.2, 0], { extrapolateRight: 'clamp' }) : 0;
  if (opacity < 0.01) return null;
  return (
    <AbsoluteFill style={{
      background: 'rgba(255,255,255,0.5)',
      opacity, pointerEvents: 'none', zIndex: 18, mixBlendMode: 'screen' as any,
    }} />
  );
}

function BpmTag() {
  return (
    <div style={{
      position: 'absolute', top: 28, right: 32,
      fontFamily: 'monospace', fontSize: 20,
      color: 'rgba(255,255,255,0.5)', letterSpacing: 3,
      zIndex: 16,
    }}>
      CITY × 情绪
    </div>
  );
}

interface MoodDrivenProps {
  clips: MoodClip[];
  fps: number;
  title: string;
  bgm?: string;
  attribution?: string;
}

export function MoodDriven({ clips, fps, title, bgm, attribution }: MoodDrivenProps) {
  const clipsFrames = clips.reduce(
    (s, c) => s + Math.max(1, Math.round((c.endTime - c.startTime) * fps)), 0
  );
  const totalFrames = INTRO_FRAMES + clipsFrames + OUTRO_FRAMES;

  let cursor = INTRO_FRAMES;

  return (
    <AbsoluteFill style={{ background: '#0a0a0a' }}>
      {bgm && <BGMAudio src={bgm} totalFrames={totalFrames} volume={0.55} fadeInFrames={40} fadeOutFrames={60} />}

      {/* ── Intro ── */}
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroCard
          title={title}
          subtitle="一部情绪短片"
          accentColor="rgba(255,220,120,0.9)"
          style="warm"
        />
      </Sequence>

      {/* ── Clips ── */}
      {clips.map((clip, i) => {
        const dur = Math.max(1, Math.round((clip.endTime - clip.startTime) * fps));
        const from = cursor;
        cursor += dur;
        const isSlow = clip.mood === 'slow';

        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <AbsoluteFill>
              <OffthreadVideo
                src={clip.src} muted
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  filter: isSlow
                    ? 'brightness(0.9) saturate(1.3) sepia(0.2)'
                    : 'contrast(1.2) saturate(1.5) brightness(1.05)',
                }}
              />
              <Vignette intensity={isSlow ? 0.65 : 0.4} />
              <FilmGrain strength={0.03} />
              {isSlow ? (
                <>
                  <SlowDissolve dur={dur} />
                  <LyricLine text={clip.summary} dur={dur} needsBg={clip.textBg?.['MoodDriven.lyric'] === 'light'} />
                </>
              ) : (
                <>
                  <CutFlash dur={dur} />
                  <EnergyBeat dur={dur} />
                  <BpmTag />
                </>
              )}
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* ── Outro ── */}
      <Sequence from={INTRO_FRAMES + clipsFrames} durationInFrames={OUTRO_FRAMES}>
        <OutroCard
          title={title}
          tagline="找到属于你的节奏"
          accentColor="rgba(255,210,100,0.8)"
          style="warm"
          attribution={attribution}
        />
      </Sequence>
    </AbsoluteFill>
  );
}
