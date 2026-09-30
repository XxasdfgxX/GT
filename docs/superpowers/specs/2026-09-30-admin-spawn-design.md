# Modo admin e escolha de spawn

O menu inicial tem um interruptor **Modo admin**, ligado por padrão. Ligado, o jogador escolhe o bairro onde nasce. A escolha vale para Com missão, Sem missão e para a sala em que entrar a seguir. Cada morte volta a esse mesmo ponto. Desligado, o solo volta ao ponto fixo e o multijogador volta a sortear.

## Menu

O interruptor fica no painel principal, junto dos modos. Ligado, aparece uma lista com Centro, Jurerê, Norte, Leste e Sul. Os valores gravados são `centro`, `jurere`, `norte`, `leste` e `sul`. Centro já vem selecionado.

Os dois campos entram em `GameSettings` e gravam-se com as outras preferências, no mesmo instante em que mudam. Sem gravação, `admin` é `true` e `spawn` é `centro`. Uma gravação antiga, só com rato, volume, sombras e nitidez, continua a carregar e completa esses dois campos. JSON partido, ou um bairro fora da lista, cai nos padrões inteiros.

Desligado, a lista some. A partida não leva nome de bairro.

No menu de pausa os mesmos controles continuam visíveis. Mudá-los não move o jogador da sessão que já corre. Continuar também não. A próxima Com missão, Sem missão ou entrada numa sala é que usa os valores novos.

## Entrada

Com o modo admin ligado, a partida leva só o nome do bairro. O cliente não envia coordenadas.

No solo, o nome resolve-se em `bairroSpawns`. O jogador nasce nesse ponto. `spawnPlayer` grava `x`, `y` e `z` no componente `Player`, e a morte lê esses três valores. Se o nome não existir na lista, a entrada usa `soloSpawn()`. Com o modo desligado, a entrada também usa `soloSpawn()`, e esse ponto fixo é o que fica gravado.

No multijogador, `connectRoom` acrescenta `spawn` à query do WebSocket, junto de `room` e `name`, só quando o modo está ligado. O servidor passa esse parâmetro a `join`. Um nome que exista nos spawns da sala grava o ponto no jogador (`home`) e usa-o na entrada. Sem parâmetro, com string vazia, ou com um nome que a sala não tem, `home` fica vazio e a entrada sorteia com `pickSpawn`, como hoje.

A caixa e o ponto de entrega da missão ficam onde estão.

## Morte

No solo, a morte espera o mesmo atraso de hoje e volta ao ponto gravado na entrada. O sistema de dinheiro deixa de chamar `soloSpawn()` outra vez.

Na sala, se o jogador tem `home`, cada morte volta a esse ponto. Se `home` está vazio, cada morte sorteia de novo. Dois jogadores podem ter bairros diferentes. Quem entrou sem escolha continua a ser sorteado mesmo que o outro tenha escolhido.

## Testes

O Vitest corre em Node. O markup do menu não ganha teste de browser.

- Preferências: sem gravação, admin ligado e Centro. Gravação antiga sem os campos novos preserva o resto e completa admin e Centro. Gravar admin desligado e Jurerê volta igual. JSON partido, ou bairro fora da lista, cai nos padrões.
- Nome: um nome da lista devolve esse ponto. Nome vazio ou desconhecido não devolve ponto.
- Sala: entrar com `sul` nasce em Sul e a morte volta a Sul, mesmo com o sorteio preso em Centro. Sem nome, ou com um nome que não existe, a entrada e cada morte sorteiam. Dois jogadores podem escolher bairros diferentes. As chamadas de `join` que já existem, sem bairro, continuam válidas.
