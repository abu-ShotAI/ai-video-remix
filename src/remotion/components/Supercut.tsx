import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';

export interface HighlightClip {
  /** Local file path or URL to the source video */
  src: string;
  /** Start time of the clip in seconds */
  startTime: number;
  /** End time of the clip in seconds */
  endTime: number;
  /** Human-readable description of the scene */
  summary: string;
  /** Index in the supercut (for counter display) */
  index: number;
}

interface CounterOverlayProps {
  current: number;
  total: number;
  label: string;
}

/** Animated goal/highlight counter badge */
function CounterBadge({ current, total, label }: CounterOverlayProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, from: 0.3, to: 1, durationInFrames: 12, config: { stiffness: 200 } });
  const opacity = interpolate(frame, [0, 6], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        top: 32,
        left: 32,
        opacity,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.75)',
          border: '3px solid #FFD700',
          borderRadius: 12,
          padding: '10px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div style={{ color: '#FFD700', fontWeight: 900, fontSize: 48, lineHeight: 1, fontFamily: 'sans-serif' }}>
          {current}
        </div>
        <div style={{ color: '#fff', fontSize: 13, fontFamily: 'sans-serif', letterSpacing: 2, marginTop: 2 }}>
          {label.toUpperCase()}
        </div>
        <div style={{ color: '#aaa', fontSize: 11, fontFamily: 'sans-serif', marginTop: 2 }}>
          of {total}
        </div>
      </div>
    </div>
  );
}

/** Subtitle bar showing the clip summary */
function SummaryBar({ text }: { text: string }) {
  const frame = useCurrentFrame();
  const slideUp = interpolate(frame, [0, 10], [30, 0], { extrapolateRight: 'clamp' });
  const opacity = interpolate(frame, [0, 8, 50, 60], [0, 1, 1, 0], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
        padding: '24px 32px 20px',
        transform: `translateY(${slideUp}px)`,
        opacity,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ color: '#fff', fontSize: 18, fontWeight: 500, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
        {text}
      </div>
    </div>
  );
}

interface SupercutProps {
  clips: HighlightClip[];
  fps: number;
  label: string;  // e.g. "GOAL", "HIGHLIGHT"
}

/**
 * Main Remotion composition.
 * Places each highlight clip in sequence with a counter badge and summary bar.
 */
export function Supercut({ clips, fps, label }: SupercutProps) {
  let cursor = 0;

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {clips.map((clip, i) => {
        const clipDurationSecs = clip.endTime - clip.startTime;
        const durationInFrames = Math.max(1, Math.round(clipDurationSecs * fps));
        const from = cursor;
        cursor += durationInFrames;

        const trimBefore = Math.round(clip.startTime * fps);
        const trimAfter = Math.round(clip.endTime * fps);

        return (
          <Sequence key={clip.id ?? i} from={from} durationInFrames={durationInFrames}>
            <AbsoluteFill>
              <OffthreadVideo
                src={clip.src}
                trimBefore={trimBefore}
                trimAfter={trimAfter}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <CounterBadge current={i + 1} total={clips.length} label={label} />
              <SummaryBar text={clip.summary} />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}

// Attach id for de-duplication
declare module './Supercut' {
  interface HighlightClip {
    id?: string;
  }
}
