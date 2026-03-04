/**
 * Shared intro / outro blocks for all compositions.
 *
 * Usage in a composition:
 *   const INTRO = 60;   // 2s @ 30fps
 *   const OUTRO = 60;
 *   const totalFrames = INTRO + clipsFrames + OUTRO;
 *
 *   <Sequence from={0}           durationInFrames={INTRO}>
 *     <IntroCard ... />
 *   </Sequence>
 *   {clips rendered from INTRO}
 *   <Sequence from={INTRO+clipsFrames} durationInFrames={OUTRO}>
 *     <OutroCard ... />
 *   </Sequence>
 *
 * Audio BGM:
 *   <BGMAudio src="http://..." totalFrames={totalFrames} fps={fps} />
 */
import React from 'react';
import { AbsoluteFill, Audio, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

// ─── Intro card ──────────────────────────────────────────────────────────────

export interface IntroCardProps {
  title: string;
  subtitle?: string;
  accentColor?: string;
  style?: 'dark' | 'neon' | 'warm';
}

export function IntroCard({ title, subtitle, accentColor = '#fff', style = 'dark' }: IntroCardProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, 12, durationInFrames - 14, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp' },
  );

  const titleY = spring({ frame, fps, from: 28, to: 0, durationInFrames: 20, config: { stiffness: 90 } });
  const subtitleY = spring({ frame: Math.max(0, frame - 8), fps, from: 20, to: 0, durationInFrames: 18, config: { stiffness: 80 } });

  const bgColor = style === 'neon' ? '#000' : style === 'warm' ? '#110a00' : '#0d0d0d';
  const titleFont = style === 'neon' ? 'monospace' : style === 'warm' ? 'serif' : 'sans-serif';
  const titleGlow = style === 'neon'
    ? `0 0 12px ${accentColor}, 0 0 40px ${accentColor}`
    : style === 'warm'
    ? `0 2px 32px rgba(255,180,60,0.5), 0 4px 12px rgba(0,0,0,0.8)`
    : `0 4px 24px rgba(0,0,0,0.7)`;

  return (
    <AbsoluteFill style={{ background: bgColor, opacity, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ textAlign: 'center', padding: '0 80px' }}>
        {/* Accent line above */}
        <div style={{
          width: 48, height: 3, background: accentColor,
          margin: '0 auto 24px', borderRadius: 2, opacity: 0.9,
        }} />
        {/* Main title */}
        <div style={{
          transform: `translateY(${titleY}px)`,
          fontFamily: titleFont,
          fontSize: 100,
          fontWeight: style === 'warm' ? 400 : 900,
          color: style === 'neon' ? accentColor : '#fff',
          letterSpacing: style === 'neon' ? 12 : style === 'warm' ? 8 : 4,
          textTransform: 'uppercase',
          textShadow: titleGlow,
          lineHeight: 1.1,
        }}>
          {title}
        </div>
        {/* Subtitle */}
        {subtitle && (
          <div style={{
            transform: `translateY(${subtitleY}px)`,
            marginTop: 20,
            fontFamily: titleFont,
            fontSize: 28,
            color: style === 'neon' ? 'rgba(255,255,255,0.6)' : style === 'warm' ? 'rgba(255,220,150,0.75)' : 'rgba(255,255,255,0.55)',
            letterSpacing: style === 'neon' ? 8 : 4,
            textTransform: 'uppercase',
          }}>
            {subtitle}
          </div>
        )}
        {/* Accent line below */}
        <div style={{
          width: 32, height: 1, background: accentColor,
          margin: '24px auto 0', opacity: 0.5,
        }} />
      </div>
    </AbsoluteFill>
  );
}

// ─── Outro card ──────────────────────────────────────────────────────────────

export interface OutroCardProps {
  title: string;
  tagline?: string;
  accentColor?: string;
  style?: 'dark' | 'neon' | 'warm';
  /** Attribution line shown below tagline, e.g. "ShotAI 检索 · Remotion 合成" */
  attribution?: string;
}

export function OutroCard({ title, tagline, accentColor = '#fff', style = 'dark', attribution }: OutroCardProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Fade in from black over first 18 frames, hold, then stay (composition ends)
  const opacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });

  const logoScale = spring({ frame, fps, from: 0.85, to: 1, durationInFrames: 24, config: { stiffness: 70 } });

  const bgColor = style === 'neon' ? '#000' : style === 'warm' ? '#0a0500' : '#000';
  const titleFont = style === 'neon' ? 'monospace' : style === 'warm' ? 'serif' : 'sans-serif';

  return (
    <AbsoluteFill style={{ background: bgColor, opacity, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ textAlign: 'center', transform: `scale(${logoScale})` }}>
        <div style={{
          fontFamily: titleFont,
          fontSize: 68,
          fontWeight: style === 'warm' ? 300 : 700,
          color: style === 'neon' ? accentColor : '#fff',
          letterSpacing: 6,
          textTransform: 'uppercase',
          textShadow: style === 'neon' ? `0 0 20px ${accentColor}` : style === 'warm' ? '0 2px 20px rgba(255,180,60,0.4)' : 'none',
        }}>
          {title}
        </div>
        {tagline && (
          <div style={{
            marginTop: 16,
            fontFamily: titleFont,
            fontSize: 24,
            color: style === 'neon' ? 'rgba(200,255,240,0.5)' : style === 'warm' ? 'rgba(255,220,120,0.5)' : 'rgba(255,255,255,0.4)',
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}>
            {tagline}
          </div>
        )}
        <div style={{
          width: 40, height: 1, background: accentColor,
          margin: '20px auto 0', opacity: 0.4,
        }} />
        {attribution && (
          <div style={{
            marginTop: 20,
            fontFamily: 'monospace',
            fontSize: 18,
            color: 'rgba(255,255,255,0.22)',
            letterSpacing: 2,
          }}>
            {attribution}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

// ─── BGM Audio with fade-in / fade-out envelope ──────────────────────────────

export interface BGMAudioProps {
  src: string;
  totalFrames: number;
  /** Volume peak 0–1, default 0.5 */
  volume?: number;
  /** Fade-in duration in frames, default 30 */
  fadeInFrames?: number;
  /** Fade-out duration in frames, default 45 */
  fadeOutFrames?: number;
}

export function BGMAudio({ src, totalFrames, volume = 0.5, fadeInFrames = 30, fadeOutFrames = 45 }: BGMAudioProps) {
  const frame = useCurrentFrame();
  const vol = interpolate(
    frame,
    [0, fadeInFrames, totalFrames - fadeOutFrames, totalFrames],
    [0, volume, volume, 0],
    { extrapolateRight: 'clamp' },
  );
  return <Audio src={src} volume={vol} loop />;
}
