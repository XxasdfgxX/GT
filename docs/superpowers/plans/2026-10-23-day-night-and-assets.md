# Day/night cycle, game clock and new Poly Haven assets

**Goal:** a GTA-style in-game clock that drives the sun, sky, lights and city life through a full day. Also replace the procedural palms with Poly Haven `tree_small_02`, and use modules from `modular_urban_apartments_facade` on buildings.

**Legend:** `[x]` done · `[~]` partly done (see note) · `[-]` dropped or replaced (see note) · `[ ]` to do.

**Rules carried over from the previous plan:**

- Commit messages in Portuguese.
- `pnpm typecheck`, `pnpm lint` and `pnpm test` pass before each commit.
- Tick items here as they land, with a short note.
- Pure rules go in `src/sim/`. `net` may only import types from `game`.
- New binaries go through LFS. Textures are KTX2.

---

## Decisions to make before starting

- [x] **Day length.** _Decided: 24 real minutes (1 game minute = 1 real second), fixed. No setting._
- [x] **Start time** for solo play. _Decided: 09:00. Rooms start at 09:00 when created and run on the server's clock._
- [x] **Shared time in rooms.** _Decided: yes. The server owns the clock._

---

## Phase 1 — The clock

The clock is pure and lives in `src/sim/clock.ts`. The renderer only reads it.

### Task 1.1: `src/sim/clock.ts`

- [x] `GameClock { minutes: number }`, counting minutes since 00:00 (0–1440, wraps).
- [x] `advanceClock(clock, dtSeconds)`, at the fixed rate of 1 game minute per real second.
- [x] `clockHours(clock)` and `formatClock(clock)` → `"21:07"`.
- [x] `dayFraction(clock)` → 0–1, which is what `setTimeOfDay` takes.
- [x] `MINUTES_PER_SECOND = 1` and `DAY_START = 9 * 60`. _Plus `clockAt(seconds)` for the room._
- [x] Test `clock.test.ts`: wraps at midnight, formats with zero padding, and 1440 game minutes pass in 24 real minutes at the default rate.

### Task 1.2: Solo clock

- [x] Keep the clock in `GameContext` (`ctx.clock`), reset in `bootstrap.start` (like the other `reset*` calls). _`ctx.clock`, created per session in `createContext`, so a restart starts at 09:00 again with no reset call._
- [x] Advance it in the fixed step (`simulate.ts`), so pause stops it.
- [x] Each frame, call `renderer.setTimeOfDay(dayFraction(ctx.clock))`. _At the top of `renderScene`._
- [~] Debug keys: `F6` skips +1 hour and `Shift+F6` −1 hour. Also a debug menu field to set the hour. _F6 / Shift+F6 move an hour, solo only. No debug menu field._

### Task 1.3: Room clock

- [x] `Room.clock`, advanced in `tick.ts` from `room.now`. _No new state: `clockAt(room.now)`._
- [x] Sent in the shared part of the state message (`encodeStates`). It's one number in whole minutes, so bandwidth doesn't matter. _`clock` in `sharedViews`, to 0.01 minute._
- [x] The client adopts the server clock in `applyNetState` and moves it forward locally between messages, so the sun doesn't step. _`applyNetState` sets it every fixed step. At 1 minute per second the steps between messages can't be seen._
- [x] Test (`multiplayer.test.ts`): two members see the same minute, and the clock moves while the room runs.

### Task 1.4: HUD clock

- [x] `HH:MM` in the top right, above the cash, styled like it (`hud.css`). _Cash moved under it._
- [-] Settings: day length. _Dropped: the day is fixed at 24 minutes._

---

## Phase 2 — Sky and sun through the day

Today there's one midday HDRI and a sun that rotates around it. The night (`kloppenheim_02_puresky`) and sunset (`kloppenheim_06_puresky`) HDRIs are already downloaded in `tmp/assets-src/polyhaven/hdris/`.

### Task 2.1: Sun path from the clock

