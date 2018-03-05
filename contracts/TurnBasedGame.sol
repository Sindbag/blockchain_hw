contract TurnBasedGame {
    bool debug; // If contract is deployed in debug mode, some debug features are enabled

    modifier debugOnly {
        require(debug);
        _;
    }

    event GameEnded(bytes32 indexed gameId);
    event GameClosed(bytes32 indexed gameId, address indexed player);
    event GameTimeoutStarted(bytes32 indexed gameId, uint timeoutStarted, int8 timeoutState);
    // GameDrawOfferRejected: notification that a draw of the currently turning player
    //                        is rejected by the waiting player
    event GameDrawOfferRejected(bytes32 indexed gameId);
    event DebugInts(string message, uint value1, uint value2, uint value3);

    struct Game {
        address player1;
        address player2;
        string player1Alias;
        string player2Alias;
        address nextPlayer;
        address winner;
        bool ended;
        uint pot; // What this game is worth: ether paid into the game
        uint player1Winnings;
        uint player2Winnings;
        uint turnTime; // in minutes
        uint timeoutStarted; // timer for timeout
        /*
         * -2 draw offered by nextPlayer
         * -1 draw offered by waiting player
         * 0 nothing
         * 1 win
         * 2 timeout
         */
        int8 timeoutState;
    }

    mapping (bytes32 => Game) public games;

    // stack of open game ids
    mapping (bytes32 => bytes32) public openGameIds;
    bytes32 public head;

    // stack of games of players
    mapping (address => mapping (bytes32 => bytes32)) public gamesOfPlayers;
    mapping (address => bytes32) public gamesOfPlayersHeads;

    function getGamesOfPlayer(address player) constant returns (bytes32[]) {
        var playerHead = gamesOfPlayersHeads[player];
        uint128 counter = 0;
        for (var ga = playerHead; ga != 0; ga = gamesOfPlayers[player][ga]) {
            counter++;
        }
        bytes32[] memory data = new bytes32[](counter);
        var currentGame = playerHead;
        for (uint128 i = 0; i < counter; i++) {
            data[i] = currentGame;
            currentGame = gamesOfPlayers[player][currentGame];
        }
        return data;
    }

    function getOpenGameIds() constant returns (bytes32[]) {
        uint128 counter = 0;
        for (var ga = head; ga != 'end'; ga = openGameIds[ga]) {
            counter++;
        }
        bytes32[] memory data = new bytes32[](counter);
        var currentGame = head;
        for (uint128 i = 0; i < counter; i++) {
            data[i] = currentGame;
            currentGame = openGameIds[currentGame];
        }
        return data;
    }

    // closes a game that is not currently running
    function closePlayerGame(bytes32 gameId) public {
        var game = games[gameId];

        // game already started and not finished yet
        require(game.player2 == 0 || game.ended);
        require(!(msg.sender != game.player1 && msg.sender != game.player2));
        if (!game.ended)
            games[gameId].ended = true;

        if (game.player2 == 0) {
            // Remove from openGameIds
            if (head == gameId) {
                head = openGameIds[head];
                openGameIds[gameId] = 0;
            } else {
                for (var g = head; g != 'end' && openGameIds[g] != 'end'; g = openGameIds[g]) {
                    if (openGameIds[g] == gameId) {
                        openGameIds[g] = openGameIds[gameId];
                        openGameIds[gameId] = 0;
                        break;
                    }
                }
            }
            games[gameId].player1Winnings = games[gameId].pot;
            games[gameId].pot = 0;
        }

        // Remove from gamesOfPlayers
        var playerHead = gamesOfPlayersHeads[msg.sender];
        if (playerHead == gameId) {
            gamesOfPlayersHeads[msg.sender] = gamesOfPlayers[msg.sender][playerHead];

            gamesOfPlayers[msg.sender][head] = 0;
        } else {
            for (var ga = playerHead; ga != 0 && gamesOfPlayers[msg.sender][ga] != 'end';
                    ga = gamesOfPlayers[msg.sender][ga]) {
                if (gamesOfPlayers[msg.sender][ga] == gameId) {
                    gamesOfPlayers[msg.sender][ga] = gamesOfPlayers[msg.sender][gameId];
                    gamesOfPlayers[msg.sender][gameId] = 0;
                    break;
                }
            }
        }

        GameClosed(gameId, msg.sender);
    }

    /**
     * Surrender = unilateral declaration of loss
     */
    function surrender(bytes32 gameId) notEnded(gameId) public {
        require(games[gameId].winner != 0); // Game already ended
        if (games[gameId].player1 == msg.sender) {
            // Player 1 surrendered, player 2 won
            games[gameId].winner = games[gameId].player2;
            games[gameId].player2Winnings = games[gameId].pot;
            games[gameId].pot = 0;
        } else if(games[gameId].player2 == msg.sender) {
            // Player 2 surrendered, player 1 won
            games[gameId].winner = games[gameId].player1;
            games[gameId].player1Winnings = games[gameId].pot;
            games[gameId].pot = 0;
        } else {
            // Sender is not a participant of this game
            throw;
        }

        games[gameId].ended = true;
        GameEnded(gameId);
    }

    /**
     * Allows the winner of a game to withdraw their ether
     * bytes32 gameId: ID of the game they have won
     */
    function withdraw(bytes32 gameId) public {
        uint payout = 0;
        if (games[gameId].player1 == msg.sender && games[gameId].player1Winnings > 0) {
            payout = games[gameId].player1Winnings;
            games[gameId].player1Winnings = 0;
            require(msg.sender.send(payout));
        } else if (games[gameId].player2 == msg.sender && games[gameId].player2Winnings > 0) {
            payout = games[gameId].player2Winnings;
            games[gameId].player2Winnings = 0;
            require(msg.sender.send(payout));
        } else {
            throw;
        }
    }

    function isGameEnded(bytes32 gameId) public constant returns (bool) {
        return games[gameId].ended;
    }

    modifier notEnded(bytes32 gameId) {
        require(!games[gameId].ended);
        _;
    }

    function initGame(string player1Alias, bool, uint turnTime) public payable returns (bytes32) {
        require(turnTime >= 5);

        // Generate game id based on player's addresses and current block number
        bytes32 gameId = keccak256(msg.sender, block.number);

        games[gameId].ended = false;
        games[gameId].turnTime = turnTime;
        games[gameId].timeoutState = 0;

        // Initialize participants
        games[gameId].player1 = msg.sender;
        games[gameId].player1Alias = player1Alias;
        games[gameId].player1Winnings = 0;
        games[gameId].player2Winnings = 0;

        // Initialize game value
        games[gameId].pot = msg.value * 2;

        // Add game to gamesOfPlayers
        gamesOfPlayers[msg.sender][gameId] = gamesOfPlayersHeads[msg.sender];
        gamesOfPlayersHeads[msg.sender] = gameId;

        // Add to openGameIds
        openGameIds[gameId] = head;
        head = gameId;

        return gameId;
    }

    /**
     * Join an initialized game
     * bytes32 gameId: ID of the game to join
     * string player2Alias: Alias of the player that is joining
     */
    function joinGame(bytes32 gameId, string player2Alias) payable public {
        // Check that this game does not have a second player yet
        require(games[gameId].player2 == 0 && games[gameId].player1 != 0);

        // throw if the second player did not match the bet.
        require(msg.value == games[gameId].pot);
        games[gameId].pot += msg.value;

        games[gameId].player2 = msg.sender;
        games[gameId].player2Alias = player2Alias;

        // Add game to gamesOfPlayers
        gamesOfPlayers[msg.sender][gameId] = gamesOfPlayersHeads[msg.sender];
        gamesOfPlayersHeads[msg.sender] = gameId;

        // Remove from openGameIds
        if (head == gameId) {
            head = openGameIds[head];
            openGameIds[gameId] = 0;
        } else {
            for (var g = head; g != "end" && openGameIds[g] != "end"; g = openGameIds[g]) {
                if (openGameIds[g] == gameId) {
                    openGameIds[g] = openGameIds[gameId];
                    openGameIds[gameId] = 0;
                    break;
                }
            }
        }
    }

    /* The sender claims he has won the game. Starts a timeout. */
    function claimWin(bytes32 gameId) notEnded(gameId) public {
        var game = games[gameId];
        // only for players
        require(!(msg.sender != game.player1 && msg.sender != game.player2));
        // only if timeout has not started
        require(game.timeoutState == 0);
        // you can only claim draw / victory in the enemies turn
        require(msg.sender != game.nextPlayer);

        game.timeoutStarted = now;
        game.timeoutState = 1;
        GameTimeoutStarted(gameId, game.timeoutStarted, game.timeoutState);
    }

    /* The sender offers the other player a draw. Starts a timeout. */
    function offerDraw(bytes32 gameId) notEnded(gameId) public {
        var game = games[gameId];
        // only for players
        if (msg.sender != game.player1 && msg.sender != game.player2)
            throw;
        // only if timeout has not started or is a draw by nextPlayer
        if (game.timeoutState != 0 && game.timeoutState != 2)
            throw;
        // if state = timeout, timeout has to be 2*timeoutTime
        if (game.timeoutState == 2 && now < game.timeoutStarted + 2 * game.turnTime * 1 minutes)
            throw;

        if (msg.sender == game.nextPlayer) {
            game.timeoutState = -2;
        } else {
            game.timeoutState = -1;
        }
        game.timeoutStarted = now;
        GameTimeoutStarted(gameId, game.timeoutStarted, game.timeoutState);
    }

    /*
     * The sender claims that the other player is not in the game anymore.
     * Starts a Timeout that can be claimed
     */
    function claimTimeout(bytes32 gameId) notEnded(gameId) public {
        var game = games[gameId];
        // only for players
        if (msg.sender != game.player1 && msg.sender != game.player2)
            throw;
        // only if timeout has not started
        if (game.timeoutState != 0)
            throw;
        // only claim draw / victory in the enemies turn
        if (msg.sender == game.nextPlayer)
            throw;
        game.timeoutStarted = now;
        game.timeoutState = 2;
        GameTimeoutStarted(gameId, game.timeoutStarted, game.timeoutState);
    }

    /*
     * The sender (waiting player) rejects the draw offered by the
     * other (turning / current) player.
     */
    function rejectCurrentPlayerDraw(bytes32 gameId) notEnded(gameId) public {
        var game = games[gameId];
        // only for players
        if (msg.sender != game.player1 && msg.sender != game.player2)
            throw;
        // only if timeout is present.
        if (game.timeoutState != -2)
            throw;
        // only not playing player is able to reject a draw offer of the nextPlayer.
        if (msg.sender == game.nextPlayer)
            throw;
        game.timeoutState = 0;
        GameDrawOfferRejected(gameId);
    }

    /* The sender claims a previously started timeout. */
    function claimTimeoutEnded(bytes32 gameId) notEnded(gameId) public {
        var game = games[gameId];
        // only for players
        require(msg.sender == game.player1 || msg.sender == game.player2);
        require(!(game.timeoutState == 0 || game.timeoutState == 2));
        if (now < game.timeoutStarted + game.turnTime * 1 minutes) // change to 1 minute for tests /* [game.turnTime *] */
            throw;
        if (msg.sender == game.nextPlayer) {
            if (game.timeoutState == -2) { // draw
                game.ended = true;
                games[gameId].player1Winnings = games[gameId].pot / 2;
                games[gameId].player2Winnings = games[gameId].pot / 2;
                games[gameId].pot = 0;
                GameEnded(gameId);
            } else {
                throw;
            }
        } else {
            if (game.timeoutState == -1) { // draw
                game.ended = true;
                games[gameId].player1Winnings = games[gameId].pot / 2;
                games[gameId].player2Winnings = games[gameId].pot / 2;
                games[gameId].pot = 0;
                GameEnded(gameId);
            } else if (game.timeoutState == 1) { // win
                game.ended = true;
                game.winner = msg.sender;
                if(msg.sender == game.player1) {
                    games[gameId].player1Winnings = games[gameId].pot;
                    games[gameId].pot = 0;
                } else {
                    games[gameId].player2Winnings = games[gameId].pot;
                    games[gameId].pot = 0;
                }
                GameEnded(gameId);
            } else {
                throw;
            }
        }
    }

    /* A timeout can be confirmed by the non-initializing player. */
    function confirmGameEnded(bytes32 gameId) notEnded(gameId) public {
        var game = games[gameId];
        // only for players
        require(msg.sender == game.player1 || msg.sender == game.player2);
        require(game.timeoutState != 0);
        if (msg.sender != game.nextPlayer) {
            if (game.timeoutState == -2) { // draw
                game.ended = true;
                games[gameId].player1Winnings = games[gameId].pot / 2;
                games[gameId].player2Winnings = games[gameId].pot / 2;
                games[gameId].pot = 0;
                GameEnded(gameId);
            } else {
                require(false);
            }
        } else {
            if (game.timeoutState == -1) { // draw
                game.ended = true;
                games[gameId].player1Winnings = games[gameId].pot / 2;
                games[gameId].player2Winnings = games[gameId].pot / 2;
                games[gameId].pot = 0;
                GameEnded(gameId);
            } else if (game.timeoutState == 1 || game.timeoutState == 2) { // win
                game.ended = true;
                if (msg.sender == game.player1) {
                    game.winner = game.player2;
                    games[gameId].player2Winnings = games[gameId].pot;
                    games[gameId].pot = 0;
                } else {
                    game.winner = game.player1;
                    games[gameId].player1Winnings = games[gameId].pot;
                    games[gameId].pot = 0;
                }
                GameEnded(gameId);
            } else {
                require(false);
            }
        }
    }

    function TurnBasedGame(bool enableDebugging) {
        debug = enableDebugging;
        head = 'end';
    }
}
