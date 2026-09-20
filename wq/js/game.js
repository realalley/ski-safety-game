/**
 * 围棋游戏状态管理
 */
const Game = (function () {
    let room = null;
    let myPlayerId = null;
    let myColor = 1;
    let roomCode = null;
    let lastMoveCount = 0; // 用于检测新落子

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

    function vibrate(ms) {
        if (navigator.vibrate) navigator.vibrate(ms);
    }

    async function handleBoardClick(x, y) {
        if (!isMyTurn()) {
            showToast('还没轮到你');
            return;
        }
        try {
            const data = await Network.makeMove(roomCode, x, y);
            room = data.room;
            vibrate(15);
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
            vibrate(10);
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

        // 回合提示
        const turnText = document.getElementById('turnText');
        const turnDot = document.querySelector('.turn-dot');
        if (room.status === 'playing') {
            turnText.textContent = room.currentTurn === 1 ? '黑方行棋' : '白方行棋';
            turnDot.className = 'turn-dot' + (room.currentTurn === 2 ? ' white' : '');
        } else {
            turnText.textContent = '对局结束';
        }

        // 提子数
        document.getElementById('blackCaptures').textContent = room.captures[1] || 0;
        document.getElementById('whiteCaptures').textContent = room.captures[2] || 0;

        // 连续停一手指示
        const passInd = document.getElementById('passIndicator');
        if (room.consecutivePasses > 0 && room.status === 'playing') {
            passInd.style.display = 'flex';
            document.getElementById('passCount').textContent = room.consecutivePasses;
        } else {
            passInd.style.display = 'none';
        }

        // 我的执色标签
        const tag = document.getElementById('myColorTag');
        tag.textContent = myColor === 1 ? '执黑' : '执白';
        tag.className = 'color-tag' + (myColor === 2 ? ' white' : '');
    }

    /**
     * 轮询回调时调用，检测对手是否停一手
     */
    function onRoomUpdate(newRoom) {
        const oldCount = room ? room.moves.length : 0;
        room = newRoom;
        if (newRoom.moves.length > oldCount) {
            const last = newRoom.moves[newRoom.moves.length - 1];
            if (last.pass && last.p !== myColor) {
                showToast('对方停一手');
            }
        }
        render();
    }

    function showResult() {
        const modal = document.getElementById('resultModal');
        const title = document.getElementById('resultTitle');
        const score = document.getElementById('resultScore');
        const msg = document.getElementById('resultMessage');
        const icon = document.getElementById('resultIcon');

        if (room.score) {
            const s = room.score;
            const win = room.winner === myColor;
            title.textContent = win ? '你赢了！' : '你输了';
            icon.textContent = win ? '🏆' : '😔';
            score.innerHTML = `黑方: <b>${s.black}</b> 子　白方: <b>${s.white}</b> 子<br><span style="font-size:13px;color:#888;">(白方含贴目 ${s.komi} 子)</span>`;
            msg.innerHTML = `黑方提子 ${s.blackCaptures}　白方提子 ${s.whiteCaptures}<br><span style="font-size:12px;color:#aaa;">数子法计分（含空点归属）</span>`;
        } else {
            const win = room.winner === myColor;
            title.textContent = win ? '你赢了！' : '你输了';
            icon.textContent = win ? '🏆' : '😔';
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
        t._timer = setTimeout(() => t.classList.add('hidden'), 2200);
    }

    return {
        setRoom, getRoom, setRoomCode, getRoomCode,
        setMyInfo, getMyColor, getMyPlayer,
        isMyTurn,
        handleBoardClick, handlePass, handleResign,
        render, onRoomUpdate, showResult, showToast,
    };
})();