- [x] Map hours to the sun arc. Sunrise around 06:00, noon high, sunset around 18:00 (Rio is near the tropic, so days are close to 12 h). Rewrite `directionAtTime` in `sun-math.ts` so 0.5 = 12:00, not the captured afternoon. _`directionAtTime` in `sun-math.ts`: a great circle tilted north, 70° at noon, east at 06:00, west at 18:00._
- [x] Sun color and intensity by elevation: white at noon, warm orange under 10°, off below the horizon. _`dayLightAt`: orange `0xff9a5a` to `0xfff6ea`, full strength once the sun is about 15° up._
- [x] A moon: a dim, cool directional light (about 0.08, `0x9fb4d8`) opposite the sun at night. One light: the same `DirectionalLight` switches color, intensity and direction, so the shadow setup stays the same. _Intensity 0.16 at most, `0x9fb4d8`, opposite the sun._
- [x] Shadows fade out with the light, and turn off when it's under about 3°, to avoid long streaks at the horizon. _Off when the light is under about 3.4° or very dim._
- [x] Test (`sun-math.test.ts`): below the horizon at 00:00, highest near 12:00, rising between 05:30 and 06:30. _In `sun.test.ts`, plus: weights sum to 1, never lit from below, and smooth minute to minute._

### Task 2.2: Sky blending

