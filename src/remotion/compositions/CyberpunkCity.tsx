/**
 * 方案一：赛博朋克夜景混剪
 * 效果：扫描线叠加 + 故障闪烁 + 霓虹发光城市名标题
 */
import React from 'react';
import {
  AbsoluteFill, OffthreadVideo, Sequence,
  useCurrentFrame, useVideoConfig,
  interpolate, spring,
} from 'remotion';
import { IntroCard, OutroCard, BGMAudio } from '../components/IntroOutro';

export interface CyberpunkClip {
  src: string;
  startTime: number;
  endTime: number;
  summary: string;
}

const INTRO_FRAMES = 60;  // 2s
const OUTRO_FRAMES = 75;  // 2.5s

// 扫描线叠加层
function Scanlines() {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 10 }}>
      <div style={{
        width: '100%', height: '100%',
        background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,255,200,0.04) 3px, rgba(0,255,200,0.04) 4px)',
        mixBlendMode: 'screen',
      }} />
    </AbsoluteFill>
  );
}

// 边角装饰框
function CornerFrame() {
  const size = 40;
  const thick = 3;
  const color = '#00ffe0';
  const style: React.CSSProperties = { position: 'absolute', width: size, height: size };
  const border = `${thick}px solid ${color}`;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 11 }}>
      <div style={{ ...style, top: 24, left: 24, borderTop: border, borderLeft: border }} />
      <div style={{ ...style, top: 24, right: 24, borderTop: border, borderRight: border }} />
      <div style={{ ...style, bottom: 24, left: 24, borderBottom: border, borderLeft: border }} />
      <div style={{ ...style, bottom: 24, right: 24, borderBottom: border, borderRight: border }} />
    </AbsoluteFill>
  );
}

// 故障闪烁色差效果
function GlitchOverlay({ intensity }: { intensity: number }) {
  if (intensity < 0.01) return null;
  return (
    <AbsoluteFill style={{
      pointerEvents: 'none', zIndex: 12,
      background: `rgba(255,0,80,${intensity * 0.15})`,
      mixBlendMode: 'screen',
      transform: `translateX(${intensity * 6}px)`,
    }} />
  );
}

// 霓虹标题
function NeonTitle({ text }: { text: string }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, 50, 60], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
  const blur = interpolate(Math.sin(frame * 0.3), [-1, 1], [2, 8]);
  return (
    <div style={{
      position: 'absolute', bottom: 80, left: 0, right: 0,
      display: 'flex', justifyContent: 'center', opacity,
      zIndex: 15,
    }}>
      <div style={{
        fontFamily: 'monospace', fontSize: 24, letterSpacing: 3,
        color: '#00ffe0', textTransform: 'uppercase',
        textShadow: `0 0 8px #00ffe0, 0 0 ${blur}px #00ffe0, 0 0 40px #00ffe0`,
        padding: '6px 20px',
        border: '1px solid rgba(0,255,224,0.4)',
        background: 'rgba(0,0,0,0.5)',
        maxWidth: '80%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {text}
      </div>
    </div>
  );
}

// 底部时间码
function Timecode({ clip, total }: { clip: number; total: number }) {
  return (
    <div style={{
      position: 'absolute', bottom: 28, right: 32,
      fontFamily: 'monospace', fontSize: 20,
      color: 'rgba(0,255,224,0.7)', letterSpacing: 2,
      zIndex: 15,
    }}>
      {String(clip).padStart(2, '0')} / {String(total).padStart(2, '0')}
    </div>
  );
}

function GlitchFlicker({ dur }: { dur: number }) {
  const frame = useCurrentFrame();
  // Only trigger tail glitch on clips long enough to avoid visual artifacts on short clips
  const glitchFrames = dur > 30
    ? [3, 4, dur - 5, dur - 4]
    : [3, 4];
  const isGlitch = glitchFrames.includes(frame);
  return <GlitchOverlay intensity={isGlitch ? 1 : 0} />;
}

interface CyberpunkProps {
  clips: CyberpunkClip[];
  fps: number;
  cityName: string;
  bgm?: string;
  subtitle?: string;
  tagline?: string;
}

export function CyberpunkCity({ clips, fps, cityName, bgm, subtitle = 'CITY PULSE', tagline = 'ShotAI Search · Remotion Render' }: CyberpunkProps) {
  const clipsFrames = clips.reduce(
    (s, c) => s + Math.max(1, Math.round((c.endTime - c.startTime) * fps)), 0
  );
  const totalFrames = INTRO_FRAMES + clipsFrames + OUTRO_FRAMES;

  let cursor = INTRO_FRAMES;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* BGM — muted prop on each video handles original audio */}
      {bgm && <BGMAudio src={bgm} totalFrames={totalFrames} volume={0.45} />}

      {/* ── Intro ── */}
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroCard
          title={cityName}
          subtitle={subtitle}
          accentColor="#00ffe0"
          style="neon"
        />
      </Sequence>

      {/* ── Clips ── */}
      {clips.map((clip, i) => {
        const dur = Math.max(1, Math.round((clip.endTime - clip.startTime) * fps));
        const from = cursor;
        cursor += dur;

        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <AbsoluteFill>
              <OffthreadVideo
                src={clip.src}
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'contrast(1.15) saturate(1.3)' }}
              />
              <AbsoluteFill style={{
                background: 'linear-gradient(transparent 50%, rgba(0,0,0,0.8) 100%)',
                pointerEvents: 'none',
              }} />
              <Scanlines />
              <CornerFrame />
              <GlitchFlicker dur={dur} />
              <NeonTitle text={clip.summary} />
              <Timecode clip={i + 1} total={clips.length} />
            </AbsoluteFill>
          </Sequence>
        );
      })}

      {/* ── Outro ── */}
      <Sequence from={INTRO_FRAMES + clipsFrames} durationInFrames={OUTRO_FRAMES}>
        <OutroCard
          title={cityName}
          tagline={tagline}
          accentColor="#00ffe0"
          style="neon"
        />
      </Sequence>
    </AbsoluteFill>
  );
}
