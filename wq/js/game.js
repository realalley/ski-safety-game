/**
 * 围棋游戏状态管理
 */
const Game = (function () {
    let room = null;
    let myPlayerId = null;
    let myColor = 1;
    let roomCode = null;

    function setRoom(r) { room = r; }
    function getRoom() { return room; }
    function setRoomCode(c) { roomCode = c; }
    function getRoomCode() { return roomCode; }
    function setMyInfo(pid, color) { myPlayerId = pid; myColor = color; }
    function getMyColor() { return myColor; }
    function getMyPlayer() { return myPlayerId; }

    function isMyTurn() {
        if (!room) return false;
        return room.status === 'playing' && room.currentTurn === myColor;
    }

    function getOpponent() {
        if (!room) return null;
        return myColor === 1 ? room.whitePlayer : room.blackPlayer;
    }

    async function handleBoardClick(x, y) {
        if (!isMyTurn()) {
            showToast('还没轮到你');
            return;
        }
        try {
            const data = await Network.makeMove(roomCode, x, y);
            room = data.room;
            render();
        } catch (e) {
            showToast(e.message);
        }
    }

    async function handlePass() {
        if (!isMyTurn()) {
            showToast('还没轮到你');
            return;
        }
        try {
            const data = await Network.pass(roomCode);
            room = data.room;
            render();
            if (room.status === 'finished') showResult();
        } catch (e) {
            showToast(e.message);
        }
    }

    async function handleResign() {
        if (!confirm('确定认输吗？')) return;
        try {
            const data = await Network.resign(roomCode);
            room = data.room;
            showResult();
        } catch (e) {
            showToast(e.message);
        }
    }

    function render() {
        if (!room) return;
        const last = room.moves.length > 0 ? room.moves[room.moves.length - 1] : null;
        if (last && !last.pass) {
            Board.setLastMove({ x: last.x, y: last.y, p: last.p });
        } else {
            Board.setLastMove(null);
        }
        Board.draw(room.board);

        // 更新回合提示
        const turnText = document.getElementById('turnText');
        const turnDot = document.querySelector('.turn-dot');
        if (room.status === 'playing') {
            turnText.textContent = room.currentTurn === 1 ? '黑方' : '白方';
            turnDot.className = 'turn-dot' + (room.currentTurn === 2 ? ' white' : '');
        } else {
            turnText.textContent = '已结束';
        }

        // 更新提子数
        document.getElementById('blackCaptures').textContent = room.captures[1] || 0;
        document.getElementById('whiteCaptures').textContent = room.captures[2] || 0;
    }

    function showResult() {
        const modal = document.getElementById('resultModal');
        const title = document.getElementById('resultTitle');
        const score = document.getElementById('resultScore');
        const msg = document.getElementById('resultMessage');

        if (room.score) {
            const s = room.score;
            title.textContent = room.winner === myColor ? '你赢了！' : '你输了';
            score.innerHTML = `黑方: ${s.black} 子<br>白方: ${s.white} 子 (含贴目 ${s.komi})`;
            msg.textContent = `黑方提子 ${s.blackCaptures}，白方提子 ${s.whiteCaptures}`;
        } else {
            title.textContent = room.winner === myColor ? '你赢了！' : '你输了';
            score.innerHTML = '对方认输';
            msg.textContent = '';
        }
        modal.classList.add('active');
    }

    function showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.remove('hidden');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.add('hidden'), 2000);
    }

    return {
        setRoom, getRoom, setRoomCode, getRoomCode,
        setMyInfo, getMyColor, getMyPlayer,
        isMyTurn, getOpponent,
        handleBoardClick, handlePass, handleResign,
        render, showResult, showToast,
    };
})();
