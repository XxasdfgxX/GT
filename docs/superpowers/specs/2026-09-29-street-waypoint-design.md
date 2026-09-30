# Waypoint pelas ruas

O menu de pausa abre o mapa da ilha. Um clique marca um destino e desenha o caminho pelas ruas. Outro clique apaga. Chegar ao destino também apaga.

## Menu

O botão **Mapa** existe só quando o menu foi aberto com jogo a correr (`resume` definido). O menu inicial, antes da cidade carregar, não o mostra.

O botão fica no painel principal, com o mesmo estilo dos botões secundários. Abre um painel no lugar da lista, no mesmo padrão de Configurações. **Voltar** mostra de novo o painel principal e não mexe no waypoint.

O mapa reutiliza o atlas de `bakeRadarMap` (ilha, lagoa e `city.graph`): norte para cima, sem rodar com a câmara e sem espelhar o eixo X. O canvas mantém a proporção do atlas e ocupa a largura do cartão do menu. Um clique fora da imagem não faz nada. Um ponto marca o jogador na posição em que o menu abriu. O jogo está em pausa, por isso essa posição não muda enquanto o painel está aberto.

## Clique

O primeiro clique, com nenhum waypoint ativo, grava o ponto do mundo por baixo do cursor. O cursor fica nesse sítio exato, mesmo fora da rua ou na água.

O segundo clique, em qualquer ponto do mapa, apaga o waypoint e não cria outro. Um terceiro clique marca um destino novo.

Fechar o menu com Continuar ou com a tecla do menu mantém o waypoint. Começar de novo Com missão ou Sem missão cria outra sessão e o waypoint anterior desaparece com ela.

## Rota

A rota usa `city.graph`: nós com `x` e `z`, e arestas `a`/`b` com `length`. Esse grafo já liga todas as ruas. A rota não cria atalhos fora das arestas. As ruas contam nos dois sentidos, para servir a pé e de carro.

- O jogador e o destino projetam-se no ponto mais próximo de alguma aresta. Esses pontos podem cair a meio da rua e entram no grafo só para essa consulta.
- O caminho mais curto segue as arestas entre as duas projeções. O custo de uma aresta é `length`. O custo até uma projeção é a distância ao nó da aresta.
- Um troço reto vai do jogador até à projeção dele, e outro vai da projeção do destino até ao cursor.
- Se os dois pontos caem na mesma aresta, o miolo da rota é só esse pedaço de rua.
- Se não houver caminho no grafo, ou se não houver ruas, o miolo é uma reta entre as projeções. O cursor continua visível.

A linha é `#7ec8e3`. O cursor é um losango `#f2c14e`. O marcador da missão continua o círculo dourado que já existe.

Cada frame, com o jogo a correr, a rota recalcula-se a partir da posição que o HUD já lê: o jogador a pé, ou o carro quando está a conduzir. O grafo estático constrói-se uma vez. Só as duas projeções mudam.

## Radar

O radar desenha a mesma linha, cortada pelo círculo, e o losango do destino. Os vértices da linha não são puxados para a borda. O losango usa o clamp que o marcador da missão já usa, e fica na borda quando o destino está fora do alcance do radar. Os dois marcadores podem aparecer ao mesmo tempo.

## Chegada

Quando a distância no plano XZ entre o jogador (ou o carro) e o cursor é de 12 metros ou menos, o waypoint apaga-se nesse frame, antes do radar desenhar. Não é preciso estar em cima da linha da rota.

## Estado

Um módulo pequeno em `src/ui/waypoint.ts` guarda no máximo um ponto `{ x, z }` ou nenhum. O `bootstrap` cria um por sessão e passa-o ao menu e ao HUD. O menu e o HUD não criam o seu próprio waypoint.

A decisão do clique fica numa função pura: se já há destino, o clique devolve nenhum; se não há, devolve o ponto clicado.

A matemática da rota fica em `src/ui/street-route.ts`. Não usa DOM, ECS nem Three.js. O menu e o radar só desenham o resultado.

## Fora disto

Não há vários destinos, nem arrastar o cursor, nem marcador no mundo 3D, nem rota que desvie da linha central da rua por causa da largura.

## Testes

Em `src/tests`, sem DOM:

- Num grafo de duas arestas que se encontram em `(0, 0)`, o caminho de `(0, 10)` até `(40, 0)` passa a 0,01 metro de `(0, 0)`.
- Dois pontos na mesma aresta vertical em `x = 0` mantêm todos os vértices da rota com `|x| <= 1`.
- Sem caminho entre as projeções, o resultado é a reta entre elas, com os troços retos até ao jogador e até ao cursor.
- Em `createCity().graph`, o caminho entre dois nós que não partilham uma aresta tem mais de dois vértices, e cada par seguido assenta numa aresta do grafo.
- Distância 12 apaga. Distância acima de 12 mantém.
- Com destino ativo, o clique seguinte apaga. Sem destino, o clique grava o ponto.
- Um ponto do mundo convertido para o atlas e de volta cai no mesmo sítio.
