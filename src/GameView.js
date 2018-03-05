import React from 'react'

const SQUARE_SIZE = '50px';

const TicStyle = {
    table: {
        width: SQUARE_SIZE,
        height: SQUARE_SIZE,
        margin: '15px',
        padding: '15px',
        cursor: 'pointer',
        outline: 'thin solid black',
        display: 'cell',
    },
    div: {
        width: '100%',
        height: '100%',
        background: '#fffffd',
        'fontSize': '24pt',
        'textAlign': 'center',
    }
};

const TacStyle = {
    table: {
        width: SQUARE_SIZE,
        height: SQUARE_SIZE,
        margin: '15px',
        padding: '15px',
        cursor: 'pointer',
        outline: 'thin solid black',
        display: 'table-cell',
    },
    div: {
        width: '100%',
        height: '100%',
        background: '#fdffff',
        'fontSize': '24pt',
        'textAlign': 'center',
    }
};

const EmptyStyle = {
    table: {
        width: SQUARE_SIZE,
        height: SQUARE_SIZE,
        margin: '15px',
        padding: '15px',
        cursor: 'pointer',
        outline: 'thin solid black',
        display: 'table-cell',
    },
    div: {
        width: '100%',
        height: '100%',
        background: '#fff',
    }
};

const StateCell = ({state, kKey, clickHandler}) => {
    const style = state === 1 ? TicStyle : state === -1 ? TacStyle : EmptyStyle;
    const content = state === 1 ? 'X' : state === -1 ? 'O' : '';
    return (
        <td key={kKey} style={style.table} onClick={() => clickHandler(kKey)}>
            <div style={style.div}>{content}</div>
        </td>
    );
}

export const GameView = ({gameId, state, gameInfo, player, isXPlayer, makeMove}) => {
    let err = '';
    if (!(state && state.length === 10)) {
        err = 'State is broken!';
    }
    const nextPlayer = state[9] || '';
    const playerMap = {'1': 'X', '-1': 'O', '': '?'};
    // const myTurn = playerAddr === gameInfo.nextPlayer;

    const _make = (key) => makeMove(key);
    const turn = (isXPlayer && nextPlayer === 1) ? true : (!isXPlayer && nextPlayer === -1) ? true : false;

    return (
        <div>
            <h4>{gameId}</h4>
            {err && <span style={{padding: '10 15px', margin: '5px', bgcolor: '#eedcdc', color: 'black'}}>{err}</span>}
            { !gameInfo.ended && <h4>Turn for: {playerMap[nextPlayer]} {turn && <b>(Your turn!)</b>}</h4>}
            { (gameInfo.ended && gameInfo.winner === player) && <h2>You Won!</h2>}
            <table style={{cellborder: '10px', border: '1px solid #ccc', margin: '0 auto'}}>
            <tbody>
                {[...Array(3)].map((_, j) => 
                    <tr key={j}>
                        {[...Array(3)].map((_, i) =>
                            <StateCell state={state[j * 3 + i]} clickHandler={() => {_make(3 * j + i)}} key={3 * j + i} kKey={3 * j + i} />
                        )}
                    </tr>
                )}
            </tbody>
            </table>
        </div>
    );
}
