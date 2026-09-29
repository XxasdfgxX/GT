# Assets

## Iluminação

| Nome                              | Uso                         | URL                                                  | Licença |
| --------------------------------- | --------------------------- | ---------------------------------------------------- | ------- |
| kloofendal_43d_clear_puresky (2k) | Céu e iluminação por imagem | https://polyhaven.com/a/kloofendal_43d_clear_puresky | CC0     |

O arquivo está em `public/assets/hdri/kloofendal_43d_clear_puresky_2k.hdr`. O `PMREMGenerator` gera o ambiente a partir dele. A névoa usa a cor do horizonte dessa imagem.

## Superfícies

Texturas 1K JPG, repetidas em metros. Mapas de cor em sRGB; normal, roughness e AO em linear. A faixa da pista é uma textura gerada no renderer, por cima do asfalto.

| Nome        | Uso                                                     | URL                                       | Licença |
| ----------- | ------------------------------------------------------- | ----------------------------------------- | ------- |
| Asphalt012  | Asfalto                                                 | https://ambientcg.com/view?id=Asphalt012  | CC0     |
| Concrete034 | Calçada e meio-fio                                      | https://ambientcg.com/view?id=Concrete034 | CC0     |
| Ground080   | Areia da praia                                          | https://ambientcg.com/view?id=Ground080   | CC0     |
| Grass001    | Grama                                                   | https://ambientcg.com/view?id=Grass001    | CC0     |
| Plaster001  | Parede pintada (reboco branco tingido pela cor da casa) | https://ambientcg.com/view?id=Plaster001  | CC0     |

Os arquivos estão em `public/assets/textures/<asphalt|concrete|sand|grass|plaster>/`.

## Modelos

Os créditos completos estão em `public/assets/CREDITS.txt`.

- `character.glb` — Man in Suit, Quaternius, CC0, via poly.pizza
- `car.glb` — Car, Quaternius, CC0, via poly.pizza
- `buildings/house-*.glb` — City Kit Suburban, Kenney, CC0, https://kenney.nl/assets/city-kit-suburban

Praia, ruas e morro continuam sendo geometria criada em código. `ThreeRenderer` registra cada geometria e cada material no `AssetManager`, que descarta tudo no `dispose`.
