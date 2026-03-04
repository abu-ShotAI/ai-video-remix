/**
 * NatureWild — 自然野生动物纪录片混剪
 *
 * 风格：BBC纪录片美学
 *   - 深黑背景，@remotion/transitions fade 溶接（springTiming）
 *   - 左下角叙事标注：细白线 + 上方英文场景名 + 下方中文叙事文字
 *   - 左下角水印（叙事区下方，与素材右侧水印分离）
 *   - 轻度胶片颗粒 + 暗角
 *   - Ken Burns 极慢推进
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

export interface NatureClip {
  src: string;
  startTime: number;
  endTime: number;
  summary: string;
  scene?: string;
  caption?: string;
  kenBurns?: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
  /** Per-region brightness: 'light' = overlay needed */
  textBg?: Record<string, 'light' | 'dark'>;
}

const INTRO_FRAMES   = 75;
const OUTRO_FRAMES   = 90;
const TRANSITION_DUR = 20; // frames overlapping between clips

const FADE_TIMING = springTiming({ config: { damping: 200 }, durationInFrames: TRANSITION_DUR });

function FilmGrain() {
  const frame = useCurrentFrame();
  const seed = (frame * 41 + 7) % 256;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 10, opacity: 0.15, mixBlendMode: 'overlay' as any }}>
      <svg width="100%" height="100%" style={{ position: 'absolute' }}>
        <filter id={`g${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed={seed} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${seed})`} />
      </svg>
    </AbsoluteFill>
  );
}

function Vignette() {
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 9 }}>
      <div style={{
        width: '100%', height: '100%',
        background: 'radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.65) 100%)',
      }} />
    </AbsoluteFill>
  );
}

function KenBurns({ dur, direction = 'zoom-in', children }: {
  dur: number;
  direction?: 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right';
  children: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, dur], [0, 1], { extrapolateRight: 'clamp' });

  let transform: string;
  switch (direction) {
    case 'zoom-out':
      transform = `scale(${1.045 - t * 0.045})`;
      break;
    case 'pan-left':
      transform = `scale(1.04) translateX(${-t * 2.5}%)`;
      break;
    case 'pan-right':
      transform = `scale(1.04) translateX(${t * 2.5}%)`;
      break;
    case 'zoom-in':
    default:
      transform = `scale(${1.0 + t * 0.045})`;
  }

  return (
    <AbsoluteFill style={{ transform, transformOrigin: 'center center' }}>
      {children}
    </AbsoluteFill>
  );
}

/** 左下角叙事标注：细线 + 场景名（英文）+ 叙事文字（中文） */
function NarrativeLabel({ scene, caption, dur, needsBg }: { scene?: string; caption?: string; dur: number; needsBg: boolean }) {
  const frame = useCurrentFrame();
  if (!scene && !caption) return null;

  const opacity = interpolate(
    frame,
    [30, 46, Math.max(47, dur - 30), Math.max(48, dur - 12)],
    [0,   1,  1,                       0],
    { extrapolateRight: 'clamp' },
  );
  const x = spring({ frame: Math.max(0, frame - 30), fps: 30, from: -24, to: 0, durationInFrames: 18, config: { stiffness: 90 } });

  // Stronger overlay when background is bright, standard when dark
  const gradientTop = needsBg ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.72)';
  const gradientMid = needsBg ? 'rgba(0,0,0,0.60)' : 'rgba(0,0,0,0.35)';

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 15, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', opacity }}>
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 260,
        background: `linear-gradient(to top, ${gradientTop} 0%, ${gradientMid} 55%, transparent 100%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ transform: `translateX(${x}px)`, maxWidth: 760, padding: '0 0 80px 80px', position: 'relative' }}>
        {scene && (
          <div style={{
            fontFamily: 'sans-serif', fontSize: 36, fontWeight: 400,
            color: 'rgba(255,255,255,0.70)', letterSpacing: 4,
            textTransform: 'uppercase', textShadow: '0 1px 10px rgba(0,0,0,1)', marginBottom: 14,
          }}>
            {scene}
          </div>
        )}
        <div style={{ width: 64, height: 2, background: 'rgba(255,255,255,0.7)', marginBottom: 16 }} />
        {caption && (
          <div style={{
            fontFamily: 'serif', fontSize: 52, fontWeight: 300,
            color: '#fff', letterSpacing: 1, lineHeight: 1.35,
            textShadow: '0 2px 16px rgba(0,0,0,1)',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {caption}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
}

/** 左下角水印（与素材原有右侧水印分离） */
function Watermark() {
  return (
    <div style={{
      position: 'absolute', bottom: 28, left: 80, zIndex: 16,
      fontFamily: 'sans-serif', fontSize: 28, fontWeight: 300,
      color: 'rgba(255,255,255,0.22)', letterSpacing: 5, textTransform: 'uppercase',
    }}>
      WILD × NATURE
    </div>
  );
}

/** 单个 clip 内容（用于 TransitionSeries） */
function ClipScene({ clip, dur }: { clip: NatureClip; dur: number }) {
  return (
    <AbsoluteFill>
      <KenBurns dur={dur} direction={clip.kenBurns ?? 'zoom-in'}>
        <OffthreadVideo
          src={clip.src} muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.90) saturate(1.18) contrast(1.06)' }}
        />
      </KenBurns>
      <Vignette />
      <FilmGrain />
      <NarrativeLabel scene={clip.scene} caption={clip.caption} dur={dur} needsBg={clip.textBg?.['NatureWild.caption'] === 'light'} />
      <Watermark />
    </AbsoluteFill>
  );
}

interface NatureWildProps {
  clips: NatureClip[];
  fps: number;
  title: string;
  bgm?: string;
  attribution?: string;
}

export function NatureWild({ clips, fps, title, bgm, attribution }: NatureWildProps) {
  const clipDurs = clips.map(c => Math.max(1, Math.round((c.endTime - c.startTime) * fps)));
  // TransitionSeries: each transition overlaps adjacent clips, so total is sum - (n-1)*TRANSITION_DUR
  const transitionOverlap = Math.max(0, clips.length - 1) * TRANSITION_DUR;
  const clipsFrames = clipDurs.reduce((s, d) => s + d, 0) - transitionOverlap;
  const totalFrames = INTRO_FRAMES + clipsFrames + OUTRO_FRAMES;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {bgm && (
        <BGMAudio src={bgm} totalFrames={totalFrames} volume={0.45} fadeInFrames={50} fadeOutFrames={70} />
      )}

      <Sequence from={0} durationInFrames={INTRO_FRAMES}>
        <IntroCard
          title={title}
          subtitle="A Journey Through the Wild"
          accentColor="rgba(130,215,150,0.9)"
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
          tagline="Nature is the greatest filmmaker"
          accentColor="rgba(130,215,150,0.8)"
          style="dark"
          attribution={attribution}
        />
      </Sequence>
    </AbsoluteFill>
  );
}
