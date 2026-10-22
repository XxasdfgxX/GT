# 2026-10-22 review: bug fixes and graphics overhaul — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Legend: `[x]` done, `[~]` partly done (the note says what is left), `[-]` replaced or skipped (the note says why), `[ ]` to do.

**Goal:** Fix the bugs found in the 2026-10-22 review (client lifecycle, server trust and robustness, tooling), then make the island look realistic. That means post-processing, real facades instead of painted boxes, Poly Haven PBR materials and props, and better vegetation and street furniture.

**Architecture:** Eleven phases, one branch and one PR per phase, all off `master`. Phases 0–4 are fixes and refactors. Phases 5–9 are graphics. Phase 10 closes with docs and licensing. Graphics phases are ordered so each one is visible on its own: lighting first, because every later asset looks better with AO and shadows.

**Tech Stack:** TypeScript 6 (`strict`, `exactOptionalPropertyTypes`), Vitest 5, Zod 4, Three 0.186, `postprocessing` 6.39 (already a dependency, unused), Rapier 0.21, bitECS 0.4, `ws` 8. New: `n8ao` (CC0), `@gltf-transform/cli` (dev tool, not runtime), optionally `three-fenestra` (MIT).

## Decisions already made

- Poly Haven is the main source for textures, HDRIs and props, all CC0. Downloads land in `tmp/assets-src/polyhaven/` (gitignored), listed in `tmp/assets-src/polyhaven/MANIFEST.md`. Only optimized output goes to `public/assets/`.
- "Best quality" means **2K textures at most**, with 1K for small props, compressed to KTX2. 4K and 8K are not shipped: a browser tab cannot hold them across ~15 materials.
- The server stays on **sanity limits**, not an authoritative simulation (as in the 2026-10-21 plan). This plan only closes the gaps the review found.

## Decisions still open (ask before the phase that needs them)

- [ ] **Commercial or not?** `aston-dbr1.glb` is CC BY-NC-SA (non-commercial only). The Ferrari, GT-R, M340i and UAZ have no recorded license. If the game will be sold or monetized, Phase 10 replaces them. Real brand names are a trademark risk too.
- [ ] **CC-BY assets from Sketchfab** (favela houses, palms) require on-screen or credits-file attribution. That's fine if a credits screen is acceptable (Phase 9).
- [ ] **Interior-mapped windows:** use `three-fenestra` or a small custom shader. Phase 6.2 is a spike that decides.

## Global constraints

- Trunk is `master`. Each phase branches from an up-to-date `master`, after the merge of any phase it depends on.
- Branches: `chore/tooling`, `fix/client-lifecycle`, `fix/server-hardening`, `perf/net-bandwidth`, `refactor/shared-sim`, `feat/post-fx`, `feat/facades`, `feat/polyhaven-materials`, `feat/polyhaven-props`, `feat/vegetation-brazil`, `docs/review-closeout`.
- At the end of each phase: `pnpm typecheck`, `pnpm lint`, `pnpm test` green, and a manual run of `pnpm play` over what the phase touched. Graphics phases also record a before/after screenshot from the same spawn and camera, plus FPS and `renderer.drawCalls()` from the F3 HUD.
- **Performance budget for graphics phases:** 60 FPS at 1080p, Sharpness "high", Shadows "high", on the dev machine. Draw calls ≤ 400. Texture memory ≤ 400 MB (estimated by `MaterialLibrary.byteSize()` plus models). If a step breaks the budget, add a quality-preset gate instead of dropping the feature.
- Tests live in `src/tests`, environment `node`. The pure part of every fix gets a test. Anything that needs DOM or WebGL is verified by hand, and the step says what to look for.
- No `new` on the hot path (ARCHITECTURE.md). Scratch objects stay at module level.
- Commit messages follow the repo style: one Portuguese sentence describing the effect.
- Every new binary (`.glb`, `.gltf`, `.bin`, `.hdr`, `.ktx2`, `.jpg`, `.png`) goes through Git LFS. Check `.gitattributes` before the first commit of an asset phase.
- Line numbers below are from the review and may have moved. Locate by symbol.

---

## Phase 0 — Tooling (`chore/tooling`)

### Task 0.1: Pin pnpm

**Files:** Modify `package.json`

- [x] Add `"packageManager": "pnpm@12.6.0"` (the version CI pins in `.github/workflows/ci.yml`).
- [x] Run: `corepack pnpm install --frozen-lockfile`. Expected: no lockfile change.

### Task 0.2: CI builds too

**Files:** Modify `.github/workflows/ci.yml`

- [x] In `actions/checkout@v5`, set `with: { lfs: true }`. Otherwise `vite build` copies LFS pointer files into `dist/`.
- [x] After `pnpm test`, add `- run: pnpm build`.
- [x] Push the branch. Expected: the CI job is green and runs the build step.

### Task 0.3: Lint and typecheck `scripts/`

**Files:** Modify `eslint.config.js`, `tsconfig.json` (or a new `scripts/tsconfig.json`), `package.json`

- [x] Remove `scripts/**` from ESLint `ignores` (if listed), so `scripts/*.ts` uses the type-checked config and `scripts/*.mjs` uses `disableTypeChecked`.
- [x] Add `scripts/**/*.ts` to a tsconfig that `pnpm typecheck` runs.
- [x] Fix whatever errors appear in `scripts/validate-vehicle.ts`.
- [x] Run: `pnpm typecheck && pnpm lint`. Expected: green.

### Task 0.4: Ignore files

**Files:** Modify `.gitignore`, `.prettierignore`

- [x] `.gitignore`: add `.superpowers/`. Today it's ignored only by its own nested `.gitignore`.
- [x] `.prettierignore`: add `tmp/`, `.worktrees/`, `.superpowers/`, `public/`, `dist/`.
- [x] Run: `git status --ignored --short`. Expected: those folders are listed as `!!`.

---

## Phase 1 — Client lifecycle (`fix/client-lifecycle`)

### Task 1.1: F4 debug view hides random meshes after a restart

**Files:** Modify `src/game/features/world/debug-graph.ts`, `src/app/bootstrap.ts`. Test `src/tests/world-reset.test.ts`

Today `graphMesh`, `navMesh` and `built` are module state that `start()` never resets. After a restart the stale ids point at the new renderer's meshes.

- [x] Export `resetDebugView()`, which sets `graphMesh = 0`, `navMesh = 0` and `built = false`.
- [x] Call it in `start()` next to `resetRemotes()`, `resetRemains()` and the others.
- [-] In `syncDebugView`, return early when `graphMesh === 0 && navMesh === 0` and the view is off. _Not needed: renderer ids start at 1, so id 0 is a no-op on every call._
- [x] Do the same audit for `src/game/features/pedestrians/crowd.ts` (`nearMesh`, `slotVariant`). Add `resetCrowd()` called from `start()`, so a multiplayer session (which never calls `spawnPedCrowd`) starts clean. _Also found `shells` in `traffic/pool.ts` with the same bug and added `resetTrafficPool()`. In multiplayer after a solo game, the crowd hid ids 1–28 of the new renderer every frame, not just with F4._
- [x] Test: build the debug view on a fake renderer, call `resetDebugView()`, sync on a second fake renderer with `showGraph = false`. Expected: no `setMeshVisible` call. _`src/tests/session-reset.test.ts` covers the crowd, the traffic pool and the debug view, and fails without the resets._
- [ ] Manual: F4 on, pause, Restart, F4 off and on again. The graph shows, and no building, ghost or pickup disappears.

### Task 1.2: One test that catches all module state

**Files:** Create `src/tests/module-state.test.ts`