- [x] Import the sunset and night HDRIs at 2K (keep `.hdr`; they are loaded once). _`scripts/measure-hdri.mjs` measured all three (disc position, horizon color, mean brightness) into `SKIES` in `sky.ts`. `kloppenheim_02_puresky` is a long exposure: its "sun" is the moon, and it is turned down to 3.5% of the day._
- [x] `sky-mixer.ts`: a fullscreen shader that mixes two equirect HDRIs into a 1024×512 half-float target. Phases: night → dawn (sunset HDRI) → day → dusk (sunset) → night. _Mixes into a 2048×1024 half-float target, then into a 512 cube._
- [x] `scene.background` = the mixed target. _The cube: an equirect render target used as a background would be converted once and never again._
- [x] `scene.environment` = PMREM of the mixed target, rebuilt only when the mix weight has moved more than 2%, and at most once every 0.25 s. Measure the cost of one PMREM pass; if it's more than 3 ms, rebuild at 512×256. _Rebuilt when a weight moves 1% or a sky turns 1.4°, at most every 0.25 s: about every 6 s by day, every second at dusk. Cost not measured yet._
- [x] Rotate the night and sunset HDRIs so their bright spot (moon or sun) lines up with the light direction from 2.1. _Done in the mix shader by shifting u, so each disc lands on its light's azimuth (not its elevation)._
- [x] Fog color and `HORIZON_COLOR` per phase (sample each HDRI's horizon) and blend. Fog thicker at night (`FOG_DENSITY` × 1.3) to hide the far city. _Linear blend of the measured horizons. Fog 30% denser at night._
- [x] `SKY_FILL`, ambient and hemisphere intensities per phase, blended.
- [x] Tone mapping exposure: up about 1.6× at night, so the scene reads without being black. Lamps and windows supply the contrast. _As a 1.6× scale on every light, the sky fill and the background, not the tone mapper's exposure, so lamps and windows stand out against it._

### Task 2.3: Water and materials at night

- [ ] The water's `envMapIntensity` follows the sky fill. Check that the moon gives a glint path.
- [ ] Check the KTX2 surfaces under low light: there should be no banding in the asphalt.

---

## Phase 3 — Lights at night

### Task 3.1: Street lamps

- [x] The lamp model has `street_lamp_01_bulb` and `street_lamp_01_glass` materials. At night, give the bulb an emissive warm white (`0xffd9a0`) scaled by a `nightLight` uniform, so bloom picks it up. One material per model, so this is one uniform for all lamps. _Any glTF material named `*_bulb` gets emissive `0xffd9a0`, from 0 by day to 3 at night (`nightGlow`)._
- [x] A pool of 12 `PointLight`s (no shadows, distance 18 m, decay 2), moved every 0.5 s to the lamps nearest the camera. Lamp positions come from the props pass (`PropResult.lamps`). _8 lights, always in the scene so the light count never changes (that would recompile every material at dusk). Effects high uses 8, medium 4, off 0. The renderer records each bulb's center when it instances the lamps, and re-picks the nearest every 0.5 s._
- [-] Cheap light pools for lamps outside the pool: an additive, unlit decal disc on the sidewalk under each lamp (instanced, `near` LOD), faded by `nightLight`. _Not done. The bulbs glow through bloom; add the decals if the far streets look too dark._
- [ ] Budget: point lights cost per material. Measure FPS with 12, then 8. Keep the higher count that holds the budget. _Needs real hardware. 8 is the current maximum (`LAMP_LIGHTS` in `three-renderer.ts`)._

### Task 3.2: Lit windows

- [x] `facade-shader.ts`: a `uNight` uniform (0–1). Each window decides from its hash whether its room is lit, with the share of lit windows depending on the hour: about 70% at 19:00–22:00, 20% at 02:00–05:00. _Each window's own hash against `windowShare` from `dayLightAt` (a table by hour)._
- [~] Lit windows get emissive warm (`0xffd59a`) or cool (`0xcfe3ff`, TV) glass with a little variation, plus a darker floor band so the room reads. _Warm, or blue for one in seven (a TV), at 1.1–2.1. No darker floor band._
- [~] Shopfronts are lit until 22:00, then mostly dark with the shutter look. _Lit at 90% from 07:00 to 21:30, 10% after 22:30. No shutter look._
- [x] Signs (`emissive` boxes) and stall bulbs are brighter at night. _Signs and signals go from 1.4 to 3.5. Stalls have no bulbs._

### Task 3.3: Car lights

- [-] Traffic cars: the `Headlights` material (`car-paint.ts`) and the taillights get emissive at night, through one shared uniform. _Not needed: `car-paint.ts` already gives headlights and taillights emissive 4–4.5 at all hours, and bloom picks them up._
- [x] The player's car gets two `SpotLight`s (no shadows, 35 m, 30°) while driving at night. Remote players' cars get emissive only. _`Renderer.setHeadlights(mesh, front)`, called each frame from `renderScene`. The two spots stay in the scene by day at intensity 0._
- [-] The sedan fallback visual (`sedan-visual.ts`) uses the same uniform for its `headlight` and `taillight` roles. _Its lamps are already emissive at all hours._

### Task 3.4: Renderer interface

- [x] `Renderer.setTimeOfDay` stays the entry point. Everything in this phase reads one `lighting` state computed from the day fraction: `{ sunUp, nightLight, windowShare }`. _`dayLightAt` returns everything, including `nightLight`, `windowShare` and `shopShare`._
- [~] Test: `lightingAt(fraction)` in `src/sim/` (pure), with `nightLight` = 0 at noon, 1 at midnight and smooth across dusk. _`dayLightAt` stays in `engine/render/sun-math.ts` (it reads the sky table), tested in `sun.test.ts`._

---

## Phase 4 — City life by the hour

- [ ] `nightFactor` (`sim/ped-ai.ts`) takes hours, not the day fraction. Fewer walkers after 22:00, more at 07:00–09:00 and 17:00–19:00.
- [ ] Fewer traffic cars after midnight (the solo pool size and the server's car target, both from one `trafficShare(hours)` in `sim/`).
- [ ] Market stalls only open 06:00–14:00. Hide the produce boxes when closed: this needs the stalls to be their own batch, or a visibility flag per chunk.
- [ ] Test: shares are within range at each hour and never 0, so the streets are never empty.

---

## Phase 5 — Poly Haven `tree_small_02` in place of the palms

**Source:** https://polyhaven.com/a/tree_small_02 (CC0, Rico Cilliers). **Problem:** 4.65 M polygons, 101 MB at 1K. The leaves are geometry-node cards.

### Task 5.1: Spike — can it be cut to about 20k triangles?

- [ ] Download the 1K glTF into `tmp/assets-src/polyhaven/models/street_tree_2/`.
- [ ] Inspect: how many meshes, and whether trunk, branches and leaves are separate primitives (`gltf-transform inspect`).
- [ ] Try `--simplify` on the trunk and branches (target ≈ 6k triangles).
- [ ] Leaves: the simplifier collapses cards, so instead **thin** them. A script keeps 1 card in N (N ≈ 80) and scales each kept card ×(√N × 0.6) around its own center, so the crown stays as full. Target ≈ 12k triangles.
- [ ] Decide: if the crown looks right next to `island_tree_02` at street distance, continue. If not, fall back to keeping `island_tree_02` on the coast too and record it.

### Task 5.2: Pipeline and placement

- [ ] `scripts/import-polyhaven-models.mjs`: a `thinLeaves` step for this model, then KTX2 through `encode-props-ktx2.mjs`.
- [ ] `PROPS.shadeTree` in `props.ts`, with its center offset in `PLANT_CENTERS` if needed.
- [ ] Replace `addPalm` with the new tree (scale it to 6–8 m). Coast avenue: every tree slot. Streets: the 40% that were palms.
- [ ] Remove `addPalm` and the trunk constants.
- [ ] `docs/ASSETS.md` and `CREDITS.txt`.
- [ ] Test (`facades.test.ts`): the coast avenue has shade trees and no cylinder trunks.
- [ ] Budget: triangles × instances on the coast. Expected: under 2 M triangles in view. If over, use `near` LOD plus a far billboard.

---

## Phase 6 — Modules from `modular_urban_apartments_facade`

**Source:** https://polyhaven.com/a/modular_urban_apartments_facade (CC0, James Ray Cock). One assembled facade, 51.5 m wide × 17 m tall × 6.7 m deep, 118k polygons, 16 MB at 1K. It uses trim sheets (`trim_01`, `trim_02`), `plaster` and `objects` materials.

### Task 6.1: Spike — split it into parts

- [ ] Download the 1K glTF into `tmp/assets-src/polyhaven/models/apartment_facade/`.
- [ ] List its nodes and meshes. Find the reusable modules: window (frame + glass), balcony with railing, entrance door, AC unit, drainpipe, cornice or ledge, shop shutter.
- [ ] `scripts/split-facade-modules.mjs` (gltf-transform): one GLB per chosen module, origin at its back-bottom-center so it sits on a wall, and textures shared through the trim sheets. KTX2 as in the props.
- [ ] Measure each module (width, height, depth) and record it in a table here.

### Task 6.2: Hillside apartment blocks (in place of the favela houses)

- [ ] On hill zones (`zoneAt`), on lots stepped into the slope, build low blocks (2–5 floors) from a plaster box plus modules: windows per bay, a door at the bottom, balconies on some floors, AC units, a drainpipe at a corner.
- [ ] Colors: the plaster takes the lot's paint per instance (like the other walls), so the hill reads as the colorful favela-style mix.
- [ ] Box colliders from each block's footprint (walkers and the player).
- [ ] `near` LOD for the modules. `far` LOD keeps the shader-drawn windows on the plain box.

### Task 6.3: Modules on existing residential buildings

- [ ] On `residential` lots with ≤ 6 floors: model windows and balconies replace the shader windows on the street-facing wall, for the `near` LOD only. The shader keeps drawing them on the far LOD and the side walls.
- [ ] The facade attribute gets a "modeled" flag so the shader skips windows where modules sit.
- [ ] Night: the module glass gets the same lit-window rule as the shader (per-instance hash), via `onBeforeCompile` on the glass material.
- [ ] Budget: count module instances per chunk. Expected: draw calls stay ≤ 400 and instances ≤ 25k in view. If over, limit modules to the first three floors.
- [ ] Test: every module instance stands against a wall (within 0.1 m), and none is placed on a party wall.

---

## Phase 7 — Wrap-up

- [ ] `docs/DECISIONS.md`: new ADRs for the clock (server-owned, solo in the fixed step), sky blending and PMREM rebuilds, night lights (light pool + emissive), and the tree thinning.
- [ ] `docs/ASSETS.md` and `CREDITS.txt` for both Poly Haven models and the two HDRIs.
- [ ] Manual, on real hardware: a full 24-minute day in solo and in a room with two tabs. Record FPS at noon and at midnight per quality preset in `docs/ARCHITECTURE.md`.
- [ ] Screenshots from the same viewpoints at 09:00, 18:30 and 23:00 in the PR description.

---

## Order and size

| Phase | What                                | Size                               |
| ----- | ----------------------------------- | ---------------------------------- |
| 1     | Clock, HUD, room sync               | Small                              |
| 2     | Sun, moon, sky blend, fog, exposure | Medium                             |
| 3     | Lamps, windows, car lights          | Medium                             |
| 4     | Walkers and traffic by the hour     | Small                              |
| 5     | `tree_small_02` replacing palms     | Medium, with a spike that can fail |
| 6     | Facade modules and hillside blocks  | Large, with a spike first          |
| 7     | Docs and manual checks              | Small                              |

Phases 1–4 are the day/night work and go in order. Phases 5 and 6 are independent and can come before or after.
