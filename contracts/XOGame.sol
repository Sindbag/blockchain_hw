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

    function move(bytes32 gameId, uint8 atIndex) notEnded(gameId) public {
        require(!games[gameId].ended);
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

    function checkForWinner(bytes32 gameId) public view returns (bool) {
        require(msg.sender == games[gameId].player1 || msg.sender == games[gameId].player2);
        return (gameStates[gameId].isPlayerWinner(msg.sender) || gameStates[gameId].checkGameEnded());
    }

    function endGameWithWinner(bytes32 gameId, address winner) private {
        require(msg.sender == games[gameId].player1 || msg.sender == games[gameId].player2);
        require(!games[gameId].ended); // Game not ended
        
        if (games[gameId].player2 == winner) {
            // Player 1 lost, player 2 won
            games[gameId].winner = games[gameId].player2;
            games[gameId].player2Winnings = games[gameId].pot;
            games[gameId].pot = 0;
        } else if (games[gameId].player1 == winner) {
            // Player 2 lost, player 1 won
            games[gameId].winner = games[gameId].player1;
            games[gameId].player1Winnings = games[gameId].pot;
            games[gameId].pot = 0;
        } else {
            // draw
            games[gameId].player1Winnings = games[gameId].pot / 2;
            games[gameId].player2Winnings = games[gameId].pot / 2;
            games[gameId].pot = 0;
        }

        games[gameId].ended = true;
        var game = games[gameId];
        recordResult(game.player1, game.player2, game.winner);
        ScoreUpdate(game.player1, getScore(game.player1));
        ScoreUpdate(game.player2, getScore(game.player2));
        GameEnded(gameId);
    }

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

    /* The sender claims he has won the game. */
    function claimWin(bytes32 gameId) notEnded(gameId) public {
        require(msg.sender == games[gameId].player1 || msg.sender == games[gameId].player2);

        address gameWinner;
        if (gameStates[gameId].isPlayerWinner(games[gameId].player1)) {
            gameWinner = games[gameId].player1;
        } else if (gameStates[gameId].isPlayerWinner(games[gameId].player2)) {
            gameWinner = games[gameId].player2;
        } else if (!gameStates[gameId].checkGameEnded()) {
            throw;
        }

        endGameWithWinner(gameId, gameWinner);
    }

}