- [-] Grep `src/game` and `src/net` for top-level `let` and for top-level `const` holding `Map`, `Set`, arrays or typed arrays. _Replaced by `session-reset.test.ts`. The grep found the three cases above. The rest of the module state is scratch buffers overwritten every frame, and a source-grep test would be brittle._
- [-] Keep an explicit allowlist (constant tables) and require every other match to have a matching `reset*` export called from `bootstrap.start`. The test reads the source files with `fs` and fails on a new unlisted one. _See above._
- [-] Run: `pnpm test`. Expected: passes after 1.1, and fails if you temporarily remove `resetDebugView()` from `start()`. _See above._

### Task 1.3: A failed restart leaves a blank page

**Files:** Modify `src/app/bootstrap.ts`, `src/ui/start-menu.ts`

- [-] In `start()`, keep the previous `session` alive while the new one loads (Rapier init, `renderer.prepare()`, model preloads). Call `previous.stop()` only after the new session is ready to run its first frame. _Not possible as written: `start()` resets shared module state before loading, so the old session would run on wiped state._
- [-] If the new load throws, stop the half-built new session and leave the old one paused and intact, so "Continuar" still works. _See above._
- [x] If keeping both alive is too costly (two WebGL contexts), hide "Continuar" after a failure and show "Restart" only. (`start-menu.ts` hides "Continuar" in the launch catch.)
- [ ] Manual: in DevTools block `/assets/character.glb`, press Restart from the pause menu, then click "Continuar". Expected: either the old game resumes or the button is gone. Never a blank page.

### Task 1.4: An exception in the frame stops the game silently

**Files:** Modify `src/app/bootstrap.ts` (the `frame` callback around `runFrame`), `src/ui/mount-hud.ts`

- [x] Wrap the `runFrame(...)` call in `try/catch`. On the first error, log it with `logger.error`, keep scheduling `requestAnimationFrame`, and show a small HUD banner: "Erro no jogo, veja o console". _No HUD banner: one bad frame is logged and the loop continues._
- [x] After 3 consecutive failing frames, stop the loop and show the pause menu with the message. _Shows the start menu with a `notice` (new `MenuOptions` field), since the session is stopped._
- [ ] Manual: throw inside one system behind a temporary flag. Expected: banner, then pause menu, no frozen canvas.

### Task 1.5: Solo cash drops never expire

**Files:** Modify `src/game/systems/cash.ts`, `src/game/ecs/components.ts` (`Pickup`). Test `src/tests/systems.test.ts` or a new `cash.test.ts`

- [x] Add `Pickup.expires` (`Float32Array(CAP)`). Set it in `spawnPickup` to `now + DROP_LIFETIME`, reusing the server's constant from `src/net/room.ts`. Move both constants to `src/content/sim.ts` so the client doesn't import `net/room`. _Done as `Pickup.left` counting down with `fixedDt`, so there is no clock to keep. The constants moved to `src/game/play/wallet.ts`, next to the other cash rules; `room.ts` re-exports them._
- [x] Each tick, set `amount = 0` and hide the mesh for any drop past `expires`. Free slots are already reused by `spawnPickup`.
- [x] Cap live drops at `MAX_DROPS`. When full, recycle the oldest.
- [x] Test: spawn `MAX_DROPS + 10` drops. Expected: the live count is `MAX_DROPS`. Advance time by `DROP_LIFETIME + 1`. Expected: zero live. (`src/tests/cash-drops.test.ts`)

### Task 1.6: Join never times out

**Files:** Modify `src/net/session.ts` (`connectRoom`). Test `src/tests/net-client.test.ts`

- [x] Start a 10 s timer when the socket is created. Clear it on `welcome`. On expiry, call `fail('Servidor não respondeu')` and close the socket.
- [x] Test with a fake socket that opens but never sends. Expected: rejects after 10 s of fake time (`vi.useFakeTimers()`).

### Task 1.7: Punch serial wraps at 65,535

**Files:** Modify `src/game/ecs/components.ts` (`Player.punchSerial`), `src/net/protocol.ts` if the schema caps it

- [x] Change `Player.punchSerial` from `Uint16Array` to `Uint32Array`.
- [x] Check that the Zod schema for `punch.serial` allows up to `2**32 - 1`. _It is a hand parser that takes any positive integer._
- [x] Test: set serial to 70,000, send a punch. Expected: the server accepts it. _Tests that the component holds the value, in `world-reset.test.ts`._

---

## Phase 2 — Server hardening (`fix/server-hardening`)

### Task 2.1: Clamp the client's height

**Files:** Modify `src/net/room.ts` (`pushPose`, `steerCar`). Test `src/tests/server-limits.test.ts`

- [x] In `pushPose`, replace `player.y = pose.y` with a clamp to `[ground - 0.5, ground + MAX_AIR]`, where `ground = sampleHeight(player.x, player.z)`. `MAX_AIR` is about 3 m on foot (jump plus curbs) and about 6 m in a car (ramps, crashes). Put the value in `content/sim.ts`. _`MAX_AIR` = 6 m for both modes, plus 1 m below the terrain. It lives in `room.ts` with the other limits, and only applies when `room.limits` is on._
- [x] `steerCar` copies `player.y`, so it's covered.
- [x] Test: send a pose with `y: 1e6`. Expected: stored y is at most ground + `MAX_AIR`.

### Task 2.2: A tripped player can't move

**Files:** Modify `src/net/room.ts` (`pushPose`). Test `src/tests/server-limits.test.ts`

- [x] While `player.down > 0`, ignore x, y, z and yaw from the pose. The server keeps the last position until `down` reaches 0.
- [x] Test: trip a player, send a pose 3 m away. Expected: position unchanged until `down` ends.

### Task 2.3: Backpressure

**Files:** Modify `server/index.ts`

- [x] In the tick broadcast, skip `socket.send(state)` when `socket.bufferedAmount > 1_000_000`. If it's still above that after 5 s, `socket.terminate()`. _`SLOW_GRACE` = 5 s._
- [x] Put the constants in `src/net/limits.ts` next to the bucket.
- [ ] Manual: a Node test client that connects and never reads (pause the stream). Expected: the server's RSS stays flat, and the client is dropped after ~5 s. _Not run yet._

### Task 2.4: Heartbeat for half-open sockets

**Files:** Modify `server/index.ts`

- [x] Standard `ws` pattern: mark `alive = true` on `pong`. Every 10 s, `terminate()` sockets that are still `alive === false`, then set `alive = false` and `ping()`.
- [x] `terminate()` fires `close`, so the existing `drop` handler frees the slot and calls `leave`.
- [x] Clear the interval on server `close`.

### Task 2.5: Per-IP connection cap

**Files:** Modify `server/index.ts`, `src/net/limits.ts`. Test `src/tests/server-limits.test.ts`

- [x] Count open sockets per `request.socket.remoteAddress`. Above `MAX_SOCKETS_PER_IP` (4), reply `{ type: 'error', message: 'Conexões demais' }` and close. _The cap is 8 per address, not 4, so local testing with several tabs still works. All browsers arrive through the Vite proxy as 127.0.0.1, so `/ws` now has `xfwd: true`. The server trusts `X-Forwarded-For` only from loopback, and takes the last entry (the one the proxy appended). Checked against the real server: the 9th socket gets "Conexões demais"._
- [x] Also cap total sockets per process (e.g. 64) to cover spoofed or proxied cases.
- [x] Extract the counting into a pure function in `limits.ts` and unit-test it.

### Task 2.6: Pickup messages flood the bucket

**Files:** Modify `src/game/systems/net.ts` (`publishNet`). Test a new `src/tests/net-systems.test.ts`

- [x] Keep a module-level `Map<dropId, sentAt>`. Resend a pickup for the same id only after 300 ms. Clear the map in `resetNet()`. _Keyed on a clock that `publishNet` advances. `PICKUP_RETRY` = 0.3 s._
- [x] Test: 10 drops in reach over 20 ticks at 15 Hz. Expected: ≤ 10 × (20 / 4.5) pickups, and the pose message is sent every tick. _`src/tests/net-systems.test.ts`. Found while writing it: poses go out at about 12 Hz, not 15, because `poseWait` is reset rather than accumulated. That is left as is, because fixing it raises bandwidth by 25% before Phase 3._

