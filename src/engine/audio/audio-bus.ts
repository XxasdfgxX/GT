/** Procedural engine and stingers. Playback starts on the first pointer gesture. */

import type { Disposable } from '../core/disposable';

export type Sting = 'pickup' | 'dropoff';

export interface AudioBus extends Disposable {
  setEngine(frequency: number, gain: number): void;
  playSting(kind: Sting): void;
}

export function createSilentAudioBus(): AudioBus {
  return {
    setEngine() {
      /* tests and headless boots stay quiet */
    },
    playSting() {
      /* no output */
    },
    dispose() {
      /* nothing to release */
    },
  };
}

export function createWebAudioBus(target: HTMLElement): AudioBus {
  let context: AudioContext | null = null;
  let engine: OscillatorNode | null = null;
  let engineGain: GainNode | null = null;

  const ensure = () => {
    if (typeof AudioContext === 'undefined') return;
    if (!context) {
      context = new AudioContext();
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engine = context.createOscillator();
      engine.type = 'triangle';
      engine.frequency.value = 46;
      engine.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(context.destination);
      engine.start();
    }
    if (context.state === 'suspended') void context.resume();
  };

  target.addEventListener('pointerdown', ensure);

  return {
    setEngine(frequency, gain) {
      if (!context || !engine || !engineGain) return;
      const time = context.currentTime;
      if (frequency > 0) engine.frequency.setTargetAtTime(frequency, time, 0.08);
      engineGain.gain.setTargetAtTime(gain, time, 0.05);
    },
    playSting(kind) {
      ensure();
      if (!context) return;
      const notes = kind === 'pickup' ? [523, 784] : [659, 880, 1046];
      const start = context.currentTime;
      for (let i = 0; i < notes.length; i += 1) {
        const frequency = notes[i];
        if (frequency === undefined) continue;
        const voice = context.createOscillator();
        const gain = context.createGain();
        const when = start + i * 0.12;
        voice.type = 'sine';
        voice.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(0.07, when + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
        voice.connect(gain);
        gain.connect(context.destination);
        voice.start(when);
        voice.stop(when + 0.2);
      }
    },
    dispose() {
      target.removeEventListener('pointerdown', ensure);
      engine?.stop();
      void context?.close();
      context = null;
      engine = null;
      engineGain = null;
    },
  };
}
