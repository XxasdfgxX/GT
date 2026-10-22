# Assets

## Iluminação

| Nome                                      | Uso                         | URL                                                          | Licença |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------ | ------- |
| kloofendal_48d_partly_cloudy_puresky (2k) | Céu e iluminação por imagem | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0     |

O arquivo está em `public/assets/hdri/kloofendal_48d_partly_cloudy_puresky_2k.hdr`. O `PMREMGenerator` gera o ambiente a partir dele. A névoa (exponencial) usa a cor do horizonte dessa imagem. O sol (`HDRI_SUN`) é o centróide dos pixels acima de metade do pico, e a cor do horizonte é a média linear da linha do equador convertida para sRGB.

## Superfícies

Texturas 1K JPG, repetidas em metros na escala real de cada scan (`TILE_METERS`). Mapas de cor em sRGB; normal, roughness e AO em linear. A faixa da pista é uma textura gerada no renderer, por cima do asfalto. `scripts/import-polyhaven.mjs` gera os mapas 1K a partir dos downloads 2K em `tmp/assets-src/polyhaven/` (fora do git).

| Pasta           | Uso                                                  | Fonte                                                      | Licença |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------------- | ------- |
| `asphalt`       | Asfalto (3 m)                                        | Poly Haven `asphalt_02`                                    | CC0     |
| `concrete`      | Meio-fio (2,5 m)                                     | Poly Haven `brushed_concrete`                              | CC0     |
| `sidewalk`      | Calçada em lajes (3 m)                               | Poly Haven `large_square_pattern_01`                       | CC0     |
| `sand`          | Areia (1,5 m)                                        | Poly Haven `sand_01`                                       | CC0     |
| `grass`         | Grama (2 m)                                          | ambientCG `Grass001` (os gramados do Poly Haven são secos) | CC0     |
| `plaster`       | Reboco tingido pela cor do prédio (3 m), dessaturado | Poly Haven `beige_wall_001`                                | CC0     |
| `plaza`         | Calçamento das praças (2,12 m)                       | Poly Haven `pavement_02`                                   | CC0     |
| `rock`          | Rocha das serras, no terreno (15 m)                  | Poly Haven `coast_sand_rocks_02`                           | CC0     |
| `dirt`          | Terra (2 m)                                          | Poly Haven `red_laterite_soil_stones`                      | CC0     |
| `brick`         | Tijolo à vista (1,4 m)                               | Poly Haven `red_brick`                                     | CC0     |
| `tile`          | Azulejo da base das lojas (1,5 m)                    | Poly Haven `floor_tiles_08`                                | CC0     |
| `concrete-raw`  | Concreto aparente (4 m)                              | Poly Haven `concrete`                                      | CC0     |
| `roof-concrete` | Laje do telhado e chão calçado do terreno (3 m)      | Poly Haven `concrete_floor_worn_001`                       | CC0     |
| `roof-clay`     | Telha de barro (2,5 m), ainda sem uso                | Poly Haven `clay_roof_tiles_02`                            | CC0     |
| `water`         | Ondas do mar (só normal)                             | Gerada por `scripts/make-water-normal.mjs`                 | —       |

Os arquivos estão em `public/assets/textures/<pasta>/`. As URLs do Poly Haven são `https://polyhaven.com/a/<id>`.

## Modelos

Os créditos completos estão em `public/assets/CREDITS.txt`.

