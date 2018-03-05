import React, { Component } from 'react'
import XOGameContract from '../build/contracts/XOGame.json'
import getWeb3 from './utils/getWeb3'

import { GameView } from './GameView'

import './css/oswald.css'
import './css/open-sans.css'
import './css/pure-min.css'
import './App.css'

class App extends Component {
    constructor(props) {
        super(props)

        this.state = {
            storageValue: 0,
            web3: null,
            accounts: [],
            selectedAccountIdx: 0,
            balance: 0,
            gameContract: {},
            myGames: [],
            openGames: [],
            selectedGame: '',
            state: '',
            game_pot: 0,
            p1_alias: 'player1',
            p2_alias: 'player2',
            playX: true,
            mes: '',
            to_join: '',
            games: {},
            gameStates: {},
        }

        this.changeAccount = this.changeAccount.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.createNewGame = this.createNewGame.bind(this);
        this.joinGame = this.joinGame.bind(this);
        this.checkGameState = this.checkGameState.bind(this);
        this.makeMove = this.makeMove.bind(this);
        this.selectGame = this.selectGame.bind(this);
        this.updateState = this.updateState.bind(this);
        this.getGameData = this.getGameData.bind(this);
        // list my games: getGamesOfPlayer(addr)
        // list open games: getOpenGameIds()
        // start game: initGame(alias, playAsTIC, timer)
        // join game: joinGame(gameId, alias)
        // make move: moveFromState(gameId, state, pos), move(gameId, pos)
        // get game state: getCurrentGameState(gameId)
        // get TIC player: getXPlayer(gameId)
        // timer: claimTimeoutEndedWithMove(gameId, pos), claimTimeoutEnded(gameId), confirmGameEnded(gameId)
        // claim win: claimWin(gameId)
        // surrender: surrender(gameId)
        // get score: getScore(addr)
        // check game end: isGameEnded(gameId) -> bool

        /* listen events
         * game initialized (gameId, player1, player1Alias, playerTIC, turn, pot)
         * game joined (gameId, player1, player1Alias, player2, player2Alias, playerTIC, pot)
         * game state changed (gameId, state)
         * game ended (gameId)
         * game closed (gameId, addr)
         * game timout started (gameId, timeoutStartedAt, timeoutState)
         * game draw offer rejected (gameId)
         * make move (gameId, player, pos)
         * score updated (player, score)
         */
    }

    handleInputChange(event) {
        const target = event.target;
        const value = target.type === 'checkbox' ? target.checked : target.type === 'number' ? +target.value : target.value;
        const name = target.name;

        this.setState({
            [name]: value
        });
    }

    componentWillMount() {
        // Get network provider and web3 instance.
        // See utils/getWeb3 for more info.

        getWeb3
            .then(results => {
                this.setState({
                    web3: results.web3,
                    accounts: results.web3.eth.accounts,
                    balance: results.web3.eth.getBalance(results.web3.eth.accounts[0]).toNumber(),
                })

                // Instantiate contract once web3 provided.
                this.instantiateContract()
            })
            .catch(() => {
                console.log('Error finding web3.')
            })
    }

    instantiateContract() {
        const contract = require('truffle-contract')
        const XOGame = contract(XOGameContract)
        XOGame.setProvider(this.state.web3.currentProvider)

        // Declaring this for later so we can chain functions on SimpleStorage.
        var XOGameInstance
        // Get accounts.
        this.state.web3.eth.getAccounts((error, accounts) => {
            XOGame.deployed().then((instance) => {
                XOGameInstance = instance
                // Get the value from the contract to prove it worked.
                const events = XOGameInstance.allEvents();
                events.watch((err, res) => {
                    if (err) console.log(err);
                    else {
                        console.log(res);
                        switch (res.event) {
                            case 'MakeMove':
                                console.log(res.args)
                                break;
                            case 'GameStateChanged':
                                this.checkGameState(res.args.gameId);
                                break;
                            default:
                                break;
                        }
                    }
                })
                return this.setState({ gameContract: XOGameInstance, accounts: accounts})
            }).then(() => this.updateState())
        })
    }

    changeAccount(event) {
        this.setState({
            selectedAccountIdx: +event.target.value,
            selectedGame: '',
            myGames: [],
            state: '',
            balance: this.state.web3.eth.getBalance(this.state.accounts[+event.target.value]).toNumber()
        })
        this.showMessage('Loading...');
        this.updateState(this.state.accounts[+event.target.value]);
        this.showMessage('');
        this.forceUpdate();
    }

    checkGameState(game) {
        // game = game || this.state.selectedGame;
        this.showMessage('Waiting...');
        let gameStates, games;
        return this.state.gameContract.getCurrentGameState.call(game)
            .then((result) => {
                this.showMessage('Updated.');
                gameStates = this.state.gameStates;
                gameStates[game] = result.map(n => n.toNumber());
                return this.state.gameContract.getXPlayer.call(game);
            }).then((result) => {
                games = this.state.games;
                games[game].xplayer = result;
                return ;
            }).then(() => {
                this.setState({gameStates: gameStates, games: games})
                return game;
            })
    }

