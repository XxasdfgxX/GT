# Assets

## Iluminação

| Nome                              | Uso                         | URL                                                  | Licença |
| --------------------------------- | --------------------------- | ---------------------------------------------------- | ------- |
| kloofendal_43d_clear_puresky (2k) | Céu e iluminação por imagem | https://polyhaven.com/a/kloofendal_43d_clear_puresky | CC0     |

O arquivo está em `public/assets/hdri/kloofendal_43d_clear_puresky_2k.hdr`. O `PMREMGenerator` gera o ambiente a partir dele. A névoa usa a cor do horizonte dessa imagem.

## Modelos

Os créditos completos estão em `public/assets/CREDITS.txt`.

- `character.glb` — Man in Suit, Quaternius, CC0, via poly.pizza
- `car.glb` — Car, Quaternius, CC0, via poly.pizza
- `buildings/house-*.glb` — City Kit Suburban, Kenney, CC0, https://kenney.nl/assets/city-kit-suburban

Praia, ruas e morro continuam sendo geometria criada em código. `ThreeRenderer` registra cada geometria e cada material no `AssetManager`, que descarta tudo no `dispose`.
