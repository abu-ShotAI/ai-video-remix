/**
 * 方案二：旅行 Vlog 风格混剪
 * 效果：城市名片卡弹出 + 白色闪光转场 + 底部进度条
 */
import React from 'react';
import {
  AbsoluteFill, OffthreadVideo, Sequence,
  useCurrentFrame, useVideoConfig,
  interpolate, spring,
} from 'remotion';
import { IntroCard, OutroCard, BGMAudio } from '../components/IntroOutro';

export interface TravelClip {
  src: string;
  startTime: number;
  endTime: number;
  summary: string;
  cityName: string;
  cityColor: string;
  /** Per-region brightness: 'light' = overlay needed */
  textBg?: Record<string, 'light' | 'dark'>;
}

const INTRO_FRAMES = 75;
const OUTRO_FRAMES = 75;

// 白色闪光转场（前后各 4 帧）
function FlashTransition({ dur }: { dur: number }) {
  const frame = useCurrentFrame();
  const inOpacity  = interpolate(frame, [0, 4], [1, 0], { extrapolateRight: 'clamp' });
  const outOpacity = interpolate(frame, [dur - 4, dur], [0, 1], { extrapolateRight: 'clamp' });
  const opacity = Math.max(inOpacity, outOpacity);
  if (opacity < 0.01) return null;
  return (
    <AbsoluteFill style={{ background: '#fff', opacity, pointerEvents: 'none', zIndex: 20 }} />
  );
}

// 城市名片卡 - 从底部滑入
function CityCard({ name, color, dur }: { name: string; color: string; dur: number }) {
  const frame = useCurrentFrame();
  const slideY = spring({ frame, fps: 30, from: 60, to: 0, durationInFrames: 14, config: { stiffness: 180 } });
  const opacity = interpolate(frame, [0, 6, dur - 12, dur - 6], [0, 1, 1, 0], { extrapolateRight: 'clamp' });

  return (
    <div style={{
      position: 'absolute', bottom: 48, left: 48,
      transform: `translateY(${slideY}px)`, opacity,
      zIndex: 15,
    }}>
      <div style={{
        background: 'rgba(0,0,0,0.75)',
        borderLeft: `5px solid ${color}`,
        padding: '12px 24px',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ color: '#fff', fontSize: 48, fontWeight: 700, fontFamily: 'sans-serif' }}>
          {name}
        </div>
      </div>
    </div>
  );
}

// 底部进度条
function ProgressBar({ currentClip, totalClips, clipProgress, color }: {
  currentClip: number; totalClips: number; clipProgress: number; color: string;
}) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      height: 4, display: 'flex', zIndex: 16,
    }}>
      {Array.from({ length: totalClips }).map((_, i) => (
        <div key={i} style={{ flex: 1, background: 'rgba(255,255,255,0.15)', margin: '0 1px' }}>
          <div style={{
            height: '100%',
            background: color,
            width: i < currentClip ? '100%' : i === currentClip ? `${clipProgress * 100}%` : '0%',
            transition: 'none',
          }} />
        </div>
      ))}
    </div>
  );
}

// 描述字幕
function Caption({ text, needsBg }: { text: string; needsBg: boolean }) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [8, 16], [0, 1], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 14, opacity }}>
      {/* Conditional gradient overlay when video background is bright */}
      {needsBg && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
          background: 'linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 100%)',
          pointerEvents: 'none',
        }} />
      )}
      <div style={{
        position: 'absolute', bottom: 16, left: 48, right: 48,
        fontFamily: 'sans-serif', fontSize: 22,
        color: 'rgba(255,255,255,0.85)',
        textShadow: '0 1px 8px rgba(0,0,0,0.9)',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {text}
      </div>
    </div>
  );
}

interface TravelVlogProps {
  clips: TravelClip[];
  fps: number;
  title: string;
  bgm?: string;
  attribution?: string;
}

export function TravelVlog({ clips, fps, title, bgm, attribution }: TravelVlogProps) {
  const clipsFrames = clips.reduce(
    (s, c) => s + Math.max(1, Math.round((c.endTime - c.startTime) * fps)), 0
  );
  const totalFrames = INTRO_FRAMES + clipsFrames + OUTRO_FRAMES;

  let cursor = INTRO_FRAMES;

  return (
    <AbsoluteFill style={{ background: '#111' }}>
      {bgm && <BGMAudio src={bgm} totalFrames={totalFrames} volume={0.5} />}

      {/* ── Intro ── */}
      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroCard
          title={title}
          subtitle="环球之旅"
          accentColor="#f4d03f"
          style="dark"
        />
      </Sequence>

      {/* ── Clips ── */}
      {clips.map((clip, i) => {
        const dur = Math.max(1, Math.round((clip.endTime - clip.startTime) * fps));
        const from = cursor;
        cursor += dur;

        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            <ClipWithEffects
              clip={clip} i={i} totalClips={clips.length}
              dur={dur}
            />
          </Sequence>
        );
      })}

      {/* ── Outro ── */}
      <Sequence from={INTRO_FRAMES + clipsFrames} durationInFrames={OUTRO_FRAMES}>
        <OutroCard
          title={title}
          tagline="世界在等你"
          accentColor="#f4d03f"
          style="dark"
          attribution={attribution}
        />
      </Sequence>
    </AbsoluteFill>
  );
}

function ClipWithEffects({ clip, i, totalClips, dur }: any) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={clip.src}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <AbsoluteFill style={{
        background: 'linear-gradient(rgba(0,0,0,0.3) 0%, transparent 20%, transparent 70%, rgba(0,0,0,0.5) 100%)',
        pointerEvents: 'none',
      }} />
      <FlashTransition dur={dur} />
      <CityCard name={clip.cityName} color={clip.cityColor} dur={dur} />
      <Caption text={clip.summary} needsBg={clip.textBg?.['TravelVlog.cityCard'] === 'light'} />
      <ProgressBar currentClip={i} totalClips={totalClips} clipProgress={frame / dur} color={clip.cityColor} />
    </AbsoluteFill>
  );
}