    makeMove(pos) {
        console.log(pos);
        let game = this.state.selectedGame;
        if (!game.length) this.showMessage('May be start playing first?');
        if (this.state.games[game].nextPlayer !== this.state.accounts[this.state.selectedAccountIdx]) this.showMessage('You are wrong.');
        this.state.gameContract.move(
            game,
            pos,
            {
                from: this.state.accounts[this.state.selectedAccountIdx],
                to: this.state.gameContract.address,
                gas: 15000000,
            })
        .then((result) => {
            console.log(result);
            this.showMessage('You have made a move!');
            for (var i = 0; i < result.logs.length; i++) {
                var log = result.logs[i];
                if (log.event === "MakeMove" && log.args.gameId === game) {
                // We found the event!
                break;
                }
            }
        }).then(
            () => {
                this.checkGameState(game);
            }
        ).then(() => 
            this.claimWin(game))
    }

    changeState(newState) {
        this.setState({
            state: newState,
        });
        this.updateState();
    }

    getGameData(game) {
        return this.state.gameContract.games.call(game)
            .then(res => {
                let [p1, p2, a1, a2, np, winner, ended, pot] = res;
                let games = this.state.games;
                games[game] = {
                    player1: p1,
                    player2: p2,
                    alias1: a1,
                    alias2: a2,
                    pot: pot,
                    winner: winner,
                    ended: ended,
                    nextPlayer: np, // next player
                };
                return this.setState({games: games});
            });
    }
    
    updateState(acc) {
        if (!acc) {
            acc = this.state.accounts[this.state.selectedAccountIdx];
        }
        // get my games
        this.state.gameContract
            .getGamesOfPlayer
            .call(acc, {from: acc, to: this.state.gameContract.address})
        .then((result) => {
            console.log(result);
            this.setState({myGames: result});
            return result.map(g => this.checkGameState(g).then(this.getGameData(g)));
        });
        // update open games
        this.state.gameContract.getOpenGameIds.call().then((result) => {
            
            // get list of open games
            this.setState({openGames: result})
            return result.map(game => 
                this.getGameData(game)
            )
        })
        this.forceUpdate();
    }

    showMessage(mes) {
        this.setState({mes: mes})
    }

    createNewGame(event) {
        event.preventDefault();
        this.showMessage('Game is initializing...')
        this.state.gameContract.initGame(
            this.state.p1_alias,
            this.state.playX ? true : false,
            5,
            {
                from: this.state.accounts[this.state.selectedAccountIdx],
                value: this.state.game_pot * 500,
                to: this.state.gameContract.address,
                gas: 150000000,
            }
        ).then((result) => {
            console.log(result.logs[0].args.gameId)
            this.showMessage('');
            let game = result.logs[0].args.gameId;
            let gameStates = this.state.gameStates;
            gameStates[game] = [0,0,0,0,0,0,0,0,0, this.state.playX ? 1 : -1]
            let games = this.state.games;
            games[game] = {
                player1: this.state.accounts[this.state.selectedAccountIdx],
                player2: '0x000000000000000',
                alias1: this.state.p1_alias,
                alias2: '',
                pot: this.state.game_pot * 500,
                winner: '0x0000000000000',
                ended: false,
                nextPlayer: this.state.playX ? this.state.accounts[this.state.selectedAccountIdx] : '0x0000000000', // next player
            }
            return this.setState({
                selectedGame: game,
                state: 'awaiting',
                games: games,
                gameStates: gameStates,
            })
        });
    }

    joinGame(event) {
        event.preventDefault();
        this.showMessage(`Joining ${this.state.to_join}...`)
        this.state.gameContract.joinGame(
            this.state.to_join,
            this.state.p2_alias,
            {
                from: this.state.accounts[this.state.selectedAccountIdx],
                value: this.state.games[this.state.to_join].pot,
                to: this.state.gameContract.address,
                gas: 15000000,
            }
        ).then(() => {
            this.showMessage('');
            return this.setState({
                selectedGame: this.state.to_join,
                state: 'play'
            })
        }).catch(err => console.log(err));
    }

    selectGame(game) {
        this.showMessage('Loading game data...')
        this.checkGameState(game).then(() => {
            this.showMessage('')
            return this.setState({state: 'play', selectedGame: game})
        });
    }

    claimWin(game) {
        this.state.gameContract.claimWin.call(game,
            { from: this.state.accounts[this.state.selectedAccountIdx],
                to: this.state.gameContract.address,
                gas: 20000000,
            }
        ).then((result) => {
            console.log(result.logs);
            for (var i = 0; i < result.logs.length; i++) {
                var log = result.logs[i];

                if (log.event === "GameEnded" && log.args.gameId === game) {
                    // We found the event!
                    let g = this.state.games;
                    g[game].ended = true;
                    g[game].winner = log.args.winner;
                    this.setState({games: g})
                    this.showMessage('You won!')
                    break;
                }
            }
        }).catch(err => console.log('not a winner still', err))
    }

