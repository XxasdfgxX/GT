/** Fixed-step clock. Simulation consumes `fixedDt` chunks; `alpha` blends the last two states. */

export interface Clock {
  readonly fixedDt: number;
  accumulator: number;
  alpha: number;
  tick: number;
  frame: number;
}

export function createClock(fixedDt: number): Clock {
  return { fixedDt, accumulator: 0, alpha: 0, tick: 0, frame: 0 };
}

/**
 * Adds one displayed frame and returns how many simulation steps to run.
 * Time beyond `maxSteps` is dropped so a long stall cannot spiral.
 */
export function beginFrame(
  clock: Clock,
  frameDt: number,
  maxFrameDt: number,
  maxSteps: number,
): number {
  const dt = Math.min(Math.max(frameDt, 0), maxFrameDt);
  clock.frame += 1;
  clock.accumulator += dt;
  let steps = Math.floor(clock.accumulator / clock.fixedDt + 1e-8);
  if (steps > maxSteps) {
    clock.accumulator -= (steps - maxSteps) * clock.fixedDt;
    steps = maxSteps;
  }
  return steps;
}

export function consumeStep(clock: Clock): void {
  clock.accumulator -= clock.fixedDt;
  if (clock.accumulator < 1e-8) clock.accumulator = 0;
  clock.tick += 1;
}

export function endFrame(clock: Clock): void {
  clock.alpha = clock.fixedDt > 0 ? clock.accumulator / clock.fixedDt : 0;
}
