/**
 * 象棋游戏状态管理
 */
const Game = (function () {
    let room = null;
    let myPlayerId = null;
    let myColor = null;
    let selected = null;
    let roomCode = null;

    function setRoom(r) { room = r; }
    function getRoom() { return room; }
    function setMyInfo(id, color) { myPlayerId = id; myColor = color; }
    function getMyColor() { return myColor; }
    function setRoomCode(code) { roomCode = code; }
    function getRoomCode() { return roomCode; }

    function getMyPlayer() {
        if (!room) return null;
        return room.players.find(p => p.id === myPlayerId);
    }

    function isMyTurn() {
        if (!room || room.status !== 'playing') return false;
        return room.currentTurn === myColor;
    }

    function getOpponent() {
        if (!room) return null;
        return room.players.find(p => p.id !== myPlayerId);
    }

    /**
     * 处理棋盘点击
     */
    function handleBoardClick(x, y) {
        if (!isMyTurn()) return;
        if (!room) return;

        const piece = room.board[y][x];

        if (selected) {
            // 已有选中棋子
            if (selected.x === x && selected.y === y) {
                // 取消选中
                selected = null;
                Board.clearSelection();
                Board.draw(room.board);
                return;
            }

            // 点击了己方另一颗棋子，切换选中
            if (piece && piece.color === myColor) {
                selectPiece(x, y);
                return;
            }

            // 尝试走棋
            tryMove(selected.x, selected.y, x, y);
        } else {
            // 选中己方棋子
            if (piece && piece.color === myColor) {
                selectPiece(x, y);
            }
        }
    }

    function selectPiece(x, y) {
        selected = { x, y };
        const moves = Rules.getValidMoves(room.board, x, y);
        Board.setSelected(selected, moves);
        Board.draw(room.board);
    }

    async function tryMove(fx, fy, tx, ty) {
        try {
            const data = await Network.makeMove(roomCode, { x: fx, y: fy }, { x: tx, y: ty });
            room = data.room;
            selected = null;
            Board.clearSelection();
            Board.setLastMove(room.lastMove);
            Board.draw(room.board);
            if (room.status === 'finished') {
                setTimeout(() => Main.showResult(room), 300);
            }
        } catch (e) {
            // 走棋失败，取消选中
            selected = null;
            Board.clearSelection();
            Board.draw(room.board);
            alert(e.message);
        }
    }

    function getRoomCode() {
        return room ? room.roomCode : null;
    }

    function render() {
        if (!room) return;
        Board.setLastMove(room.lastMove);
        Board.draw(room.board);
    }

    return {
        setRoom, getRoom, setMyInfo, getMyColor,
        getMyPlayer, isMyTurn, getOpponent,
        handleBoardClick, render, getRoomCode,
    };
})();
