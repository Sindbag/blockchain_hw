import "./TurnBasedGame.sol";
import "./XOGameLogic.sol";

contract XOGame is TurnBasedGame {
    using XOGameLogic for XOGameLogic.State;

    mapping(bytes32 => XOGameLogic.State) gameStates;
    mapping(address => uint256) scores;

    function getScore(address player) constant returns(uint256) {
        return scores[player];
    }

    event GameInitialized(bytes32 indexed gameId, address indexed player1, string player1Alias, address playerX, uint turnTime, uint pot);
    event GameJoined(bytes32 indexed gameId, address indexed player1, string player1Alias, address indexed player2, string player2Alias, address playerX, uint pot);
    event GameStateChanged(bytes32 indexed gameId, int8[10] state);
    event MakeMove(bytes32 indexed gameId, address indexed player, uint8 atIndex);
    event ScoreUpdate(address indexed player, uint256 score);

    function XOGame(bool enableDebugging) TurnBasedGame(enableDebugging) {}

    /**
     * Initialize a new game
     * string player1Alias: Alias of the player creating the game
     * bool playX: Pass true or false depending on if the creator will play as TIC
     */
    function initGame(string player1Alias, bool playX, uint turnTime) public payable returns (bytes32) {
        bytes32 gameId = super.initGame(player1Alias, playX, turnTime);

        // Setup game state
        int8 nextPlayerColor = int8(1);
        gameStates[gameId].setupState(nextPlayerColor);
        if (playX) {
            // Player 1 will play as white
            gameStates[gameId].playerX = msg.sender;

            // Game starts with White, so here player 1
            games[gameId].nextPlayer = games[gameId].player1;
        }

        // Sent notification events
        GameInitialized(gameId, games[gameId].player1, player1Alias, gameStates[gameId].playerX, games[gameId].turnTime, games[gameId].pot);
        GameStateChanged(gameId, gameStates[gameId].state);
        return gameId;
    }

    /**
     * Join an initialized game
     * bytes32 gameId: ID of the game to join
     * string player2Alias: Alias of the player that is joining
     */
    function joinGame(bytes32 gameId, string player2Alias) public payable {
        super.joinGame(gameId, player2Alias);

        // If the other player isn't white, player2 will play as white
        if (gameStates[gameId].playerX == 0) {
            gameStates[gameId].playerX = msg.sender;
            // Game starts with White, so here player2
            games[gameId].nextPlayer = games[gameId].player2;
        }

        GameJoined(gameId, games[gameId].player1, games[gameId].player1Alias, games[gameId].player2, player2Alias, gameStates[gameId].playerX, games[gameId].pot);
    }

    /**
     * Set mark atIndex for state after verification.
    **/
    function moveFromState(bytes32 gameId, int8[10] state, uint8 atIndex) notEnded(gameId) public {
        // check if sender is one of players
        require(games[gameId].player1 == msg.sender || games[gameId].player2 == msg.sender);
        // check if step is made for the same situation as was
        for (var i = 0; i < 10; ++i) {
          require(state[i] == gameStates[gameId].state[i]);
        }
        // find opponent to msg.sender
        address opponent;
        if (msg.sender == games[gameId].player1) {
            opponent = games[gameId].player2;
        } else {
            opponent = games[gameId].player1;
        }

        int8 playerColor = msg.sender == gameStates[gameId].playerX ? int8(1) : int8(-1);

        // apply state
        gameStates[gameId].setState(state, playerColor);
        games[gameId].nextPlayer = msg.sender;

        // apply and verify move
        move(gameId, atIndex);
    }

    function move(bytes32 gameId, uint8 atIndex) notEnded(gameId) public {
        if ((games[gameId].timeoutState == 2) &&
                now >= (games[gameId].timeoutStarted + games[gameId].turnTime * 1 minutes) &&
                msg.sender != games[gameId].nextPlayer) {
            // Just a fake move to determine if there is a possible move left for timeout
            gameStates[gameId].makeMove(msg.sender != gameStates[gameId].playerX, atIndex);
        } else {
            require(games[gameId].nextPlayer == msg.sender);
            if (games[gameId].timeoutState != 0) {
                games[gameId].timeoutState = 0;
            }

            // Move validation
            gameStates[gameId].makeMove(msg.sender == gameStates[gameId].playerX, atIndex);

            // Set nextPlayer
            if (msg.sender == games[gameId].player1) {
                games[gameId].nextPlayer = games[gameId].player2;
            } else {
                games[gameId].nextPlayer = games[gameId].player1;
            }
        }

        // Send events
        MakeMove(gameId, msg.sender, atIndex);
        GameStateChanged(gameId, gameStates[gameId].state);
    }

    // /* Explicit set game state. Only in debug mode */
    // function setGameState(bytes32 gameId, int8[10] state, address nextPlayer) debugOnly public {
    //     int8 playerColor = nextPlayer == gameStates[gameId].playerX ? int8(1) : int8(-1);
    //     gameStates[gameId].setState(state, playerColor);
    //     games[gameId].nextPlayer = nextPlayer;
    //     GameStateChanged(gameId, gameStates[gameId].state);
    // }

    function getCurrentGameState(bytes32 gameId) constant returns (int8[10]) {
       return gameStates[gameId].state;
    }

    function getXPlayer(bytes32 gameId) constant returns (address) {
       return gameStates[gameId].playerX;
    }

    function surrender(bytes32 gameId) notEnded(gameId) public {
        super.surrender(gameId);

        // Update scores
        var game = games[gameId];
        recordResult(game.player1, game.player2, game.winner);
        ScoreUpdate(game.player1, getScore(game.player1));
        ScoreUpdate(game.player2, getScore(game.player2));
    }

    function recordResult(address p1, address p2, address winner) private {
      if (winner == p1) { // win p1
        scores[p1] += 2;
        scores[p2] -= 2;
      } else if (winner == p2) { // win p2
        scores[p2] += 2;
        scores[p1] -= 2;
      } else { // draw
        scores[p2] += 1;
        scores[p1] += 1;
      }
    }

    /* The sender claims he has won the game. Starts a timeout. */
    function claimWin(bytes32 gameId) notEnded(gameId) public {
        super.claimWin(gameId);

        // get the color of the player that wants to claim win
        int8 otherPlayerColor = gameStates[gameId].playerX == msg.sender ? int8(-1) : int8(1);

        // if he is not winner, the request is illegal
        require(gameStates[gameId].isWinner(otherPlayerColor));
        claimTimeoutEnded(gameId);
    }

    /*
     * The sender (currently waiting player) claims that the other (turning)
     * player timed out and has to provide a move, the other player could
     * have done to prevent the timeout.
     */
    function claimTimeoutEndedWithMove(bytes32 gameId, uint8 atIndex) notEnded(gameId) public {
        var game = games[gameId];
        // just the two players currently playing
        require(msg.sender == game.player1 || msg.sender == game.player2);
        require(now >= game.timeoutStarted + game.turnTime * 1 minutes);
        require(msg.sender != game.nextPlayer);
        require(game.timeoutState == 2);

        // TODO we need other move function
        // move is valid if it does not throw
        move(gameId, atIndex);

        game.ended = true;
        game.winner = msg.sender;
        if (msg.sender == game.player1) {
            games[gameId].player1Winnings = games[gameId].pot;
            games[gameId].pot = 0;
        } else {
            games[gameId].player2Winnings = games[gameId].pot;
            games[gameId].pot = 0;
        }

        // Update scores
        recordResult(game.player1, game.player2, game.winner);
        ScoreUpdate(game.player1, getScore(game.player1));
        ScoreUpdate(game.player2, getScore(game.player2));
        GameEnded(gameId);
    }

    /* The sender claims a previously started timeout. */
    function claimTimeoutEnded(bytes32 gameId) notEnded(gameId) public {
        super.claimTimeoutEnded(gameId);

        // Update scores
        var game = games[gameId];
        recordResult(game.player1, game.player2, game.winner);
        ScoreUpdate(game.player1, getScore(game.player1));
        ScoreUpdate(game.player2, getScore(game.player2));
    }

    /* A timeout can be confirmed by the non-initializing player. */
    function confirmGameEnded(bytes32 gameId) notEnded(gameId) public {
        super.confirmGameEnded(gameId);

        // Update scores
        var game = games[gameId];
        recordResult(game.player1, game.player2, game.winner);
        ScoreUpdate(game.player1, getScore(game.player1));
        ScoreUpdate(game.player2, getScore(game.player2));
    }

    /* This unnamed function is called whenever someone tries to send ether to the contract */
    function () {
        throw; // Prevents accidental sending of ether
    }
}
