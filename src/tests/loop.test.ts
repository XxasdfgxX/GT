import { describe, expect, it } from 'vitest';
import { beginFrame, consumeStep, createClock, endFrame } from '../engine/core/time';

const FIXED = 1 / 60;

describe('fixed timestep clock', () => {
  it('runs one step for a single 60 Hz frame and leaves alpha at 0', () => {
    const clock = createClock(FIXED);
    const steps = beginFrame(clock, FIXED, 0.25, 5);
    expect(steps).toBe(1);
    consumeStep(clock);
    endFrame(clock);
    expect(clock.tick).toBe(1);
    expect(clock.alpha).toBeCloseTo(0, 6);
    expect(clock.accumulator).toBeCloseTo(0, 6);
  });

  it('interpolates when the frame is shorter than a step', () => {
    const clock = createClock(FIXED);
    const steps = beginFrame(clock, FIXED * 0.5, 0.25, 5);
    expect(steps).toBe(0);
    endFrame(clock);
    expect(clock.alpha).toBeCloseTo(0.5, 6);
    expect(clock.tick).toBe(0);
  });

  it('consumes whole steps and keeps the remainder as alpha', () => {
    const clock = createClock(FIXED);
    const steps = beginFrame(clock, FIXED * 2.5, 0.25, 8);
    expect(steps).toBe(2);
    consumeStep(clock);
    consumeStep(clock);
    endFrame(clock);
    expect(clock.tick).toBe(2);
    expect(clock.alpha).toBeCloseTo(0.5, 6);
  });

  it('drops backlog past maxSteps so a stall cannot spiral', () => {
    const clock = createClock(FIXED);
    const steps = beginFrame(clock, 1, 0.25, 5);
    expect(steps).toBe(5);
    for (let i = 0; i < steps; i += 1) consumeStep(clock);
    endFrame(clock);
    expect(clock.tick).toBe(5);
    expect(clock.accumulator).toBeCloseTo(0, 5);
    expect(clock.alpha).toBeCloseTo(0, 5);
  });

  it('ignores negative frame time', () => {
    const clock = createClock(FIXED);
    const steps = beginFrame(clock, -1, 0.25, 5);
    expect(steps).toBe(0);
    endFrame(clock);
    expect(clock.accumulator).toBe(0);
    expect(clock.frame).toBe(1);
  });
});
