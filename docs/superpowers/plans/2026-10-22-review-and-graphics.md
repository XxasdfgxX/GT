# 2026-10-22 review: bug fixes and graphics overhaul — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

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

- [ ] Turn the probe from the review into `src/tests/net-size.test.ts`. Build a room with 16 players, the full crowd and traffic, encode one state, and assert the size is below a threshold. Start with the current size so the test passes, then lower it in 3.2 and 3.3.

### Task 3.2: Quantize

**Files:** Modify `src/net/room.ts` (encode, ~601-649), `src/net/protocol.ts`

- [ ] Round positions to 0.01 m and yaw to 0.001 rad before `JSON.stringify` (e.g. `Math.round(x * 100) / 100`).
- [ ] Expected: the size drops at least 40%. Update the threshold.

### Task 3.3: Send only what changed

- [ ] Per member, remember the last sent NPC and car poses. Send only entries that moved more than 2 cm or turned more than 0.01 rad, plus a full snapshot every 2 s.
- [ ] The client keeps the last known pose for entries missing from a delta (`applyNetState`).
- [ ] Test: in a static scene, the second message after a full one has no NPC entries.
- [ ] Expected: under 4 KB per tick in a typical room.

---

## Phase 4 — Shared simulation, split god files (`refactor/shared-sim`)

**Depends on:** Phases 2 and 3 (they touch `room.ts`).

### Task 4.1: Pure road and traffic rules in one place

**Files:** Create `src/sim/traffic-rules.ts`. Modify `src/game/systems/traffic.ts`, `src/net/room.ts`

- [ ] Move `pickNext` (turn filter, Task 3.9 of the previous plan), traffic-light state, `laneOffset` and parking-on-road into `src/sim/`, with no ECS and no Three imports.
- [ ] `room.ts` replaces `pickExit` (~1228) and `parkOnRoad` (~963) with the shared ones. Server cars stop taking random U-turns and start obeying lights.
- [ ] `room.ts` must no longer import from `src/game/systems/*`. Add that rule to the architecture test in `src/tests`.

### Task 4.2: Split `room.ts` (1,261 lines)

- [ ] Into `src/net/room/roster.ts` (join, leave, poses), `combat.ts` (punch, ram, death, drops), `npc.ts`, `traffic.ts` and `encode.ts`, with `room/index.ts` re-exporting the current API.
- [ ] No behaviour change. `multiplayer.test.ts` and `server-limits.test.ts` must pass unchanged.

### Task 4.3: Split `traffic.ts` (794) and `pedestrians.ts` (653) by mode

- [ ] `traffic.ts` → `lane-driving.ts`, `stolen-car.ts`, `wrecks.ts`, `unstick.ts`. Audio calls stay in one place.
- [ ] `pedestrians.ts` → `ped-ai.ts` (already exists, extend it), `shove.ts`, `ramming.ts`, `ped-combat.ts`.
- [ ] No behaviour change. `traffic-peds.test.ts`, `traffic-ai.test.ts` and `ped-ai.test.ts` pass unchanged.

### Task 4.4: Tests for the multiplayer glue

- [ ] `src/tests/net-systems.test.ts`: `applyNetState` (spawn, move and remove remotes), `publishNet`, mount and dismount in `net-ride.ts`, and `seat.ts`.
- [ ] `src/tests/server-dispatch.test.ts`: extract the `connection` handler body from `server/index.ts` into `src/net/dispatch.ts` and test unknown room, room full, bucket close and per-IP cap with fake sockets.

---

## Phase 5 — Lighting and post-processing (`feat/post-fx`)

This phase gives the biggest visual gain for the least effort, and every later phase builds on it. **Independent of Phases 1–4.**

### Task 5.1: Effect composer

**Files:** Modify `src/engine/render/three-renderer.ts`, `src/engine/render/display.ts`, `src/ui/settings.ts`. Add dependency `n8ao`

