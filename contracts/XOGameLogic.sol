library XOGameLogic {
    struct State {
        int8[10] state;
        address playerX;
    }

    function setupState(State storage self, int8 nextPlayerColor) public {
        // Initialize state
        for (uint i = 0; i < 10; i++) {
            self.state[i] = 0; // defaultState is 0
        }
        self.state[9] = nextPlayerColor; // X goes first
    }

    function setState(State storage self, int8[10] newState, int8 nextPlayerColor) public {
        self.state = newState;
        self.state[9] = nextPlayerColor;
    }

    function makeMove(State storage self, bool isPlayerX, uint8 atIndex) public {
        int8 defaultState = 0;
        int8 playerColor = defaultState;

        if (isPlayerX) {
            playerColor = 1; // TIC
        } else {
            playerColor = -1; // TAC
        }

        assert((atIndex >= 0 && atIndex < 10));
        assert(self.state[atIndex] == defaultState);

        self.state[atIndex] = playerColor;
        self.state[9] = -playerColor; // update next player color
    }

    function isPlayerWinner(State storage self, address player) public constant returns (bool) {
        // 0 1 2,
        // 3 4 5,
        // 6 7 8,
        // 0 3 6,
        // 1 4 7,
        // 2 5 8,
        // 0 4 8,
        // 3 5 7
        int8 color = 0;
        if (player == self.playerX) {
            color = 1;
        } else {
            color = -1;
        }
        if (   ((self.state[0] == self.state[1])
             && (self.state[0] == self.state[2])
             && (self.state[0] == color))
            || ((self.state[3] == self.state[4])
             && (self.state[3] == self.state[5])
             && (self.state[3] == color))
            || ((self.state[6] == self.state[7])
             && (self.state[6] == self.state[8])
             && (self.state[6] == color))
            || ((self.state[0] == self.state[3])
             && (self.state[0] == self.state[6])
             && (self.state[0] == color))
            || ((self.state[1] == self.state[4])
             && (self.state[1] == self.state[7])
             && (self.state[1] == color))
            || ((self.state[2] == self.state[5])
             && (self.state[2] == self.state[8])
             && (self.state[2] == color))
            || ((self.state[0] == self.state[4])
             && (self.state[0] == self.state[8])
             && (self.state[0] == color))
            || ((self.state[3] == self.state[5])
             && (self.state[3] == self.state[7])
             && (self.state[3] == color))) {
            return true;
        }
        return false;
    }

    function checkGameEnded(State storage self) public constant returns (bool) {
        // true if no moves left
        bool ended = true;
        for (uint i = 0; i < 10; i++) {
            if (self.state[i] == 0) {
                ended = false;
                break;
            }
        }
        return ended;
    }
}