---

## Phase 3 — Network bandwidth (`perf/net-bandwidth`)

Today a state message is about 15.5 KB, around 310 KB/s per client. **Depends on:** Phase 2.

### Task 3.1: Measure

- [x] Turn the probe from the review into `src/tests/net-size.test.ts`. Build a room with 16 players, the full crowd and traffic, encode one state, and assert the size is below a threshold. Start with the current size so the test passes, then lower it in 3.2 and 3.3. _`src/tests/net-size.test.ts`. A full room with 16 players measured 19.1 KB._

### Task 3.2: Quantize

**Files:** Modify `src/net/room.ts` (encode, ~601-649), `src/net/protocol.ts`

- [x] Round positions to 0.01 m and yaw to 0.001 rad before `JSON.stringify` (e.g. `Math.round(x * 100) / 100`). _`cm()` and `mrad()` in `room.ts`: 19.1 → 13.8 KB (−28%). The 40% target was not met because the remaining bulk was the 100 NPCs and 40 cars sent to everyone._
- [x] Expected: the size drops at least 40%. Update the threshold.

### Task 3.3: Send only what changed

- [-] Per member, remember the last sent NPC and car poses. Send only entries that moved more than 2 cm or turned more than 0.01 rad, plus a full snapshot every 2 s. _Replaced by interest management: walkers and cars go only to members within `INTEREST_RADIUS` (220 m), and cars a player drives go to everyone. `snapshot()` applies the same filter, so tests still see exactly what is on the wire. The client already hides entries that leave the list and snaps them back in when they return. This gets most of the win without a delta protocol._
- [-] The client keeps the last known pose for entries missing from a delta (`applyNetState`). _Not needed without deltas._
- [-] Test: in a static scene, the second message after a full one has no NPC entries. _Instead: the interest test in `net-size.test.ts`._
- [x] Expected: under 4 KB per tick in a typical room. _A full 16-player room is about 5.3 KB, under a 6 KB assertion. A typical 4-player room is about 2.5 KB. The rest is the roster (1.7 KB at 16 players), which could be sent only on change, but that needs a protocol change._

---

## Phase 4 — Shared simulation, split god files (`refactor/shared-sim`)

**Depends on:** Phases 2 and 3 (they touch `room.ts`).

### Task 4.1: Pure road and traffic rules in one place

**Files:** Create `src/sim/traffic-rules.ts`. Modify `src/game/systems/traffic.ts`, `src/net/room.ts`

- [~] Move `pickNext` (turn filter, Task 3.9 of the previous plan), traffic-light state, `laneOffset` and parking-on-road into `src/sim/`, with no ECS and no Three imports. _The turn rule moved to `exitsAhead()` in `content/map/roads.ts` (pure, on any `{a, b, oneWay}` spans). Solo `pickNext` takes the straightest exit, as before; the server `pickExit` picks randomly among the same exits, so no more hairpins. The light rule is shared through `lightPhase()` / `lightOpen()` in `traffic-ai.ts`: server cars now ease off and stop at red nodes on the same 6 s cycle. Lane offset was already shared. Not moved to a new `src/sim/` folder: `content/map` already holds the pure road code._
- [~] `room.ts` replaces `pickExit` (~1228) and `parkOnRoad` (~963) with the shared ones. Server cars stop taking random U-turns and start obeying lights. _`pickExit` now uses the shared rule. `parkOnRoad` not touched._
- [ ] `room.ts` must no longer import from `src/game/systems/*`. Add that rule to the architecture test in `src/tests`. _Not done: it still imports from `game/systems/traffic-ai`, `game/play/*` and others. Moving those pure helpers out of `game/` is a bigger move than this phase took._

### Task 4.2: Split `room.ts` (1,261 lines)

- [x] Into `src/net/room/roster.ts` (join, leave, poses), `combat.ts` (punch, ram, death, drops), `npc.ts`, `traffic.ts` and `encode.ts`, with `room/index.ts` re-exporting the current API. _Eight modules under `src/net/room/`: `types` (limits, defs, shapes), `roster`, `movement`, `combat`, `npc`, `traffic`, `encode`, `tick`, from 39 to 308 lines each. `room.ts` stays as a 27-line facade, not `room/index.ts`, because the server's Node resolve hook only appends `.ts` and Node does not resolve folders. Split by a script that keeps each declaration with its doc comment and computes each module's imports from what it uses._
- [x] No behaviour change. `multiplayer.test.ts` and `server-limits.test.ts` must pass unchanged. _258/258 tests unchanged, and the server loads every module under Node with type stripping._

### Task 4.3: Split `traffic.ts` (794) and `pedestrians.ts` (653) by mode

- [x] `traffic.ts` → `lane-driving.ts`, `stolen-car.ts`, `wrecks.ts`, `unstick.ts`. Audio calls stay in one place. _Split differently: `traffic.ts` keeps the system, lane driving and activation (456 lines, down from 761), because those write the module's `let` state (`heading`, `cursor`, `batchCount`, `salt`), which an importing module cannot reassign. `traffic-stolen.ts` holds stolen-car driving; `traffic-unstick.ts` holds the wreck and unstick code and the spawn-spot checks._
- [x] `pedestrians.ts` → `ped-ai.ts` (already exists, extend it), `shove.ts`, `ramming.ts`, `ped-combat.ts`. _`pedestrians.ts` keeps the system and walking (305 lines, down from 653; it owns `salt`). `ped-ramming.ts`, `ped-shove.ts` and `ped-fight.ts` hold the rest. `ped-ai.ts` is unchanged._
- [x] No behaviour change. `traffic-peds.test.ts`, `traffic-ai.test.ts` and `ped-ai.test.ts` pass unchanged. _258/258 unchanged._

### Task 4.4: Tests for the multiplayer glue

- [~] `src/tests/net-systems.test.ts`: `applyNetState` (spawn, move and remove remotes), `publishNet`, mount and dismount in `net-ride.ts`, and `seat.ts`. _`applyNetState` (health, cash, trip, hiding a dead body, moving on a new place serial) and `publishNet` (pickup dedupe) are covered. `net-ride.ts` and `seat.ts` are not._
- [x] `src/tests/server-dispatch.test.ts`: extract the `connection` handler body from `server/index.ts` into `src/net/dispatch.ts` and test unknown room, room full, bucket close and per-IP cap with fake sockets. _`src/net/dispatch.ts` exports `connect()` against a two-method socket interface; `server/index.ts` keeps only the `ws` wiring and the heartbeat. Tests: welcome, unknown room, full room, slots given back after a refusal, per-address cap, flood close (1008), and leaving the room on close (twice is safe)._

---

## Phase 5 — Lighting and post-processing (`feat/post-fx`)

This phase gives the biggest visual gain for the least effort, and every later phase builds on it. **Independent of Phases 1–4.**

### Task 5.1: Effect composer

**Files:** Modify `src/engine/render/three-renderer.ts`, `src/engine/render/display.ts`, `src/ui/settings.ts`. Add dependency `n8ao`