- [ ] `pnpm add n8ao`. Check that its peer range accepts three 0.186 and needs WebGL2, which is already the default.
- [ ] Add a setting `effects: 'off' | 'medium' | 'high'` to the settings schema (`src/ui/settings.ts`), the settings menu and `setGraphics`. Default `'high'`.
- [ ] Create the `WebGLRenderer` with `antialias: canvasAntialias(effects !== 'off')`. Changing `effects` across off/on needs a restart. Say so in the menu, as for other context-level options.
- [ ] Build an `EffectComposer` from `postprocessing` with a `RenderPass`, an `N8AOPostPass` (half-res on `'medium'`, full on `'high'`; radius about 2 m, intensity about 2.5, `distanceFalloff` about 1) and an `EffectPass` with `SMAAEffect`, `BloomEffect` (`luminanceThreshold` 0.9, intensity 0.4, mipmap blur) and `ToneMappingEffect`.
- [ ] With the composer on, set `renderer.toneMapping = NoToneMapping` and let the effect do it. Try `AgX` and `ACES_FILMIC` and keep the one that looks better with the HDRI.
- [ ] `render()` calls `composer.render(dt)` when on, `renderer.render` when off. `setSize` calls `composer.setSize`. `dispose` calls `composer.dispose()`.
- [ ] Manual: compare screenshots. Expected: contact shadows under cars, curbs and building bases, no jagged edges, lamps glow. FPS within budget at `'high'`.

### Task 5.2: Shadows that reach the horizon

**Files:** Modify `src/engine/render/sun-controller.ts`, `src/engine/render/three-renderer.ts`

- [ ] Replace the single 36 m shadow frustum with cascaded shadows using `three/addons/csm/CSM.js`: 3 cascades, `maxFar` 250 m, practical split mode, `lightMargin` 100.
- [ ] CSM patches materials. Call `csm.setupMaterial(material)` for every `MeshStandardMaterial` created in `three-renderer.ts`, `material-library.ts` and glTF loads. Keep the texel snapping from `sun-math.ts` only if CSM shimmer is visible.
- [ ] On Shadows "low", use 2 cascades at 1024. On "off", disable CSM.
- [ ] Let buildings (`lod: 'far'` included) and tree canopies cast shadows: set `castShadow: true` in `facades.ts` and `props.ts`.
- [ ] Manual: drive along the coast avenue. Tower shadows reach across the street 100 m away, with no visible pop at cascade boundaries.

### Task 5.3: Environment and fog

**Files:** Modify `src/engine/render/environment.ts`, `src/engine/render/sky.ts`, `src/engine/render/three-renderer.ts`

- [ ] Use the HDRI picked in `tmp/assets-src/polyhaven/MANIFEST.md` (Phase 7 copies it in). Update `HDRI_SUN` and `HORIZON_COLOR` by sampling the new image. `sun.test.ts` and `sky.test.ts` must be updated to match.
- [ ] Set `scene.backgroundBlurriness = 0` and `scene.environmentIntensity = 1`. Lower the hemisphere and ambient lights further if AO makes the result look washed out.
- [ ] Replace linear `Fog(520, 2400)` with `FogExp2` (density about 0.00035) for a softer haze over the sea.
- [ ] `setTimeOfDay` is wired but never called. Either drop it from `Renderer` (and from `sun-controller.ts`), or add a debug key to cycle it and swap to the sunset or night HDRIs downloaded in Phase 7. Recommended: drop it now, and add a follow-up issue.

### Task 5.4: Street lights that actually light

**Files:** Modify `src/engine/render/three-renderer.ts`, `src/content/map/props.ts`

- [ ] For the lamp heads already batched in `addLamp`, add a small pool (8–12) of `PointLight`s, or `SpotLight`s pointing down, with no shadows. Each frame, move the pool to the lamps nearest the camera. This is only worth it if a night time-of-day is kept from 5.3; otherwise skip and note it.

---

## Phase 6 — Real facades (`feat/facades`)

**Depends on:** Phase 5, so AO shows the relief. Goal: a 15-floor tower reads as 15 floors with windows, balconies and a rooftop. A shop reads as a shop.

### Task 6.1: Facade parameters per building

**Files:** Modify `src/content/map/blocks.ts` (`Footprint`), `src/content/map/batch.ts` (`Stamp`, `CityMesh`), `src/engine/render/renderer.ts` (`InstanceBatchDesc`), `src/engine/render/three-renderer.ts`

