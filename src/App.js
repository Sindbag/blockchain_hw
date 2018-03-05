import React, { Component } from 'react'
import XOGameContract from '../build/contracts/XOGame.json'
import getWeb3 from './utils/getWeb3'

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
            openGames: {},
            selectedGame: '',
            state: '',
            game_pot: 0,
            p1_alias: 'player1',
            p2_alias: 'player2',
            playX: true,
            mes: '',
            to_join: '',
            pots: {},
            gameStates: {},
        }

        this.changeAccount = this.changeAccount.bind(this);
        this.handleInputChange = this.handleInputChange.bind(this);
        this.createNewGame = this.createNewGame.bind(this);
        this.joinGame = this.joinGame.bind(this);
        this.checkGameState = this.checkGameState.bind(this);
        this.makeMove = this.makeMove.bind(this);
        this.getSign = this.getSign.bind(this);
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
                this.setState({ gameContract: XOGameInstance, accounts: accounts})
                return XOGameInstance.getOpenGameIds.call()
            }).then((result) => {
                // get list of open games
                this.setState({openGames: result})
                return result.map(game => {
                    XOGameInstance.games.call(game).then(res => {
                        let [p1, p2, a1, a2, np, winner, ended, pot] = res;
                        return this.setState({pots: Object.assign(this.state.pots, 
                            {[game]: {
                                p1: p1,
                                p2: p2,
                                a1: a1,
                                a2: a2,
                                pot: pot,
                                winner: winner,
                                ended: ended,
                                np: np, // next player
                            } })});
                    });
                    return null;
                })
            }).then(() => this.updateState())
        })
    }

    changeAccount(event) {
        this.setState({
            selectedAccountIdx: +event.target.value,
            selectedGame: '',
            balance: this.state.web3.eth.getBalance(this.state.accounts[+event.target.value]).toNumber()
        });
        this.updateState();
    }

    checkGameState(game) {
        // game = game || this.state.selectedGame;
        this.showMessage('Waiting...');
        return this.state.gameContract.getCurrentGameState.call(game)
            .then((result) => {
                this.showMessage('Updated.');
                this.setState({gameStates: Object.assign(this.state.gameStates,
                    {[game]: result.map(n => n.toNumber())})})
                return result.map(n => n.toNumber());
            })
    }

    makeMove(pos) {
        let game = this.state.selectedGame;
        if (!game.length) throw('No game selected');
        this.state.gameContract.move(game, pos,
            {
                from: this.state.accounts[this.state.selectedAccountIdx],
                to: this.state.gameContract.address,
                gas: 15000000,
            })
        .then(() => {
            this.showMessage('You have made a move!');
            this.checkGameState(game);
            this.claimWin(game);
        })
    }

    changeState(newState) {
        this.setState({
            state: newState,
        }).then(() =>
        this.updateState())
    }

    getGameData(game) {
        return this.state.gameContract.games.call(game)
            .then(res => {
                let [p1, p2, a1, a2, np, winner, ended, pot] = res;
                return this.setState({pots: Object.assign(this.state.pots, 
                    {[game]: {
                        p1: p1,
                        p2: p2,
                        a1: a1,
                        a2: a2,
                        pot: pot,
                        winner: winner,
                        ended: ended,
                        np: np, // next player
                    } })});
            });
    }
    
    updateState() {
        this.state.gameContract.getGamesOfPlayer.call(this.state.accounts[this.state.selectedAccountIdx])
        .then((result) => {
            this.setState({myGames: result});
            result.map( g => this.checkGameState(g).then(this.getGameData));
            return this.state.gameContract.getOpenGameIds.call()
        }).then((result) => {
            // get list of open games
            this.setState({openGames: result})
            return result.map(game => 
                this.getGameData
            )
        })
    }

    showMessage(mes) {
        this.setState({mes: mes})
    }

    createNewGame(event) {
        event.preventDefault();
        this.showMessage('Game is initializing...')
        this.state.gameContract.initGame(
            this.state.p1_alias,
            this.state.playX,
            5,
            {
                from: this.state.accounts[this.state.selectedAccountIdx],
                value: this.state.game_pot * 500,
                to: this.state.gameContract.address,
                gas: 15000000,
            }
        ).then((result) => {
            console.log(result.logs[0].args.gameId)
            this.showMessage('');
            return this.setState({
                selectedGame: result.logs[0].args.gameId,
                state: 'awaiting'
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
                value: this.state.pots[this.state.to_join].pot,
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

    getSign(pos) {
        let s = '';
        // this.checkGameState(this.state.selectedGame).then(() => {
        console.log(this.state.gameStates);
        let state = this.state.gameStates[this.state.selectedGame];
        if (state && state !== undefined) state = state[pos]; else return null;
        if (state > 0) {
            s = 'X'
        } else if (state < 0) {
            s = 'O'
        } else {
            s = null
        }
        // })
        return s;
    }

    selectGame(game) {
        this.showMessage('Loading game data...')
        this.checkGameState(game).then(() => {
            this.showMessage('')
            return this.setState({state: 'play', selectedGame: game})
        });
    }

    claimWin(game) {
        this.state.gameContract.claimWin(game,
            { from: this.state.accounts[this.state.selectedAccountIdx],
                to: this.state.gameContract.address,
                gas: 15000000,
            }
        ).then((result) => {
            for (var i = 0; i < result.logs.length; i++) {
                var log = result.logs[i];

                if (log.event === "GameEnded" && log.args.gameId === game) {
                // We found the event!
                this.setState({win: game})
                break;
                }
            }
        }).catch(err => console.error(err))
    }

    render() {
        let tableStyle = {
            width: '50px',
            height: '50px',
            margin: '15px',
            padding: '15px',
            background: '#eee',
            cursor: 'pointer',
            outline: 'thin solid black'
        }
        return (
            <div className="App" >
                <nav className="navbar pure-menu pure-menu-horizontal">
                    <a href="#" className="pure-menu-heading pure-menu-link">Truffle Box</a>
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
                            <h2 onClick={() => this.changeState('create')} style={{color: 'blue', cursor: 'pointer'}}>Create new game!</h2>
                            <h2 onClick={() => this.changeState('join')} style={{color: 'blue', cursor: 'pointer'}}>Join game!</h2>
                            <h2 onClick={() => this.changeState('show')} style={{color: 'blue', cursor: 'pointer'}}>Show results!</h2>
                        </div>
                    </div>
                    { this.state.myGames.length > 0 && this.state.myGames.map(game => <span key={game} style={{'cursor': 'pointer'}} onClick={() => this.selectGame(game)}>Awaiting game: {game}<br/></span>)}
                    { (this.state.state === 'awaiting') && <h3>Awaiting your opponent!</h3>}
                    { (this.state.state === 'play') && <h3>You are in game!</h3>}
                    { (this.state.selectedGame.length > 0 && (this.state.state === 'play' || this.state.state === 'awaiting')) && (<div>
                        <h4>Turn for: {this.getSign(9)}</h4>
                        { (this.state.win && this.state.win === this.state.selectedGame) && <h2>You Won!</h2>}
                        { JSON.stringify(this.state.pots[this.state.selectedGame]) }
                        <table style={{cellborder: '10px', border: '1px solid #ccc'}}>
                        <tbody>
                            <tr>
                                <td style={tableStyle} onClick={() => !this.state.gameStates[this.state.selectedGame][0] ? this.makeMove(0) : false}>
                                    {this.getSign(0)}
                                </td>
                                <td style={tableStyle} onClick={() => !this.state.gameStates[this.state.selectedGame][1] ? this.makeMove(1) : false}>
                                    {this.getSign(1)}
                                </td>
                                <td style={tableStyle} onClick={() => !this.state.gameStates[this.state.selectedGame][2] ? this.makeMove(2) : false}>
                                    {this.getSign(2)}
                                </td>
                            </tr>
                            <tr>
                                <td style={tableStyle} onClick={() => !this.state.gameStates[this.state.selectedGame][3] ? this.makeMove(3) : false}>
                                    {this.getSign(3)}
                                </td>
                                <td style={tableStyle} onClick={() => !this.state.gameStates[this.state.selectedGame][4] ? this.makeMove(4) : false}>
                                    {this.getSign(4)}
                                </td>
                                <td style={tableStyle} onClick={() => !this.state.gameStates[this.state.selectedGame][5] ? this.makeMove(5) : false}>
                                    {this.getSign(5)}
                                </td>
                            </tr>
                            <tr>
                                <td style={tableStyle} onClick={() => !this.state.gameStates[this.state.selectedGame][6] ? this.makeMove(6) : false}>
                                    {this.getSign(6)}
                                </td>
                                <td style={tableStyle} onClick={() => !this.state.gameStates[this.state.selectedGame][7] ? this.makeMove(7) : false}>
                                    {this.getSign(7)}
                                </td>
                                <td style={tableStyle} onClick={() => !this.state.gameStates[this.state.selectedGame][8] ? this.makeMove(8) : false}>
                                    {this.getSign(8)}
                                </td>
                            </tr>
                        </tbody>
                        </table>
                        </div>)}
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
                            <h5>Account: {''+this.state.accounts[this.state.selectedAccountIdx]}</h5>
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
                                    P1:?, Pot: {this.state.pots[game].pot}, X:?</label><br />
                                </div>
                            ))}
                            <button type='submit'>Join game!</button>
                        </form>
                    )}
                </main>
            </div>
        );
    }
}

export default App