- [x] `pnpm add n8ao`. Check that its peer range accepts three 0.186 and needs WebGL2, which is already the default. _n8ao 2.0.1 needs postprocessing ≥ 6.30 and three ≥ 0.137, and ships no types, so `src/types/n8ao.d.ts` covers what is used._
- [x] Add a setting `effects: 'off' | 'medium' | 'high'` to the settings schema (`src/ui/settings.ts`), the settings menu and `setGraphics`. Default `'high'`. _Default `high`, `.default('high')` in the schema so older saves still load._
- [-] Create the `WebGLRenderer` with `antialias: canvasAntialias(effects !== 'off')`. Changing `effects` across off/on needs a restart. Say so in the menu, as for other context-level options. _The composer always runs (SMAA plus tone mapping), and `effects` only toggles AO and bloom. The canvas never uses MSAA, and changing the setting needs no restart._
- [x] Build an `EffectComposer` from `postprocessing` with a `RenderPass`, an `N8AOPostPass` (half-res on `'medium'`, full on `'high'`; radius about 2 m, intensity about 2.5, `distanceFalloff` about 1) and an `EffectPass` with `SMAAEffect`, `BloomEffect` (`luminanceThreshold` 0.9, intensity 0.4, mipmap blur) and `ToneMappingEffect`. _RenderPass → N8AOPostPass (radius 2 m, intensity 2.5) → EffectPass(bloom, ACES) → EffectPass(SMAA high), on a half-float buffer._
- [x] With the composer on, set `renderer.toneMapping = NoToneMapping` and let the effect do it. Try `AgX` and `ACES_FILMIC` and keep the one that looks better with the HDRI. _ACES kept, which is closest to the old look. AgX not compared yet._
- [x] `render()` calls `composer.render(dt)` when on, `renderer.render` when off. `setSize` calls `composer.setSize`. `dispose` calls `composer.dispose()`. _`renderer.info.autoReset = false` and a reset once per frame, so the F3 draw-call count still covers the whole frame._
- [~] Manual: compare screenshots. Expected: contact shadows under cars, curbs and building bases, no jagged edges, lamps glow. FPS within budget at `'high'`. _Before/after screenshots taken in headless Chrome (SwiftShader) with `scratchpad/shot.mjs`. The pipeline renders correctly, but AO is subtle on bare boxes, so most of the visible gain comes in Phases 6–8. FPS is not measurable headless; needs a run on real hardware._

### Task 5.2: Shadows that reach the horizon

**Files:** Modify `src/engine/render/sun-controller.ts`, `src/engine/render/three-renderer.ts`

- [-] Replace the single 36 m shadow frustum with cascaded shadows using `three/addons/csm/CSM.js`: 3 cascades, `maxFar` 250 m, practical split mode, `lightMargin` 100. _Not done: CSM overrides `onBeforeCompile`, which the world-UV materials already use. Instead, one map covers more ground: high is 4096 px over ±90 m (was 2048 over ±36), low is 2048 over ±45. That is about 4.4 cm per texel, the same density as before. `lightDistance` went from 90 to 200 m so towers on the sun side stay in the volume._
- [-] CSM patches materials. Call `csm.setupMaterial(material)` for every `MeshStandardMaterial` created in `three-renderer.ts`, `material-library.ts` and glTF loads. Keep the texel snapping from `sun-math.ts` only if CSM shimmer is visible. _See above._
- [x] On Shadows "low", use 2 cascades at 1024. On "off", disable CSM. _Low is 2048 over ±45 m._
- [x] Let buildings (`lod: 'far'` included) and tree canopies cast shadows: set `castShadow: true` in `facades.ts` and `props.ts`. _Both LODs, plus awnings, balconies, water tanks, tree trunks and canopies, posts, stalls and parked cars. Also fixed: r186 removed `PCFSoftShadowMap` and was silently falling back to PCF. Now it is `PCFShadowMap` with `radius = 2`._
- [ ] Manual: drive along the coast avenue. Tower shadows reach across the street 100 m away, with no visible pop at cascade boundaries. _Needs real hardware._

### Task 5.3: Environment and fog

**Files:** Modify `src/engine/render/environment.ts`, `src/engine/render/sky.ts`, `src/engine/render/three-renderer.ts`

- [x] Use the HDRI picked in `tmp/assets-src/polyhaven/MANIFEST.md` (Phase 7 copies it in). Update `HDRI_SUN` and `HORIZON_COLOR` by sampling the new image. `sun.test.ts` and `sky.test.ts` must be updated to match. _`kloofendal_48d_partly_cloudy_puresky`. `HDRI_SUN` = (0.55435, 0.74175, 0.37749) and `HORIZON_COLOR` = `0xacb2c2`, measured with an RGBE reader. The same method reproduces the old sun and horizon values to within 1/255. The old HDRI is removed from `public/`._
- [-] Set `scene.backgroundBlurriness = 0` and `scene.environmentIntensity = 1`. Lower the hemisphere and ambient lights further if AO makes the result look washed out. _They were already at the defaults (0 and 1)._
- [x] Replace linear `Fog(520, 2400)` with `FogExp2` (density about 0.00035) for a softer haze over the sea. _`FOG_DENSITY` = 0.0007, not 0.00035: 0.00035 would barely haze at 2.4 km, where the old linear fog was opaque._
- [-] `setTimeOfDay` is wired but never called. Either drop it from `Renderer` (and from `sun-controller.ts`), or add a debug key to cycle it and swap to the sunset or night HDRIs downloaded in Phase 7. Recommended: drop it now, and add a follow-up issue. _Kept: `pedestrians.ts` reads `timeOfDay()` for crowd density. Nothing sets it yet._

### Task 5.4: Street lights that actually light

**Files:** Modify `src/engine/render/three-renderer.ts`, `src/content/map/props.ts`

- [-] For the lamp heads already batched in `addLamp`, add a small pool (8–12) of `PointLight`s, or `SpotLight`s pointing down, with no shadows. Each frame, move the pool to the lamps nearest the camera. This is only worth it if a night time-of-day is kept from 5.3; otherwise skip and note it. _Skipped until there is a night._

---

### Task 5.5 (added): The camera goes through walls

Also to check on real hardware: with effects on, window glass shows a speckled pattern that is not there with effects off. It may be N8AO on glass seen edge-on, or just SwiftShader.

Found in the screenshots: the orbit camera ends up inside buildings next to the player, so half the screen is a wall texture.

