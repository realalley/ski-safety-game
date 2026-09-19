/**
 * 象棋主入口 - 页面切换与事件绑定
 */
const Main = (function () {
    let currentCode = null;

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    function showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.remove('hidden');
        setTimeout(() => t.classList.add('hidden'), 2000);
    }

    function showResult(room) {
        const me = Game.getMyPlayer();
        const won = room.winner === me.color;
        document.getElementById('resultTitle').textContent = won ? '胜利！' : '失败';
        document.getElementById('resultTitle').style.color = won ? '#ffd700' : '#ff6b6b';

        const opp = Game.getOpponent();
        const content = document.getElementById('resultContent');
        content.innerHTML = `
            <div class="result-item ${won ? 'winner' : ''}">${me.name} (${me.color === 'red' ? '红方' : '黑方'}) ${won ? '胜' : '负'}</div>
            <div class="result-item ${!won ? 'winner' : ''}">${opp ? opp.name : '对手'} (${opp && opp.color === 'red' ? '红方' : '黑方'}) ${!won ? '胜' : '负'}</div>
            <div class="result-item">步数: ${room.moves.length}</div>
        `;
        showScreen('resultScreen');
        Network.stopPoll();
    }

    async function onCreateRoom() {
        const name = document.getElementById('playerName').value.trim() || '玩家';
        try {
            const data = await Network.createRoom(name);
            currentCode = data.roomCode;
            Game.setRoom(data.room);
            Game.setMyInfo(data.playerId, data.color);
            Game.setRoomCode(currentCode);
            document.getElementById('roomCodeDisplay').textContent = currentCode;
            showScreen('waitingScreen');
            startWaitingPoll();
        } catch (e) { alert(e.message); }
    }

    async function onJoinRoom() {
        const code = document.getElementById('joinInput').value.trim().toUpperCase();
        const name = document.getElementById('playerName').value.trim() || '玩家';
        if (!code) { alert('请输入房间号'); return; }
        try {
            const data = await Network.joinRoom(code, name);
            currentCode = data.roomCode;
            Game.setRoom(data.room);
            Game.setMyInfo(data.playerId, data.color);
            Game.setRoomCode(currentCode);
            enterGame(data.room);
        } catch (e) { alert(e.message); }
    }

    function startWaitingPoll() {
        Network.startPoll(currentCode, (room, err) => {
            if (err) { console.error(err); return; }
            if (room.status === 'playing') {
                enterGame(room);
            } else {
                // 更新等待页玩家列表
                renderWaitingPlayers(room);
            }
        });
    }

    function renderWaitingPlayers(room) {
        const list = document.getElementById('waitingPlayerList');
        list.innerHTML = room.players.map(p =>
            `<div class="player-item">${p.name} (${p.color === 'red' ? '红方' : '黑方'})</div>`
        ).join('');
    }

    function enterGame(room) {
        Game.setRoom(room);
        const me = Game.getMyPlayer();
        Board.setMyColor(me.color);
        Board.init(room.board, Game.handleBoardClick);
        showScreen('gameScreen');
        document.getElementById('hudRoomCode').textContent = '#' + currentCode;
        document.getElementById('hudMyColor').textContent = me.color === 'red' ? '红方' : '黑方';
        updateHud(room);
        Network.startPoll(currentCode, (r, err) => {
            if (err) return;
            Game.setRoom(r);
            Game.render();
            updateHud(r);
            if (r.status === 'finished') {
                setTimeout(() => showResult(r), 500);
            }
        });
    }

    function updateHud(room) {
        const me = Game.getMyPlayer();
        const turnEl = document.getElementById('hudTurn');
        if (room.status === 'playing') {
            const myTurn = room.currentTurn === me.color;
            turnEl.textContent = myTurn ? '我方回合' : '对方回合';
            turnEl.style.color = myTurn ? '#34c759' : '#ff9500';
        } else {
            turnEl.textContent = '已结束';
        }
    }

    function onCopyCode() {
        const code = document.getElementById('roomCodeDisplay').textContent;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(code);
            showToast('已复制房间号');
        }
    }

    async function onResign() {
        if (!confirm('确定认输吗？')) return;
        try {
            const data = await Network.resign(currentCode);
            Game.setRoom(data.room);
        } catch (e) { alert(e.message); }
    }

    function onBackMenu() {
        Network.stopPoll();
        showScreen('menuScreen');
    }

    function init() {
        document.getElementById('createBtn').addEventListener('click', onCreateRoom);
        document.getElementById('joinBtn').addEventListener('click', onJoinRoom);
        document.getElementById('copyBtn').addEventListener('click', onCopyCode);
        document.getElementById('cancelWaitBtn').addEventListener('click', () => {
            Network.stopPoll();
            showScreen('menuScreen');
        });
        document.getElementById('resignBtn').addEventListener('click', onResign);
        document.getElementById('backMenuBtn').addEventListener('click', onBackMenu);

        // 回车加入
        document.getElementById('joinInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') onJoinRoom();
        });
    }

    return { init, showResult };
})();

document.addEventListener('DOMContentLoaded', Main.init);