    render() {
        return (
            <div className="App" >
                <nav className="navbar pure-menu pure-menu-horizontal">
                    <a href="#" className="pure-menu-heading pure-menu-link">TicTacEth</a>
                    <a href="#" onClick={() => this.changeState('create')} className="pure-menu-heading pure-menu-link">Create New Game</a>
                    <a href="#" onClick={() => this.changeState('join')} className="pure-menu-heading pure-menu-link">Join Game</a>
                    <a href="#" onClick={() => this.changeState('show')} className="pure-menu-heading pure-menu-link">Show History</a>
                    <span>
                        <a href="#" className="pure-menu-heading pure-menu-link">Account: </a>
                        <select name='Account' onChange={this.changeAccount} value={""+this.state.selectedAccountIdx}>
                            {this.state.accounts.map((acc, idx) => <option key={acc} value={idx}>({idx}.) {acc}</option>)}
                        </select>
                    </span>
                    <span className="pure-menu-heading">{this.state.mes}</span>
                    <span style={{float: 'right', color: 'white'}} className="pure-menu-heading">Balance {this.state.selectedAccountIdx}: {this.state.balance}</span>
                </nav>
                <main className="container">
                    <div className="pure-g">
                        <div className="pure-u-1-1">
                            <h1> Good to Go! </h1>
                        </div>
                    </div>
                    { this.state.state !== 'show' && this.state.myGames.length > 0 && this.state.myGames.map(game => <span key={game} style={{'cursor': 'pointer'}} onClick={() => this.selectGame(game)}>Awaiting game: {game}<br/></span>)}
                    
                    { (this.state.state === 'awaiting') && <h3>Awaiting your opponent!</h3>}
                    { (this.state.state === 'play') && <h3>You are in game!</h3>}
                    
                    { (this.state.selectedGame.length > 0 && (this.state.state === 'play' || this.state.state === 'awaiting')) && 
                        <GameView 
                            gameId={this.state.selectedGame}
                            state={this.state.gameStates[this.state.selectedGame]} 
                            gameInfo={this.state.games[this.state.selectedGame]}
                            player={this.state.accounts[this.state.selectedAccountIdx]}
                            isXPlayer={this.state.games[this.state.selectedGame] && this.state.accounts[this.state.selectedAccountIdx] === this.state.games[this.state.selectedGame].xplayer}
                            makeMove={(p) => this.makeMove(p)}
                            />
                    }
                    
                    { (this.state.state === 'create' || this.state.state === '') && (
                        <form onSubmit={this.createNewGame}>
                            <h2>Create new game:</h2>
                            <h5>Account: {''+this.state.accounts[this.state.selectedAccountIdx]}</h5>
                            <label htmlFor="p1_alias">Alias</label><br/>
                            <input onChange={this.handleInputChange}
                                name='p1_alias' id='p1_alias' key='p1_alias' value={this.state.p1_alias} placeholder='Player 1 alias' />
                            <br />
                            <input onChange={this.handleInputChange}
                                type='checkbox' key='playX' id='playAsTIC' name='playX' value={this.state.playX} />
                            <label htmlFor="playAsTIC">Play as X:</label><br />
                            <label htmlFor="pot">Pot:</label><br />
                            <input onChange={this.handleInputChange}
                                type='number' id='pot' key='pot' name='game_pot'
                                value={this.state.game_pot} /><br />
                            <button type='submit'>Create new game!</button>
                        </form>
                    )}
                    { (this.state.state === 'join') && (
                        <form onSubmit={this.joinGame}>
                            <h2>Join existing game:</h2>
                            <h5>Account: {this.state.accounts[this.state.selectedAccountIdx]}</h5>
                            <label htmlFor="p2_alias">Alias</label><br/>
                            <input onChange={this.handleInputChange}
                                name='p2_alias' id='p2_alias' key='p2_alias' value={this.state.p2_alias} placeholder='Your alias' />
                            <br />
                            {this.state.openGames.map((game, idx) => (<div key={idx}>
                                <label htmlFor={'join-' + idx}>
                                <input
                                    type='radio'
                                    id={'join-'+idx}
                                    value={game}
                                    name='to_join'
                                    checked={this.state.to_join === game} 
                                    onChange={this.handleInputChange}/>
                                    P1: {this.state.games[game].alias1}, Pot: {this.state.games[game].pot.toNumber() * 2}</label><br />
                                </div>
                            ))}
                            <button type='submit'>Join game!</button>
                        </form>
                    )}
                    { this.state.state === 'show' && (this.state.myGames.length > 0) && this.state.myGames.map(game => 
                        <span key={game} style={{'cursor': 'pointer'}} onClick={() => this.selectGame(game)}>Game: {game}<br/>
                            {JSON.stringify(this.state.games[game]) + '\n\n'}
                        </span>)}
                </main>
            </div>
        );
    }
}

export default App