- [x] In `src/game/systems/camera-follow.ts`, cast a ray from the pivot to the desired camera position (Rapier `castRay` against static colliders), and pull the camera in to the hit minus 0.3 m. Ease back out over about 0.2 s. _No raycast exists in `PhysicsWorld`, so `play/camera-occlusion.ts` tests the pivot-to-lens segment against the building colliders (`tallBoxesNear`, slab test in each box's frame). It runs after the smoothing, so the pull-in is instant and the ease-out uses the existing smoothing. 0.35 m margin. Seen in a headless screenshot: the lens stays on the player's side of the wall._
- [x] Test: a wall between pivot and camera. Expected: the camera ends up on the pivot's side. _`src/tests/camera-occlusion.test.ts`: a hit at the near face, a miss beside and above, a turned wall, and a pivot inside a box._

## Phase 6 — Real facades (`feat/facades`)

**Depends on:** Phase 5, so AO shows the relief. Goal: a 15-floor tower reads as 15 floors with windows, balconies and a rooftop. A shop reads as a shop.

### Task 6.1: Facade parameters per building

**Files:** Modify `src/content/map/blocks.ts` (`Footprint`), `src/content/map/batch.ts` (`Stamp`, `CityMesh`), `src/engine/render/renderer.ts` (`InstanceBatchDesc`), `src/engine/render/three-renderer.ts`

- [x] Add a `style` to `Footprint`, picked by `kind` and `rng`. Use about 6 styles: `plaster-grid` (residential), `concrete-band` (tower), `brick-raw` (house, cheap), `tile-base-plaster` (shop), `glass-curtain` (tower near the coast), `colonial` (plaza edge). _Picked in `facades.ts` from the lot's own RNG (`pickStyle`), not in `blocks.ts`, so the city layout and its tests do not shift. `FACADE_STYLES` / `FACADE_BAYS` live in `content/map/facades.ts`._
- [x] Add an optional per-instance `Float32Array` attribute to stamps and batches: `facade: [baseY, floorHeight, bayWidth, styleIndex]`. The renderer uploads it as `InstancedBufferAttribute('facade', 4)`. _`Stamp.facade` / `CityMesh.facade` / `InstanceBatchDesc.facade`: [floor height, style, shopfront, seed]. Wall batches get their own unit box geometry, because the attribute is per mesh. Walls without a grid (parapets) get zeros._
- [~] Test (`city.test.ts`): every footprint gets a style. Style counts are within 10% of the target mix for the fixed seed. _`src/tests/facades.test.ts` checks that every lot gets a near and a far wall with a grid, and that content and shader agree on bay widths. Style mix is not tested._

### Task 6.2: Window shader spike (decides the open question)

**Files:** Create `src/engine/render/materials/facade-material.ts`

- [-] Option A, `three-fenestra` (MIT): install it, apply it to one tower's walls, check that it works with `InstancedMesh`, CSM and the composer. _Went straight to option B: it reuses the world-UV hook that already exists._
- [x] Option B, custom `onBeforeCompile` on the paint material, in the same style as `worldMaterial` in `three-renderer.ts`: _`materials/facade-shader.ts`. Whole bays per wall, frames, dark glass (roughness 0.05, no normal map) and a few curtained rooms by hash. Slab line at each floor. Shopfront on the ground floor of shops and towers. No night lighting yet._
  - [ ] Compute local facade coordinates from the world position and the `facade` attribute: floor index `(y - baseY) / floorHeight`, bay index along the wall.
  - [ ] Inside each bay, cut a window rectangle (about 60% × 55% of the bay).
  - [ ] Shade the window as dark reflective glass (low roughness, env reflection), plus a cheap interior: parallax back wall with a random tint per window from a hash of `(floor, bay, instanceId)`, with some windows lit at night.
  - [ ] Draw a thin floor band and a frame around the window with a slightly different tint.
  - [ ] Keep the ground floor different by style: shop glass with a roller shutter half-down for `tile-base-plaster`, a door and two windows for houses.
- [~] Pick the option that holds 60 FPS with the full city in view and works with instancing. Record the choice in `docs/DECISIONS.md` (new ADR). _Picked B. FPS not measured; the ADR is still to write._

### Task 6.3: Geometry relief

**Files:** Modify `src/content/map/facades.ts`

Replace the single glass slab with real modules. All are boxes stamped through `CityBatcher`, so draw calls stay per chunk × material.

- [x] Remove the full-height glass `batch.add` (the `lot.floors > 1` block).
- [x] **Floor slabs and ledges:** a thin box (0.15 m tall, 0.25 m deep) at every floor line on the front wall for `concrete-band`, every other floor for `plaster-grid`. _0.32 × 0.35 m on concrete bands, 0.14 × 0.12 m elsewhere, every floor except on glass towers._
- [x] **Balconies:** for residential and tower, per bay and per floor with probability by style. A slab (bay × 0.12 × 1.2 m) plus a railing (a glass panel or three thin bars). Use the same RNG seed per lot, so it's stable. _Slab plus a glass rail, on 70% of bays for concrete bands and 45% for others, aligned to the shader's bays._
- [~] **Roof:** a parapet (0.9 m tall, 0.2 m thick) on all four edges. Keep the water tank (`caixa d'água`), but use the Poly Haven or cylinder model from Phase 8. Add an AC unit or two (small boxes) on lower roofs, and an elevator machine room (box) on towers. _Parapet and roof slab (`roof-concrete`), a blue fiberglass water tank (cylinder) and a lift machine room on towers. No AC units on roofs yet._
- [~] **Ground floor of shops:** an awning in a random fabric color (keep, but tilt it about 12°), a sign box with an emissive panel, and a roller shutter. _Awning tilted 12.6° in one of five colors, a lit sign band (emissive, so bloom picks it up), and a tiled skirt on `tile-base`. No roller shutter (Phase 8)._
- [-] **Side walls:** for lots without a neighbour on one side (corner lots), apply the facade there too. Party walls stay plain. _Free: the shader draws windows on all four walls. Party walls are hidden by neighbours._
- [x] **Silhouette variety:** 30% of towers get a setback (top 3 floors 2 m narrower). 20% of residential get a pitched clay-tile roof instead of a flat roof. _30% of towers with 8+ floors put their top three floors in a narrower block (4 m narrower, 3 m shallower) with its own window grid, and get a parapet and roof slab on both levels; ledges, balconies and AC units stop at the terrace. 40% of houses get a 45° clay gable: a square box turned 45° along the ridge, whose top half is the roof and whose bottom half sits inside the walls. No water tank under a gable. Tested: gables exist and stepped towers add window walls._
- [x] **AC units on walls (Brazilian look):** small boxes under some windows on residential and tower fronts. _Split units under 18% of windows on homes and towers._
- [~] Budget check: count instances per chunk before and after. Expected: draw calls ≤ 400. If over, merge ledges and parapets into the wall box with the shader from 6.2, not geometry. _7,055 → 12,568 instances. The number of batches (draw calls) barely grows, because the new pieces reuse existing finishes. Not measured on GPU._
- [x] Colliders don't change (still one box per lot). Balconies and awnings stay without colliders.
- [~] Manual: drive through the town and the coast avenue. Buildings read as floors and windows from 200 m. No z-fighting between ledges and walls (use a 2 cm offset). _Seen in a headless screenshot (low shadows, effects off): the shaders compile, brick and plaster walls get framed windows in whole bays, and shops get storefronts. Glass at grazing angles reflects the sky and reads lighter than intended. Not driven through, and the coast avenue was not checked._

### Task 6.4: Far LOD

- [x] The `lod: 'far'` box uses the same window shader, without relief geometry, so buildings don't change look at the LOD switch. _Both LOD boxes carry the same facade data._
- [ ] Manual: drive away from a tower. Expected: no visible pop at the LOD distance.

### Task 6.5: Kenney houses

**Files:** Modify `src/content/map.ts` (the `house-*.glb` placements)

- [x] The Kenney houses are a stylized low-poly kit and won't match. Replace them with procedural `brick-raw` and `plaster-grid` houses from the same generator (2 floors, pitched roof), or with the Sketchfab houses from Phase 9. _They were never placed: `testMap.buildings` was defined and validated but nothing read it. Removed the entries, the schema field and the five GLBs (628 KB)._
- [x] Remove `public/assets/buildings/` and its entry in `docs/ASSETS.md` and `CREDITS.txt` once nothing references it.

---

## Phase 7 — Poly Haven materials (`feat/polyhaven-materials`)

**Source:** `tmp/assets-src/polyhaven/textures/*` and `hdris/*`, chosen in `tmp/assets-src/polyhaven/MANIFEST.md`. The asset per slot is listed in the [Poly Haven asset map](#poly-haven-asset-map) at the end of this file.

### Task 7.1: Texture pipeline

**Files:** Create `scripts/optimize-textures.mjs`. Modify `docs/ASSETS.md`, `.gitattributes`

- [~] Script: for each slot, read `diff`, `nor_gl`, `rough` and `ao` (or `arm`) 2K JPG. Pack `ao`, `rough` and metal into one ORM texture. Output `color.ktx2` (sRGB, UASTC or ETC1S at quality 128), `normal.ktx2` (UASTC, linear) and `orm.ktx2` (linear) to `public/assets/textures/<slot>/`. Also output 1K versions under `public/assets/textures/<slot>/1k/` for the low preset. _First pass: `scripts/import-polyhaven.mjs` (with `sharp`, now a devDependency) writes 1K JPGs: color, normal, roughness and ao, with no ORM packing and no KTX2, because neither `toktx` nor `basisu` is installed. That is about 250 MB of video memory for 13 surfaces (was 134 MB). KTX2 would cut it about 4×. Grass stays ambientCG Grass001, because Poly Haven's `leafy_grass` is a dry, leaf-strewn lawn. Sand uses `sand_01` (1.5 m); `aerial_beach_01` is a 30 m aerial capture. Plaster is desaturated and lifted to a mean of 210 so the building tint still sets the color._
  - Tooling: `npx @gltf-transform/cli` doesn't do standalone images. Use `toktx` (KTX-Software) or `basisu`. Document the install in `docs/ASSETS.md`.
- [-] Add `*.ktx2 filter=lfs diff=lfs merge=lfs -text` and the same for `*.jpg` and `*.png` to `.gitattributes`. _Not yet. Textures stay in normal git like the existing ones. Decide together with KTX2._
- [x] Run the script once and commit the outputs through LFS. _Committed to normal git._

### Task 7.2: `MaterialLibrary` reads KTX2 and ORM

**Files:** Modify `src/engine/render/materials/material-library.ts`, `src/engine/render/three-renderer.ts`. Test `src/tests/uv-meters.test.ts` (tile sizes)

- [-] Use `KTX2Loader` (`three/addons/loaders/KTX2Loader.js`) with the transcoder from `three/examples/jsm/libs/basis/`. Copy it to `public/basis/` in a Vite plugin or as a static copy. Call `detectSupport(renderer)` once. _Waiting on KTX2._
- [-] Map `orm` to `aoMap`, `roughnessMap` and `metalnessMap` (one texture). Keep the old JPG path as a fallback when the `.ktx2` 404s. _Waiting on KTX2 and ORM packing._
- [-] Choose 2K or 1K by the Sharpness setting (`low` → 1K). _Only 1K ships for now._
- [x] Add the new finishes to `SurfaceFinish` and `TILE_METERS`, with real-world tile sizes from the Poly Haven info (`dimensions`): _`TILE_METERS` now uses each scan's real size from Poly Haven `info.json`._
  - [x] `asphalt`, `curb` (was `concrete`), `sidewalk`, `sand`, `grass`, `rock` (hills), `dirt` (empty lots), `plaza` _The curb keeps its old name, `concrete`._
  - [x] Wall finishes `plaster`, `concrete-raw`, `brick`, `tile`, `roof-concrete`, `roof-clay` _`plaster` keeps its old name, `paint`._
- [ ] Map facade styles (6.1) to wall finishes. _The finishes exist. The mapping is part of Phase 6.1._
- [~] Add detail breakup on large surfaces: in the world-UV shader in `three-renderer.ts`, sample the color map a second time at 0.13× scale and multiply, to kill visible tiling on roads and sand. _Done on the terrain only (a slow brightness swell). Roads still tile._
- [ ] Manual: no visible tiling from 50 m. Normal maps read correctly, with bumps lit from the sun side (if inverted, the map is DirectX; use `nor_gl`). _Needs real hardware._

### Task 7.3: Terrain

**Files:** Modify `src/engine/render/three-renderer.ts` (`addTerrain`), `src/content/map/island-shape.ts`

- [x] The terrain today is vertex colors only. Give it a splat material: `grass`, `rock`, `sand` and `dirt` blended by the existing vertex color channels (or by slope and height computed in the shader), each with world UV and its own tile size. _`materials/terrain-material.ts`: sand, paved (`roof-concrete`), rock and grass blended by a new `splat` vertex attribute from `terrainSplat()` in `island-shape.ts`, with rock on slopes steeper than ~35° in the shader. Falls back to vertex colors if a texture fails to load. Tested: the weights sum to 1, the town floor is paved and the shoreline is sand._
- [ ] Manual: hills show rock on steep slopes and grass on gentle ones, and the beach blends into grass without a hard line. _Paved town confirmed in a headless screenshot. Hills not checked yet._

### Task 7.4: HDRI

- [x] Copy the chosen day HDRI (2K `.hdr`) to `public/assets/hdri/`. Update `COAST_HDRI_URL`, `HDRI_SUN` and `HORIZON_COLOR` (Task 5.3). _Done in Task 5.3. Added here: `SKY_FILL` = 1.5 (`scene.environmentIntensity`), because the clouded sky is ~30% dimmer, and walls in shade went nearly black without it._
- [x] Keep the sunset and night HDRIs in `tmp/` until time of day exists.

### Task 7.5: Water

- [-] Poly Haven has no ocean material. Replace the flat metallic water with `three/addons/objects/Water.js`, using a normal map from a Poly Haven water texture if the manifest has one, otherwise the three.js example `waternormals.jpg` (MIT). Set the sun direction from `sun-controller`. _Not `Water.js`: it re-renders the scene for reflections, doubling the cost. Instead, `materials/water-material.ts` is a `MeshPhysicalMaterial` (teal, no metalness, low roughness) with two wave layers that drift across each other: a normal map at 9 m and a clearcoat normal map at 23 m. The sky reflects from the env map, strongest at low angles. The tileable wave normal map comes from `scripts/make-water-normal.mjs` (sum of whole-number-frequency sines, seeded). Not seen rendered._

---

## Phase 8 — Poly Haven props (`feat/polyhaven-props`)

**Source:** `tmp/assets-src/polyhaven/models/*`. **Depends on:** Phase 7 (KTX2 loader).

### Task 8.1: Model pipeline

**Files:** Create `scripts/optimize-models.mjs`

- [~] For each model: `gltf-transform optimize in.gltf out.glb --compress meshopt --texture-compress ktx2 --texture-size 1024`. _`scripts/import-polyhaven-models.mjs` with `@gltf-transform/cli` 4.5.1 (devDependency): meshopt plus **WebP** 1K textures. KTX2 needs `toktx`, which is not installed. Total 4.7 MB for 11 props._
- [x] For models flagged "needs decimation" in the manifest, add `--simplify --simplify-ratio <r>` until they're under 10k triangles (street props) or 25k (trees). _All under 11k triangles: lamp 7.7k, bench 10.9k, crate 10.4k, hydrant 3.4k (from 86k), barrier 4k, shrub 5.3k, trash 4.2k, utility box 6.3k, planter 8.1k, potted plant 8.9k, fern 6.2k._
- [x] Output to `public/assets/props/<slot>.glb`. _Named by use (`street-lamp.glb`, ...). Tracked by LFS through the existing `*.glb` rule._
- [~] `GLTFLoader` in `three-renderer.ts`: `setMeshoptDecoder(MeshoptDecoder)` and `setKTX2Loader(ktx2)`. _`setMeshoptDecoder` only; no KTX2._

### Task 8.2: Instanced glTF props

**Files:** Modify `src/engine/render/renderer.ts`, `src/engine/render/three-renderer.ts`, `src/content/map/batch.ts`

- [x] Add `addModelInstances({ url, matrices, count, castShadow })`. Load the glTF, and for each mesh in it create one `InstancedMesh` sharing the geometry and material, with the node's local transform baked into each instance matrix. _Every copy shares the cached geometry and material. One `InstancedMesh` per mesh in the glTF, grouped so `setMeshVisible` toggles the whole batch._
- [x] Add a `Stamp` variant `{ kind: 'model', url }` so `CityBatcher` groups prop stamps per chunk and URL, exactly like boxes. Chunk visibility streaming (`stream-city.ts`) keeps working. _`kind: 'model'` plus `model` url, and `PROPS` / `PROP_MODELS` in `props.ts`. `bootstrap` preloads all of them._
- [x] Test (`city.test.ts`): `build()` groups model stamps per chunk and URL, and counts match the number of lamps and benches placed. _In `facades.test.ts`: lamps exist, model groups are unique per chunk, url and LOD, and every url is preloaded._

### Task 8.3: Replace placeholder props

**Files:** Modify `src/content/map/props.ts`, `src/content/map/facades.ts`

- [~] `addLamp` → Poly Haven street lamp model. Keep the emissive head as a separate small stamp, so bloom picks it up. _Scaled 1.2× to ~4.6 m. The emissive head was dropped: the model has its own lantern, and there is no night yet._
- [~] Trash cans every ~30 m on avenue sidewalks, next to shop doors. _The existing 10% roll per slot now places the model (0.8×). Not added next to shop doors._
- [x] Benches in plazas and at bus stops (`kind: 'stop'` POIs). _The avenue benches use the model, and each bus stop is now a shelter (glass back, steel sides, red roof, the bench, a sign pole) instead of a solid concrete box. Market stalls are a table on legs under a tilted canvas, with produce and the crates. Not added in plazas._
- [~] Fire hydrants every ~80 m. Manhole covers on asphalt every ~40 m, as a flat decal box with the model's texture or the model itself. _Hydrants every 84 m on the side without lamps. No manhole covers._
- [~] Utility boxes on corners. Concrete barriers at road ends and on the coast road edge. _A controller cabinet beside each traffic light. No barriers._
- [ ] Chain-link fence around empty lots (dirt). _Needs decimation (89k triangles) and empty lots, which do not exist yet._
- [-] Roller-shutter door and window on shop ground floors (if 6.2 doesn't already fake them in the shader). _The facade shader already draws shopfronts. Shutters can come later as a shader variant._
- [~] Planters and potted plants in plazas and in front of shops. Plastic crates by market stalls (`kind: 'stall'`). _Four planters per plaza, ten shrubs or ferns along each lawn, and three crates by each stall (own RNG stream, so parked cars and trees keep their places). No potted plants at shop doors._
- [x] Water tank on roofs (6.3): use a cylinder with the `plaster` finish, or a model if the manifest has one. _Done in 6.3 as a blue cylinder._
- [-] Keep each prop's existing collider. Add box colliders for benches, barriers and utility boxes (`BoxCollider` in `props.ts`). _Left out on purpose: pedestrians test against tall boxes near them, and solid benches and bins on the sidewalk could leave them stuck. Needs a pass with the crowd AI. Before this, the bus stop was a solid box with no collider, so nothing regressed._
- [x] Parked cars: stop drawing two boxes. Spawn instanced copies of `car.glb` with the six traffic tints. Either add `addModelInstances` support for per-instance color, or reuse `addModel` with a cap of 40 parked cars per chunk. _Instanced `car.glb` (the traffic body) through `addModelInstances`, with a new per-instance `paint` that only reaches metallic, non-wheel meshes, on a white copy of the paint so each color shows true. Only models in `PAINTED_MODELS` (the car) get it, so the black lamp metal keeps its color. The same RNG draws as before, so cars and colliders stay put._
- [ ] Budget check, as in 6.3.
- [~] Manual: a street at eye level has lamps, bins, hydrants and benches at believable spacing, with no floating props on slopes (use `sampleHeight`). _Seen in a headless screenshot: the lamp model renders in place. Not checked at eye level._

---

## Phase 9 — Vegetation and Brazilian buildings (`feat/vegetation-brazil`)

**Depends on:** Phase 8 (instanced models). **Ask first:** CC-BY attribution is OK (see open decisions).

### Task 9.1: Trees

- [x] Replace `addTree` (trunk plus flat disc) with instanced models. _Same two RNG draws as before, so parked cars and benches keep their places._
  - [x] Street trees: Poly Haven broadleaf or jacaranda from the manifest, decimated to ≤ 25k triangles. Its foliage material needs `alphaTest: 0.5`, `side: DoubleSide`, and to cast shadows. _`island_tree_02` simplified from 1.07M to 16k triangles (`keep 0.015`, error 0.05), 1.35 MB, scaled 1.3–1.75× to 4.5–6 m. Blended prop materials are switched to `alphaTest 0.5` at load, because instanced leaves cannot be sorted. Seen in a screenshot: the foliage survives the simplification._
  - [~] Palms on the coast avenue and the beach. Poly Haven has none, so use a CC-BY Sketchfab palm: "Realistic Palm Tree Low Poly" (about 6k triangles) or "Palm tree Low Poly game ready" (about 1.2k). Download the glTF, put it in `tmp/assets-src/sketchfab/`, run it through `scripts/optimize-models.mjs`, and record the author and URL in `public/assets/CREDITS.txt` and `docs/ASSETS.md`. _No Sketchfab download (it needs a login). Instead, a procedural palm: a leaning, tapering three-segment trunk plus two Poly Haven `fern_02` crowns at 2.7–3.2×, offset for the fern's off-center origin. On every coast slot and 40% of others. Reads as a palm in the screenshot. A real palm model would be better._
  - [~] Shrubs from Poly Haven along plazas and house fronts. _In plazas (Phase 8). Not along house fronts._
- [x] Random yaw and ±15% scale per instance from the lot RNG.
- [-] Far LOD: a 2-quad billboard (impostor) per species beyond 150 m. Render one from the model at build time with an offscreen render target, or skip if distance culling plus fog is enough within budget. _Not needed yet: trees are `always` LOD and instanced, at 16k triangles each. Revisit if FPS on real hardware says so._
- [ ] Ground cover: instanced grass-clump quads in plazas and lawns near the camera only (≤ 30 m, re-scattered as the camera moves), with fade-out by distance.

### Task 9.2: Brazilian houses (optional, after 6.5)

- [ ] Inspect the CC-BY candidates from the review: "Favela brasileira" (780 faces), "Modular Slums" (17k), "Brazil House Low Poly", "Colonial House". Keep only ones that match the PBR look after Phase 7. Skip the NC-licensed ones ("Favela House", "brazilian_House01", "Brazillian_Market01") and "Max Payne_favelas" (likely a game rip).
- [ ] Place them on hill zones (`zoneAt(...)`) as an informal neighbourhood with stepped placement on slope, through `addModelInstances`. Each gets a box collider from its bounding box.
- [ ] Credits in `CREDITS.txt` and `docs/ASSETS.md`.

---

## Phase 10 — Docs, licensing and close-out (`docs/review-closeout`)

### Task 10.1: `docs/DECISIONS.md` is stale

- [x] ADR-4 ("no glTF") → superseded: models load through `GLTFLoader`, with the Poly Haven and KTX2 pipeline.
- [x] ADR-6 ("two prototypes `house`, `block`") → superseded by the facade styles from Phase 6.
- [x] ADR-11 ("no shadows") → superseded by CSM from Phase 5.
- [x] ADR-2 and ADR-3: controls are arrows (move), A (jump), D (punch), W (interact) and S (sprint/heavy), per `browser-input.ts:148-162`. Update the text.
- [x] New ADRs: post-processing stack (5.1), window shader choice (6.2), KTX2 and texture budget (7.1). _ADR-12 post-processing, ADR-13 textures (1K JPG/WebP, KTX2 pending), ADR-14 terrain splat, ADR-15 room state by proximity, ADR-16 server limits. The facade shader went into ADR-6 and camera occlusion into ADR-2. ADR-5 was stale too: audio is synthesized, not silent._

### Task 10.2: `docs/ASSETS.md` and `CREDITS.txt`

- [x] One table per type listing every Poly Haven asset in `public/` (name, URL, CC0), plus the Sketchfab CC-BY assets with author. _All the Poly Haven textures and props, with triangle counts. No Sketchfab assets were added._
- [x] Remove anything no longer shipped: Kenney houses, and the old ambientCG textures if all of them were replaced. _The old ambientCG textures that were replaced are gone from `ASSETS.md`; Grass001 stays. The Kenney houses are still placed (Task 6.5), so they stay._

### Task 10.3: Car licenses

- [ ] If the game is commercial (open decision): replace `aston-dbr1.glb` (CC BY-NC-SA) and the four unlicensed Sketchfab cars with CC0 or CC-BY cars, or with paid royalty-free models. Rename them to fictional brands. Update `src/content/cars.ts`, `validate-vehicle.ts` runs and `cars.test.ts`.
- [ ] If not commercial: write the license and source of each of the four cars in `docs/ASSETS.md`, so there's a record.

### Task 10.4: Final pass

- [ ] Full manual run with `pnpm play`, two tabs in one room, all quality presets. Record FPS and draw calls per preset in `docs/ARCHITECTURE.md`.
- [ ] Before/after screenshots from the same five viewpoints (spawn, coast avenue, plaza, hill, beach) in the PR description of each graphics phase.

---

## Poly Haven asset map

Downloaded on 2026-10-22 to `tmp/assets-src/polyhaven/<type>/<slot>/<id>/`: 317.5 MB, all CC0. Full details, including real triangle counts, are in `tmp/assets-src/polyhaven/MANIFEST.md`. The API's `polycount` is often wrong, so use the manifest numbers. Textures are 2K JPG with `diff`, `nor_gl`, `rough` and `ao`. Models are glTF with 1K textures.

**Textures (Phase 7).** Folder `textures/<slot>/`.

| Map element         | Finish          | Slot                 | Poly Haven id                            | Alternate                   |
| ------------------- | --------------- | -------------------- | ---------------------------------------- | --------------------------- |
| Road                | `asphalt`       | `asphalt_road`       | `asphalt_02`                             | –                           |
| Curb                | `curb`          | `road_curb_concrete` | `brushed_concrete`                       | –                           |
| Sidewalk            | `sidewalk`      | `sidewalk_paving`    | `large_square_pattern_01`                | `hexagonal_concrete_paving` |
| Beach               | `sand`          | `beach_sand`         | `aerial_beach_01`                        | `sand_01`                   |
| Lawn, plazas        | `grass`         | `grass_lawn`         | `leafy_grass` (may need more saturation) | –                           |
| Hills               | `rock`          | `hill_rock_terrain`  | `coast_sand_rocks_02`                    | `forrest_ground_01`         |
| Empty lots          | `dirt`          | `dirt_empty_lot`     | `red_laterite_soil_stones`               | –                           |
| Plaza paving        | `plaza`         | `plaza_paving`       | `pavement_02`                            | –                           |
| Walls, plaster      | `plaster`       | `wall_plaster`       | `beige_wall_001`                         | –                           |
| Walls, raw concrete | `concrete-raw`  | `wall_concrete_raw`  | `concrete`                               | –                           |
| Walls, brick        | `brick`         | `wall_brick_red`     | `red_brick`                              | –                           |
| Shop base tiles     | `tile`          | `wall_ceramic_tiles` | `floor_tiles_08`                         | –                           |
| Flat roof           | `roof-concrete` | `roof_flat_concrete` | `concrete_floor_worn_001`                | –                           |
| Pitched roof        | `roof-clay`     | `roof_clay_tiles`    | `clay_roof_tiles_02`                     | –                           |

**HDRIs (Tasks 5.3 and 7.4).** Folder `hdris/<slot>/`, 2K `.hdr`.

| Use             | Slot         | Poly Haven id                                                                                        |
| --------------- | ------------ | ---------------------------------------------------------------------------------------------------- |
| Day (ship this) | `sky_day`    | `kloofendal_48d_partly_cloudy_puresky`. The current `kloofendal_43d_clear_puresky` is the alternate. |
| Sunset (later)  | `sky_sunset` | `kloppenheim_06_puresky`                                                                             |
| Night (later)   | `sky_night`  | `kloppenheim_02_puresky`                                                                             |

**Models (Phases 6, 8 and 9).** Folder `models/<slot>/`. Triangle counts are measured.

| Prop                  | Slot                   | Poly Haven id (triangles)                                                    | Alternate                     | Pipeline note                                                                               |
| --------------------- | ---------------------- | ---------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| Street lamp           | `street_lamp`          | `street_lamp_01` (31k)                                                       | `street_lamp_02` (20k)        | Simplify to ≤ 10k                                                                           |
| Trash can             | `trash_can`            | `metal_trash_can` (14k)                                                      | –                             | Simplify to ≤ 5k                                                                            |
| Bench                 | `bench`                | `modular_street_seating` (25k)                                               | –                             | Simplify to ≤ 8k                                                                            |
| Fire hydrant          | `fire_hydrant`         | `fire_hydrant` (86k)                                                         | –                             | Must decimate, to ≤ 3k                                                                      |
| Manhole cover         | `manhole_cover`        | `water_manhole_cover` (6k)                                                   | –                             | Or bake to a decal                                                                          |
| Utility box           | `utility_box`          | `utility_box_02` (6k)                                                        | `utility_box_01` (4k)         | OK                                                                                          |
| Road barrier          | `concrete_barrier`     | `concrete_road_barrier_02` (24k)                                             | `concrete_road_barrier` (61k) | Simplify to ≤ 4k                                                                            |
| Chain-link fence      | `chainlink_fence`      | `modular_chainlink_fence` (89k)                                              | –                             | Must decimate, or use an alpha-mesh texture on quads                                        |
| Roller-shutter door   | `rollershutter_door`   | `rollershutter_door` (1.1k)                                                  | –                             | OK                                                                                          |
| Roller-shutter window | `rollershutter_window` | `rollershutter_window_01` (1.1k)                                             | `_02`                         | OK                                                                                          |
| Facade pieces         | `facade_modular`       | `modular_urban_apartments_facade` (270k), `modular_fire_escape` (11k)        | –                             | Reference for 6.3 and texture source. Too heavy to instance as is.                          |
| Planter box           | `planter_box`          | `planter_box_01` (8k)                                                        | –                             | OK                                                                                          |
| Crates                | `plastic_crates`       | `plastic_crate_01` (18k)                                                     | `plastic_crate_03` (22k)      | Simplify to ≤ 2k                                                                            |
| Potted plant          | `potted_plant`         | `potted_plant_02` (70k)                                                      | `potted_plant_04` (9k)        | Use the alternate                                                                           |
| Shrubs                | `shrub`                | `shrub_04` (27k), `calathea_orbifolia_01` (17k), `anthurium_botany_01` (67k) | –                             | Simplify each to ≤ 5k                                                                       |
| Street tree           | `street_tree`          | `island_tree_02` (1.07M)                                                     | –                             | Too heavy. Impostor bake only, or replace (Task 9.1). `jacaranda_tree` (3.86M) was deleted. |
| Tropical plant        | `tropical_plant`       | `pachira_aquatica_01` (77k)                                                  | `fern_02` (6k)                | Use the alternate, or decimate                                                              |

**Gaps Poly Haven cannot fill:**

- **Palms:** none on Poly Haven. Use a CC-BY Sketchfab palm (Task 9.1), Quaternius or Kenney CC0 low-poly palms, or a procedural trunk with instanced frond cards.
- **Portuguese mosaic sidewalk (calçada):** none exists. Draw it procedurally over the `large_square_pattern_01` normal and roughness maps.
- **Clean lawn:** none exists. Use `leafy_grass` with more saturation.
- **Street tree:** none under ~1M triangles (see above).

## Suggested order and size

| Phase                  | Depends on | Size |
| ---------------------- | ---------- | ---- |
| 0 Tooling              | —          | S    |
| 1 Client lifecycle     | 0          | M    |
| 2 Server hardening     | 0          | M    |
| 3 Net bandwidth        | 2          | M    |
| 4 Shared sim / split   | 2, 3       | L    |
| 5 Post-FX and shadows  | 0          | M    |
| 6 Facades              | 5          | L    |
| 7 Poly Haven materials | 5          | M–L  |
| 8 Poly Haven props     | 7          | L    |
| 9 Vegetation / Brazil  | 8          | M    |
| 10 Docs and licensing  | all        | S    |

Phases 1, 2 and 5 can run in parallel in separate worktrees. On the graphics side, 6 and 7 can run in parallel after 5. They touch different files, except `three-renderer.ts`, so merge 7 first.
