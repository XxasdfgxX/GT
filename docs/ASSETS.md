# Assets

## Iluminação

| Nome                              | Uso                         | URL                                                  | Licença |
| --------------------------------- | --------------------------- | ---------------------------------------------------- | ------- |
| kloofendal_43d_clear_puresky (2k) | Céu e iluminação por imagem | https://polyhaven.com/a/kloofendal_43d_clear_puresky | CC0     |

O arquivo está em `public/assets/hdri/kloofendal_43d_clear_puresky_2k.hdr`. O `PMREMGenerator` gera o ambiente a partir dele. A névoa usa a cor do horizonte dessa imagem.

## Superfícies

Texturas 1K JPG, repetidas em metros. Mapas de cor em sRGB; normal, roughness e AO em linear. A faixa da pista é uma textura gerada no renderer, por cima do asfalto.

| Nome            | Uso                                                     | URL                                           | Licença |
| --------------- | ------------------------------------------------------- | --------------------------------------------- | ------- |
| Asphalt012      | Asfalto                                                 | https://ambientcg.com/view?id=Asphalt012      | CC0     |
| Concrete034     | Meio-fio                                                | https://ambientcg.com/view?id=Concrete034     | CC0     |
| PavingStones136 | Calçada em lajes                                        | https://ambientcg.com/view?id=PavingStones136 | CC0     |
| Ground080       | Areia da praia                                          | https://ambientcg.com/view?id=Ground080       | CC0     |
| Grass001        | Grama                                                   | https://ambientcg.com/view?id=Grass001        | CC0     |
| Plaster001      | Parede pintada (reboco branco tingido pela cor da casa) | https://ambientcg.com/view?id=Plaster001      | CC0     |

Os arquivos estão em `public/assets/textures/<asphalt|concrete|sidewalk|sand|grass|plaster>/`.

## Modelos

Os créditos completos estão em `public/assets/CREDITS.txt`.

- `character.glb` — Man in Suit, Quaternius, CC0, via poly.pizza. É o corpo do jogador e também um dos pedestres. Escala `0.37` porque o rig vem exportado a 100x. Animações: idle, walk, run, punch, jump.
- `people/*.glb` — Animated Men Pack e Animated Women Pack, Quaternius, CC0, https://poly.pizza/bundle/Animated-Men-Pack-DAC9SDgMQT e https://poly.pizza/bundle/Animated-Women-Pack-HHSKxnk1mY. O mesmo rig do jogador, na mesma escala: camiseta, camisa, manga comprida, regata, rua e vestido. As mulheres usam os clipes `Female_*`.
- `people/woman-leaf.glb` — Casual Green Leaf Look, restore50, CC BY 4.0, https://sketchfab.com/3d-models/casual-green-leaf-look-c8586ab08b6948d8ab0c6f0a4beb438b. Substitui a mulher casual. Malha estática, já em metros: escala `4.845 * 0.37 / 1.8983` e um lift para os pés, porque a origem fica na cintura. Sem clipe de sentar, então não dirige.
- `car.glb` — Car, Quaternius, CC0, via poly.pizza. O tráfego usa seis variantes de cor e escala (hatch, sedan, taxi, compact, pickup, van) do mesmo GLB. O eixo traseiro é um nó só (`NormalCar1_BackWheels`); o script `scripts/validate-vehicle.ts` registra isso.
- `aston-dbr1.glb` — 1958 Aston Martin DBR1, OUTPISTON, CC BY-NC-SA 4.0, https://sketchfab.com/3d-models/1958-aston-martin-dbr1-59f309fe359649b1aa5ac54cf5ba17b3. Uma cópia só: é o carro estacionado, não entra no grupo de tráfego.
- `ferrari-488.glb`, `nissan-gtr.glb`, `bmw-m340i.glb`, `uaz-452.glb` — modelos Sketchfab fornecidos para o projeto, também uma cópia só cada. Entram no seletor de carro e não no tráfego. A UAZ fica a 120 km/h; Ferrari 280, GT-R 250 e M340i 220.
- `buildings/house-*.glb` — City Kit Suburban, Kenney, CC0, https://kenney.nl/assets/city-kit-suburban. Fora do miolo urbano: as fachadas da cidade são módulos procedurais.

Praia, ruas, serras, calçadas, postes, árvores e fachadas são geometria criada em código. `ThreeRenderer` registra cada geometria e cada material no `AssetManager`, que descarta tudo no `dispose`.

Downloads crus passam por gltf-transform antes de entrar em `public/` (não é dependência de runtime):

```bash
npx @gltf-transform/cli optimize entrada.glb public/assets/saida.glb --compress draco --texture-size 512
node --experimental-strip-types scripts/validate-vehicle.ts public/assets/saida.glb
```
