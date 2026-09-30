# Fichas dos carros e Aston Martin DBR1

O carro estacionado no solo é o Aston Martin DBR1, com 200 km/h e torque 80. Os outros seis ficam na rua. Cada carro tem torque (0 a 100) e velocidade máxima. Com o modo admin desligado, a partida ignora a escolha e nasce o Aston. Ligado, Configurações escolhe o carro e o bairro. A tela inicial fica só com os modos de jogo.

## Menu

O painel inicial tem Continuar, Com missão, Sem missão, Mapa e Multijogador. Modo admin, Bairro e Carro saem dali e entram em Configurações, numa secção Partida, por baixo de sensibilidade, volume, sombras e nitidez.

Partida mostra o interruptor Modo admin. Com ele ligado, aparecem Bairro e Carro. Desligado, os dois somem. O seletor de carro mostra o nome, a velocidade máxima e o torque, por exemplo `Aston Martin DBR1 · 200 km/h · 80`. A escolha grava no mesmo instante que o resto. Sem gravação, ou numa gravação antiga, o carro é `aston`. Um id fora da lista derruba a gravação para os padrões, como um bairro desconhecido.

Mudar carro ou bairro com o jogo pausado não move o jogador nem o carro desta sessão. Vale na próxima Com missão, Sem missão ou entrada numa sala.

## Catálogo

| Id      | Nome              | Velocidade máxima | Torque | Onde                                     |
| ------- | ----------------- | ----------------- | ------ | ---------------------------------------- |
| aston   | Aston Martin DBR1 | 200 km/h          | 80     | Carro estacionado. Não entra no tráfego. |
| hatch   | Hatch             | 140 km/h          | 45     | Rua                                      |
| sedan   | Sedan             | 150 km/h          | 50     | Rua                                      |
| taxi    | Táxi              | 130 km/h          | 42     | Rua                                      |
| compact | Compacto          | 120 km/h          | 38     | Rua                                      |
| pickup  | Pickup            | 125 km/h          | 55     | Rua                                      |
| van     | Van               | 110 km/h          | 32     | Rua                                      |

Torque 50 é a força do sedan de hoje: 1500 no carro de física, e aceleração 9 m/s² no carro de rua roubado. Os outros torques escalam esses dois números. A velocidade máxima vira o teto ao dirigir, em m/s (`km/h / 3.6`). A marcha à ré continua em 7 m/s.

O trânsito sozinho mantém a velocidade de cruzeiro que já tem. Não usa a velocidade máxima da ficha.

No solo, o carro estacionado usa a ficha escolhida. Sem admin, é sempre o Aston. Com admin, é o id gravado. No multijogador não há carro estacionado. Ao entrar num carro da rua, a ficha desse carro define a força e o teto. O chassis do multijogador continua o do sedan.

O modelo do Aston fica em `public/assets/aston-dbr1.glb`. É uma cópia só, comprimida, fora do grupo de 40 carros da rua. Crédito: OUTPISTON, Sketchfab, CC BY-NC-SA 4.0.

## Testes

O Vitest corre em Node. O markup do menu não ganha teste de browser.

- Preferências: sem gravação, o carro é `aston`. Gravação antiga sem o campo completa `aston` e preserva o resto. Gravar um carro da lista volta igual. Id fora da lista cai nos padrões.
- Ficha: torque 50 produz força 1500. Torque 80 produz 2400. 200 km/h é 200/3.6 m/s. A velocidade ao dirigir não passa do teto da ficha. Sem admin, o carro inicial é o Aston mesmo que a gravação diga outro. O Aston não está no catálogo de rua.
- O sedan escolhido como carro inicial mantém a escala visual 0.9 e a caixa de hoje.
