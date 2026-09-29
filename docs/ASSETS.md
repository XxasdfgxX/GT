# Assets

O Marco 1 não tem modelos. Tudo que se vê é geometria criada em código:

- chão e prédios: caixas
- jogador: cápsula
- carro: caixa, cabine, capô e quatro cilindros como rodas

`ThreeRenderer` registra cada geometria e cada material no `AssetManager`. Quem cria é quem descarta, no `dispose` do renderer e do mundo físico.

`public/assets/` está reservado para glTF/GLB, texturas e áudio. Quando entrarem, o fluxo é: manifesto, carga por `AssetManager`, cache, e `dispose` no unload do chunk. Sem textura solta criada num sistema.