- [ ] Add a `style` to `Footprint`, picked by `kind` and `rng`. Use about 6 styles: `plaster-grid` (residential), `concrete-band` (tower), `brick-raw` (house, cheap), `tile-base-plaster` (shop), `glass-curtain` (tower near the coast), `colonial` (plaza edge).
- [ ] Add an optional per-instance `Float32Array` attribute to stamps and batches: `facade: [baseY, floorHeight, bayWidth, styleIndex]`. The renderer uploads it as `InstancedBufferAttribute('facade', 4)`.
- [ ] Test (`city.test.ts`): every footprint gets a style. Style counts are within 10% of the target mix for the fixed seed.

### Task 6.2: Window shader spike (decides the open question)

**Files:** Create `src/engine/render/materials/facade-material.ts`

- [ ] Option A, `three-fenestra` (MIT): install it, apply it to one tower's walls, check that it works with `InstancedMesh`, CSM and the composer.
- [ ] Option B, custom `onBeforeCompile` on the paint material, in the same style as `worldMaterial` in `three-renderer.ts`:
  - [ ] Compute local facade coordinates from the world position and the `facade` attribute: floor index `(y - baseY) / floorHeight`, bay index along the wall.
  - [ ] Inside each bay, cut a window rectangle (about 60% × 55% of the bay).
  - [ ] Shade the window as dark reflective glass (low roughness, env reflection), plus a cheap interior: parallax back wall with a random tint per window from a hash of `(floor, bay, instanceId)`, with some windows lit at night.
  - [ ] Draw a thin floor band and a frame around the window with a slightly different tint.
  - [ ] Keep the ground floor different by style: shop glass with a roller shutter half-down for `tile-base-plaster`, a door and two windows for houses.
- [ ] Pick the option that holds 60 FPS with the full city in view and works with instancing. Record the choice in `docs/DECISIONS.md` (new ADR).

### Task 6.3: Geometry relief

**Files:** Modify `src/content/map/facades.ts`

Replace the single glass slab with real modules. All are boxes stamped through `CityBatcher`, so draw calls stay per chunk × material.

- [ ] Remove the full-height glass `batch.add` (the `lot.floors > 1` block).
- [ ] **Floor slabs and ledges:** a thin box (0.15 m tall, 0.25 m deep) at every floor line on the front wall for `concrete-band`, every other floor for `plaster-grid`.
- [ ] **Balconies:** for residential and tower, per bay and per floor with probability by style. A slab (bay × 0.12 × 1.2 m) plus a railing (a glass panel or three thin bars). Use the same RNG seed per lot, so it's stable.
- [ ] **Roof:** a parapet (0.9 m tall, 0.2 m thick) on all four edges. Keep the water tank (`caixa d'água`), but use the Poly Haven or cylinder model from Phase 8. Add an AC unit or two (small boxes) on lower roofs, and an elevator machine room (box) on towers.
- [ ] **Ground floor of shops:** an awning in a random fabric color (keep, but tilt it about 12°), a sign box with an emissive panel, and a roller shutter.
- [ ] **Side walls:** for lots without a neighbour on one side (corner lots), apply the facade there too. Party walls stay plain.
- [ ] **Silhouette variety:** 30% of towers get a setback (top 3 floors 2 m narrower). 20% of residential get a pitched clay-tile roof instead of a flat roof.
- [ ] **AC units on walls (Brazilian look):** small boxes under some windows on residential and tower fronts.
- [ ] Budget check: count instances per chunk before and after. Expected: draw calls ≤ 400. If over, merge ledges and parapets into the wall box with the shader from 6.2, not geometry.
- [ ] Colliders don't change (still one box per lot). Balconies and awnings stay without colliders.
- [ ] Manual: drive through the town and the coast avenue. Buildings read as floors and windows from 200 m. No z-fighting between ledges and walls (use a 2 cm offset).

### Task 6.4: Far LOD

- [ ] The `lod: 'far'` box uses the same window shader, without relief geometry, so buildings don't change look at the LOD switch.
- [ ] Manual: drive away from a tower. Expected: no visible pop at the LOD distance.

