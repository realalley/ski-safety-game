/**
 * 游戏状态机
 * 管理本地棋盘状态、落子逻辑、与服务器同步
 */
const Game = (function () {
    const SIZE = 15;

    const state = {
        screen: 'menu',       // menu|waiting|playing|result
        roomCode: null,
        playerId: null,
        myColor: 0,            // 1=黑, 2=白
        board: [],
        currentTurn: 1,        // 当前该谁落
        status: 'waiting',     // waiting|playing|finished
        winner: null,          // null|1|2|"draw"
        winLine: null,
        lastMove: null,
        submitting: false,     // 防双击锁
    };

    /**
     * 初始化空棋盘
     */
    function init() {
        state.playerId = Network.getPlayerId();
        resetBoard();
    }

    function resetBoard() {
        state.board = [];
        for (let i = 0; i < SIZE; i++) {
            state.board.push(new Array(SIZE).fill(0));
        }
        state.currentTurn = 1;
        state.status = 'waiting';
        state.winner = null;
        state.winLine = null;
        state.lastMove = null;
        state.submitting = false;
    }

    /**
     * 从服务器数据同步状态
     */
    function syncFromRoom(room) {
        state.board = room.board;
        state.currentTurn = room.currentTurn;
        state.status = room.status;
        state.winner = room.winner;
        state.winLine = room.winLine;
        // 取最后一步
        if (room.moves && room.moves.length > 0) {
            const last = room.moves[room.moves.length - 1];
            state.lastMove = { x: last.x, y: last.y };
        }
        render();
        if (window.__updateHUD) window.__updateHUD();
    }

    /**
     * 尝试落子（乐观更新）
     */
    async function applyMove(x, y) {
        if (state.submitting) return;
        if (state.status !== 'playing') return;
        if (state.currentTurn !== state.myColor) return;
        if (state.board[y][x] !== 0) return;

        state.submitting = true;

        // 乐观更新：先画棋子
        state.board[y][x] = state.myColor;
        state.lastMove = { x, y };
        render();

        try {
            const data = await Network.makeMove(state.roomCode, x, y);
            // 服务器返回最终状态，同步
            syncFromRoom(data.room);

            if (state.status === 'finished') {
                onGameEnd();
            } else {
                // 切换到对手回合，开始轮询
                Network.startPoll(state.roomCode, onPollUpdate);
            }
        } catch (e) {
            // 回退
            state.board[y][x] = 0;
            state.lastMove = null;
            render();
            showToast(e.message || '落子失败');
        } finally {
            state.submitting = false;
        }
    }

    /**
     * 轮询回调
     */
    function onPollUpdate(room, error) {
        if (error) {
            showToast(error);
            return;
        }
        syncFromRoom(room);

        if (state.status === 'finished') {
            Network.stopPoll();
            onGameEnd();
        } else if (state.currentTurn === state.myColor) {
            // 轮到我了，停止轮询
            Network.stopPoll();
        }
    }

    /**
     * 游戏结束
     */
    function onGameEnd() {
        state.screen = 'result';
        let title, detail;
        if (state.winner === 'draw') {
            title = '平局';
            detail = '棋盘已满，势均力敌！';
        } else if (state.winner === state.myColor) {
            title = '你赢了！';
            detail = '五连珠成，干得漂亮！';
        } else {
            title = '你输了';
            detail = '再接再厉，下次必胜！';
        }
        if (window.__onGameEnd) window.__onGameEnd(title, detail);
    }

    /**
     * 认输
     */
    async function doResign() {
        if (state.status !== 'playing') return;
        Network.stopPoll();
        try {
            const data = await Network.resign(state.roomCode);
            syncFromRoom(data.room);
            onGameEnd();
        } catch (e) {
            showToast(e.message || '操作失败');
        }
    }

    /**
     * 渲染棋盘
     */
    function render() {
        Board.draw(state.board, state.lastMove, state.winLine);
    }

    /**
     * 开始游戏（房间已创建或加入）
     */
    function startGame(roomCode, myColor, room) {
        state.roomCode = roomCode;
        state.myColor = myColor;
        resetBoard();
        syncFromRoom(room);
        state.screen = 'playing';
        localStorage.setItem('wuziqi_roomCode', roomCode);

        // 如果不是我的回合，开始轮询
        if (state.status === 'playing' && state.currentTurn !== state.myColor) {
            Network.startPoll(state.roomCode, onPollUpdate);
        }
    }

    /**
     * 离开游戏，回菜单
     */
    function leaveGame() {
        Network.stopPoll();
        localStorage.removeItem('wuziqi_roomCode');
        resetBoard();
        state.roomCode = null;
        state.myColor = 0;
        state.screen = 'menu';
        render();
    }

    return {
        state,
        init,
        startGame,
        applyMove,
        doResign,
        leaveGame,
        render,
        syncFromRoom,
        onGameEnd,
    };
})();
