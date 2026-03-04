import React from 'react';
import { Composition, getInputProps } from 'remotion';
import { Supercut, HighlightClip } from './components/Supercut';
import { CyberpunkCity, CyberpunkClip } from './compositions/CyberpunkCity';
import { TravelVlog, TravelClip } from './compositions/TravelVlog';
import { MoodDriven, MoodClip } from './compositions/MoodDriven';
import { NatureWild, NatureClip } from './compositions/NatureWild';
import { SwitzerlandScenic, ScenicClip } from './compositions/SwitzerlandScenic';
import { SportsHighlight, SportsClip } from './compositions/SportsHighlight';

const INTRO  = { Cyberpunk: 60, Travel: 75, Mood: 60, Nature: 75, Scenic: 75, Sports: 45 };
const OUTRO  = { Cyberpunk: 75, Travel: 75, Mood: 90, Nature: 90, Scenic: 90, Sports: 75 };
// Transition durations matching each composition's TRANSITION_DUR constant
const TRANS  = { Nature: 20, Scenic: 24, Sports: 8 };

function clipsFrames(clips: Array<{ startTime: number; endTime: number }>, fps: number, transitionDur = 0) {
  const sum = clips.reduce((s, c) => s + Math.max(1, Math.round((c.endTime - c.startTime) * fps)), 0);
  const overlap = Math.max(0, clips.length - 1) * transitionDur;
  return sum - overlap;
}

export const RemotionRoot: React.FC = () => {
  const p = getInputProps() as any;
  const fps = p.fps ?? 30;

  const supercutClips: HighlightClip[]  = p.clips ?? [];
  const cyberpunkClips: CyberpunkClip[] = p.clips ?? [];
  const travelClips: TravelClip[]       = p.clips ?? [];
  const moodClips: MoodClip[]           = p.clips ?? [];
  const natureClips: NatureClip[]       = p.clips ?? [];
  const scenicClips: ScenicClip[]       = p.clips ?? [];
  const sportsClips: SportsClip[]       = p.clips ?? [];

  const supercutDur  = Math.max(1, Math.round(supercutClips.reduce((s, c) => s + (c.endTime - c.startTime), 0) * fps));
  const cyberpunkDur = INTRO.Cyberpunk + clipsFrames(cyberpunkClips, fps) + OUTRO.Cyberpunk;
  const travelDur    = INTRO.Travel    + clipsFrames(travelClips, fps)    + OUTRO.Travel;
  const moodDur      = INTRO.Mood      + clipsFrames(moodClips, fps)      + OUTRO.Mood;
  const natureDur    = INTRO.Nature    + clipsFrames(natureClips, fps, TRANS.Nature) + OUTRO.Nature;
  const scenicDur    = INTRO.Scenic    + clipsFrames(scenicClips, fps, TRANS.Scenic) + OUTRO.Scenic;
  const sportsDur    = INTRO.Sports    + clipsFrames(sportsClips, fps, TRANS.Sports) + OUTRO.Sports;

  return (
    <>
      <Composition
        id="Supercut"
        component={Supercut as any}
        durationInFrames={Math.max(1, supercutDur)}
        fps={fps} width={1920} height={1080}
        defaultProps={{ clips: supercutClips, fps, label: p.label ?? 'HIGHLIGHT' }}
      />
      <Composition
        id="CyberpunkCity"
        component={CyberpunkCity as any}
        durationInFrames={Math.max(1, cyberpunkDur)}
        fps={fps} width={1920} height={1080}
        defaultProps={{ clips: cyberpunkClips, fps, cityName: p.cityName ?? 'CITY', bgm: p.bgm }}
      />
      <Composition
        id="TravelVlog"
        component={TravelVlog as any}
        durationInFrames={Math.max(1, travelDur)}
        fps={fps} width={1920} height={1080}
        defaultProps={{ clips: travelClips, fps, title: p.title ?? 'Travel', bgm: p.bgm }}
      />
      <Composition
        id="MoodDriven"
        component={MoodDriven as any}
        durationInFrames={Math.max(1, moodDur)}
        fps={fps} width={1920} height={1080}
        defaultProps={{ clips: moodClips, fps, title: p.title ?? 'Mood', bgm: p.bgm }}
      />
      <Composition
        id="NatureWild"
        component={NatureWild as any}
        durationInFrames={Math.max(1, natureDur)}
        fps={fps} width={1920} height={1080}
        defaultProps={{ clips: natureClips, fps, title: p.title ?? 'Wild', bgm: p.bgm }}
      />
      <Composition
        id="SwitzerlandScenic"
        component={SwitzerlandScenic as any}
        durationInFrames={Math.max(1, scenicDur)}
        fps={fps} width={1920} height={1080}
        defaultProps={{ clips: scenicClips, fps, title: p.title ?? 'Alps', bgm: p.bgm }}
      />
      <Composition
        id="SportsHighlight"
        component={SportsHighlight as any}
        durationInFrames={Math.max(1, sportsDur)}
        fps={fps} width={1920} height={1080}
        defaultProps={{ clips: sportsClips, fps, title: p.title ?? 'Highlights', bgm: p.bgm }}
      />
    </>
  );
};
