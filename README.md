# TurnBased game
### Tic Tac Toe

##### Description

Basic tic-tac-toe game over logic of turn-based contract for ethereum blockchain. Interface is based on Truffle framework, React Box.

#### Installation

1. Install ganache-cli: `npm install ganache-cli`
2. Install truffle: `npm install truffle`

3. Start Ganache testrpc:
`ganache-cli -l 50000000 -b 1`

4. From project directory, apply contracts to testnet: `truffle migrate`. They would be compiled automatically.

5. Install requirements: `npm install`

6. Serve interface by webpack dev server: `npm run start`

Interface would be served on `localhost:3000` by default.

Interface make it possible to select one of available accounts to simulate multi-player.

#### Game Mechanics

Players are available to create games, set pot and join existing (not full) games.

In game players are available to make step-by-step actions (mark fields with their color/type).
The winner is determined by row/column/diagonal of 3 same color marks. Draw is also possible.

Game history is shown in special tab.
There are shown `Withdraw` button to claim reward, if possible.