### Task 6.5: Kenney houses

**Files:** Modify `src/content/map.ts` (the `house-*.glb` placements)

- [ ] The Kenney houses are a stylized low-poly kit and won't match. Replace them with procedural `brick-raw` and `plaster-grid` houses from the same generator (2 floors, pitched roof), or with the Sketchfab houses from Phase 9.
- [ ] Remove `public/assets/buildings/` and its entry in `docs/ASSETS.md` and `CREDITS.txt` once nothing references it.

---

## Phase 7 — Poly Haven materials (`feat/polyhaven-materials`)

**Source:** `tmp/assets-src/polyhaven/textures/*` and `hdris/*`, chosen in `tmp/assets-src/polyhaven/MANIFEST.md`. The asset per slot is listed in the [Poly Haven asset map](#poly-haven-asset-map) at the end of this file.

### Task 7.1: Texture pipeline

**Files:** Create `scripts/optimize-textures.mjs`. Modify `docs/ASSETS.md`, `.gitattributes`

- [ ] Script: for each slot, read `diff`, `nor_gl`, `rough` and `ao` (or `arm`) 2K JPG. Pack `ao`, `rough` and metal into one ORM texture. Output `color.ktx2` (sRGB, UASTC or ETC1S at quality 128), `normal.ktx2` (UASTC, linear) and `orm.ktx2` (linear) to `public/assets/textures/<slot>/`. Also output 1K versions under `public/assets/textures/<slot>/1k/` for the low preset.
  - Tooling: `npx @gltf-transform/cli` doesn't do standalone images. Use `toktx` (KTX-Software) or `basisu`. Document the install in `docs/ASSETS.md`.
- [ ] Add `*.ktx2 filter=lfs diff=lfs merge=lfs -text` and the same for `*.jpg` and `*.png` to `.gitattributes`.
- [ ] Run the script once and commit the outputs through LFS.

### Task 7.2: `MaterialLibrary` reads KTX2 and ORM

**Files:** Modify `src/engine/render/materials/material-library.ts`, `src/engine/render/three-renderer.ts`. Test `src/tests/uv-meters.test.ts` (tile sizes)

- [ ] Use `KTX2Loader` (`three/addons/loaders/KTX2Loader.js`) with the transcoder from `three/examples/jsm/libs/basis/`. Copy it to `public/basis/` in a Vite plugin or as a static copy. Call `detectSupport(renderer)` once.
- [ ] Map `orm` to `aoMap`, `roughnessMap` and `metalnessMap` (one texture). Keep the old JPG path as a fallback when the `.ktx2` 404s.
- [ ] Choose 2K or 1K by the Sharpness setting (`low` → 1K).
- [ ] Add the new finishes to `SurfaceFinish` and `TILE_METERS`, with real-world tile sizes from the Poly Haven info (`dimensions`):
  - [ ] `asphalt`, `curb` (was `concrete`), `sidewalk`, `sand`, `grass`, `rock` (hills), `dirt` (empty lots), `plaza`
  - [ ] Wall finishes `plaster`, `concrete-raw`, `brick`, `tile`, `roof-concrete`, `roof-clay`
- [ ] Map facade styles (6.1) to wall finishes.
- [ ] Add detail breakup on large surfaces: in the world-UV shader in `three-renderer.ts`, sample the color map a second time at 0.13× scale and multiply, to kill visible tiling on roads and sand.
- [ ] Manual: no visible tiling from 50 m. Normal maps read correctly, with bumps lit from the sun side (if inverted, the map is DirectX; use `nor_gl`).

### Task 7.3: Terrain

**Files:** Modify `src/engine/render/three-renderer.ts` (`addTerrain`), `src/content/map/island-shape.ts`

- [ ] The terrain today is vertex colors only. Give it a splat material: `grass`, `rock`, `sand` and `dirt` blended by the existing vertex color channels (or by slope and height computed in the shader), each with world UV and its own tile size.
- [ ] Manual: hills show rock on steep slopes and grass on gentle ones, and the beach blends into grass without a hard line.

### Task 7.4: HDRI

- [ ] Copy the chosen day HDRI (2K `.hdr`) to `public/assets/hdri/`. Update `COAST_HDRI_URL`, `HDRI_SUN` and `HORIZON_COLOR` (Task 5.3).
- [ ] Keep the sunset and night HDRIs in `tmp/` until time of day exists.

### Task 7.5: Water

- [ ] Poly Haven has no ocean material. Replace the flat metallic water with `three/addons/objects/Water.js`, using a normal map from a Poly Haven water texture if the manifest has one, otherwise the three.js example `waternormals.jpg` (MIT). Set the sun direction from `sun-controller`.

---

## Phase 8 — Poly Haven props (`feat/polyhaven-props`)

**Source:** `tmp/assets-src/polyhaven/models/*`. **Depends on:** Phase 7 (KTX2 loader).

### Task 8.1: Model pipeline

**Files:** Create `scripts/optimize-models.mjs`

- [ ] For each model: `gltf-transform optimize in.gltf out.glb --compress meshopt --texture-compress ktx2 --texture-size 1024`.
- [ ] For models flagged "needs decimation" in the manifest, add `--simplify --simplify-ratio <r>` until they're under 10k triangles (street props) or 25k (trees).
- [ ] Output to `public/assets/props/<slot>.glb`.
- [ ] `GLTFLoader` in `three-renderer.ts`: `setMeshoptDecoder(MeshoptDecoder)` and `setKTX2Loader(ktx2)`.

### Task 8.2: Instanced glTF props

**Files:** Modify `src/engine/render/renderer.ts`, `src/engine/render/three-renderer.ts`, `src/content/map/batch.ts`

- [ ] Add `addModelInstances({ url, matrices, count, castShadow })`. Load the glTF, and for each mesh in it create one `InstancedMesh` sharing the geometry and material, with the node's local transform baked into each instance matrix.
- [ ] Add a `Stamp` variant `{ kind: 'model', url }` so `CityBatcher` groups prop stamps per chunk and URL, exactly like boxes. Chunk visibility streaming (`stream-city.ts`) keeps working.
- [ ] Test (`city.test.ts`): `build()` groups model stamps per chunk and URL, and counts match the number of lamps and benches placed.

### Task 8.3: Replace placeholder props

**Files:** Modify `src/content/map/props.ts`, `src/content/map/facades.ts`

- [ ] `addLamp` → Poly Haven street lamp model. Keep the emissive head as a separate small stamp, so bloom picks it up.
- [ ] Trash cans every ~30 m on avenue sidewalks, next to shop doors.
- [ ] Benches in plazas and at bus stops (`kind: 'stop'` POIs).
- [ ] Fire hydrants every ~80 m. Manhole covers on asphalt every ~40 m, as a flat decal box with the model's texture or the model itself.
- [ ] Utility boxes on corners. Concrete barriers at road ends and on the coast road edge.
- [ ] Chain-link fence around empty lots (dirt).
- [ ] Roller-shutter door and window on shop ground floors (if 6.2 doesn't already fake them in the shader).
- [ ] Planters and potted plants in plazas and in front of shops. Plastic crates by market stalls (`kind: 'stall'`).
- [ ] Water tank on roofs (6.3): use a cylinder with the `plaster` finish, or a model if the manifest has one.
- [ ] Keep each prop's existing collider. Add box colliders for benches, barriers and utility boxes (`BoxCollider` in `props.ts`).
- [ ] Parked cars: stop drawing two boxes. Spawn instanced copies of `car.glb` with the six traffic tints. Either add `addModelInstances` support for per-instance color, or reuse `addModel` with a cap of 40 parked cars per chunk.
- [ ] Budget check, as in 6.3.
- [ ] Manual: a street at eye level has lamps, bins, hydrants and benches at believable spacing, with no floating props on slopes (use `sampleHeight`).

---

## Phase 9 — Vegetation and Brazilian buildings (`feat/vegetation-brazil`)

**Depends on:** Phase 8 (instanced models). **Ask first:** CC-BY attribution is OK (see open decisions).

### Task 9.1: Trees

- [ ] Replace `addTree` (trunk plus flat disc) with instanced models.
  - [ ] Street trees: Poly Haven broadleaf or jacaranda from the manifest, decimated to ≤ 25k triangles. Its foliage material needs `alphaTest: 0.5`, `side: DoubleSide`, and to cast shadows.
  - [ ] Palms on the coast avenue and the beach. Poly Haven has none, so use a CC-BY Sketchfab palm: "Realistic Palm Tree Low Poly" (about 6k triangles) or "Palm tree Low Poly game ready" (about 1.2k). Download the glTF, put it in `tmp/assets-src/sketchfab/`, run it through `scripts/optimize-models.mjs`, and record the author and URL in `public/assets/CREDITS.txt` and `docs/ASSETS.md`.
  - [ ] Shrubs from Poly Haven along plazas and house fronts.
- [ ] Random yaw and ±15% scale per instance from the lot RNG.
- [ ] Far LOD: a 2-quad billboard (impostor) per species beyond 150 m. Render one from the model at build time with an offscreen render target, or skip if distance culling plus fog is enough within budget.
- [ ] Ground cover: instanced grass-clump quads in plazas and lawns near the camera only (≤ 30 m, re-scattered as the camera moves), with fade-out by distance.

### Task 9.2: Brazilian houses (optional, after 6.5)

- [ ] Inspect the CC-BY candidates from the review: "Favela brasileira" (780 faces), "Modular Slums" (17k), "Brazil House Low Poly", "Colonial House". Keep only ones that match the PBR look after Phase 7. Skip the NC-licensed ones ("Favela House", "brazilian_House01", "Brazillian_Market01") and "Max Payne_favelas" (likely a game rip).
- [ ] Place them on hill zones (`zoneAt(...)`) as an informal neighbourhood with stepped placement on slope, through `addModelInstances`. Each gets a box collider from its bounding box.
- [ ] Credits in `CREDITS.txt` and `docs/ASSETS.md`.

---

## Phase 10 — Docs, licensing and close-out (`docs/review-closeout`)

### Task 10.1: `docs/DECISIONS.md` is stale

- [ ] ADR-4 ("no glTF") → superseded: models load through `GLTFLoader`, with the Poly Haven and KTX2 pipeline.
- [ ] ADR-6 ("two prototypes `house`, `block`") → superseded by the facade styles from Phase 6.
- [ ] ADR-11 ("no shadows") → superseded by CSM from Phase 5.
- [ ] ADR-2 and ADR-3: controls are arrows (move), A (jump), D (punch), W (interact) and S (sprint/heavy), per `browser-input.ts:148-162`. Update the text.
- [ ] New ADRs: post-processing stack (5.1), window shader choice (6.2), KTX2 and texture budget (7.1).

### Task 10.2: `docs/ASSETS.md` and `CREDITS.txt`

- [ ] One table per type listing every Poly Haven asset in `public/` (name, URL, CC0), plus the Sketchfab CC-BY assets with author.
- [ ] Remove anything no longer shipped: Kenney houses, and the old ambientCG textures if all of them were replaced.

### Task 10.3: Car licenses

- [ ] If the game is commercial (open decision): replace `aston-dbr1.glb` (CC BY-NC-SA) and the four unlicensed Sketchfab cars with CC0 or CC-BY cars, or with paid royalty-free models. Rename them to fictional brands. Update `src/content/cars.ts`, `validate-vehicle.ts` runs and `cars.test.ts`.
- [ ] If not commercial: write the license and source of each of the four cars in `docs/ASSETS.md`, so there's a record.

### Task 10.4: Final pass

- [ ] Full manual run with `pnpm play`, two tabs in one room, all quality presets. Record FPS and draw calls per preset in `docs/ARCHITECTURE.md`.
- [ ] Before/after screenshots from the same five viewpoints (spawn, coast avenue, plaza, hill, beach) in the PR description of each graphics phase.

---

## Poly Haven asset map

To be filled from `tmp/assets-src/polyhaven/MANIFEST.md`. One line per map element: Poly Haven id, the resolution shipped and which phase uses it.

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