- `character.glb` — Man in Suit, Quaternius, CC0, via poly.pizza. É o corpo do jogador e também um dos pedestres. Escala `0.37` porque o rig vem exportado a 100x. Animações: idle, walk, run, punch, jump.
- `people/*.glb` — Animated Men Pack e Animated Women Pack, Quaternius, CC0, https://poly.pizza/bundle/Animated-Men-Pack-DAC9SDgMQT e https://poly.pizza/bundle/Animated-Women-Pack-HHSKxnk1mY. O mesmo rig do jogador, na mesma escala: camiseta, camisa, manga comprida, regata, rua e vestido. As mulheres usam os clipes `Female_*`.
- `people/woman-leaf.glb` — Casual Green Leaf Look, restore50, CC BY 4.0, https://sketchfab.com/3d-models/casual-green-leaf-look-c8586ab08b6948d8ab0c6f0a4beb438b. Substitui a mulher casual. Malha estática, já em metros: escala `4.845 * 0.37 / 1.8983` e um lift para os pés, porque a origem fica na cintura. Sem clipe de sentar, então não dirige.
- `people/base-f.glb`, `base-m.glb` — Universal Base Characters, Quaternius, CC0, https://quaternius.com/packs/universalbasecharacters.html. Corpos super-herói (o pack gratuito não inclui as proporções regular e teen). Cabelo longo na mulher, repartido no homem.
- `people/peasant-f.glb`, `peasant-m.glb`, `ranger-f.glb`, `ranger-m.glb` — Modular Character Outfits - Fantasy, Quaternius, CC0, https://quaternius.com/packs/modularcharacteroutfitsfantasy.html. O pack gratuito traz camponês e ranger. A cabeça vem da base do mesmo sexo.
- `people/universal-anims.glb` — Universal Animation Library, Quaternius, CC0, https://quaternius.com/packs/universalanimationlibrary.html. Os seis modelos acima usam esses clipes (`Idle_Loop`, `Walk_Loop`, `Sprint_Loop`, `Punch_Jab`, `Jump_Start`, `Death01`, `Sitting_Idle_Loop`) no mesmo esqueleto. A escala deixa a altura em `4.845 * 0.37`.
- `car.glb` — Car, Quaternius, CC0, via poly.pizza. O tráfego usa seis variantes de cor e escala (hatch, sedan, taxi, compact, pickup, van) do mesmo GLB. O eixo traseiro é um nó só (`NormalCar1_BackWheels`); o script `scripts/validate-vehicle.ts` registra isso.
- `aston-dbr1.glb` — 1958 Aston Martin DBR1, OUTPISTON, CC BY-NC-SA 4.0, https://sketchfab.com/3d-models/1958-aston-martin-dbr1-59f309fe359649b1aa5ac54cf5ba17b3. Uma cópia só: é o carro estacionado, não entra no grupo de tráfego.
- `ferrari-488.glb`, `nissan-gtr.glb`, `bmw-m340i.glb`, `uaz-452.glb` — modelos Sketchfab fornecidos para o projeto, também uma cópia só cada. Entram no seletor de carro e não no tráfego. A UAZ fica a 130 km/h; Ferrari 280, GT-R 250 e M340i 220.
- `buildings/house-*.glb` — City Kit Suburban, Kenney, CC0, https://kenney.nl/assets/city-kit-suburban. Fora do miolo urbano: as fachadas da cidade são módulos procedurais.

- `props/*.glb` — Poly Haven, CC0, `https://polyhaven.com/a/<id>`. `scripts/import-polyhaven-models.mjs` simplifica cada um com meshoptimizer, comprime com meshopt e reduz as texturas a WebP 1K. O renderer instancia um draw por malha do glTF, por chunk.
  - `street-lamp.glb` — `street_lamp_01`, 7,7 mil triângulos.
  - `trash-can.glb` — `metal_trash_can`, 4,2 mil.
  - `bench.glb` — `modular_street_seating`, 10,9 mil.
  - `hydrant.glb` — `fire_hydrant`, 3,4 mil (era 86 mil).
  - `utility-box.glb` — `utility_box_02`, 6,3 mil.
  - `barrier.glb` — `concrete_road_barrier_02`, 4 mil. Ainda sem uso.
  - `potted-plant.glb` — `potted_plant_04`, 8,9 mil. Ainda sem uso.
  - `shrub.glb` — `shrub_04`, 5,3 mil.
  - `planter.glb` — `planter_box_01`, 8,1 mil.
  - `crate.glb` — `plastic_crate_01`, 10,4 mil.
  - `fern.glb` — `fern_02`, 6,2 mil. Também é a copa dos coqueiros, ampliada.
  - `tree.glb` — `island_tree_02`, 16 mil (era 1,07 milhão). As folhas viram recorte (`alphaTest`) ao carregar.

Os carros estacionados são o `car.glb` instanciado, com a pintura de cada um. Praia, ruas, serras, calçadas, troncos dos coqueiros, abrigos de ônibus, barracas e as caixas das fachadas são geometria criada em código. As janelas são desenhadas no shader da parede (`facade-shader.ts`). `ThreeRenderer` registra cada geometria e cada material no `AssetManager`, que descarta tudo no `dispose`.

Downloads crus passam por gltf-transform antes de entrar em `public/` (não é dependência de runtime):

```bash
npx @gltf-transform/cli optimize entrada.glb public/assets/saida.glb --compress draco --texture-size 512
node --experimental-strip-types scripts/validate-vehicle.ts public/assets/saida.glb
```
