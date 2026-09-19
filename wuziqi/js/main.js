/**
 * 入口模块
 * 屏幕切换、事件绑定、重连逻辑
 */
window.addEventListener('load', () => {
    Game.init();
    Board.init(document.getElementById('board'), (x, y) => {
        if (Game.state.screen === 'playing' && Game.state.currentTurn === Game.state.myColor) {
            Game.applyMove(x, y);
        }
    });

    // 暴露给 game.js 的回调
    window.__onGameEnd = (title, detail) => {
        document.getElementById('resultTitle').textContent = title;
        document.getElementById('resultDetail').textContent = detail;
        showScreen('result');
    };

    bindEvents();
    attemptReconnect();
});

// ============ 屏幕切换 ============

function showScreen(name) {
    ['menuScreen', 'waitingScreen', 'resultScreen'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });

    if (name === 'menu') {
        document.getElementById('menuScreen').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
    } else if (name === 'waiting') {
        document.getElementById('waitingScreen').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
    } else if (name === 'playing') {
        document.getElementById('menuScreen').classList.add('hidden');
        document.getElementById('waitingScreen').classList.add('hidden');
        document.getElementById('hud').classList.remove('hidden');
    } else if (name === 'result') {
        document.getElementById('resultScreen').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
    }
}

// ============ 事件绑定 ============

function bindEvents() {
    // 创建房间
    document.getElementById('createBtn').addEventListener('click', onCreateRoom);

    // 加入房间
    document.getElementById('joinBtn').addEventListener('click', onJoinRoom);
    document.getElementById('joinInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') onJoinRoom();
    });
    document.getElementById('joinInput').addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    // 复制房间号
    document.getElementById('copyBtn').addEventListener('click', onCopyCode);

    // 取消等待
    document.getElementById('cancelWaitBtn').addEventListener('click', onCancelWait);

    // 认输
    document.getElementById('resignBtn').addEventListener('click', onResign);

    // 返回菜单
    document.getElementById('backMenuBtn').addEventListener('click', onBackMenu);
}

// ============ 事件处理 ============

async function onCreateRoom() {
    try {
        const data = await Network.createRoom();
        Game.state.roomCode = data.roomCode;
        Game.state.myColor = data.color;
        Game.syncFromRoom(data.room);

        document.getElementById('roomCodeDisplay').textContent = data.roomCode;
        document.getElementById('waitingTip').textContent = '等待好友加入…';
        showScreen('waiting');

        // 轮询等待对手加入
        Network.startPoll(data.roomCode, (room, error) => {
            if (error) {
                showToast(error);
                return;
            }
            if (room.status === 'playing') {
                Network.stopPoll();
                Game.startGame(data.roomCode, data.color, room);
                updateHUD();
                showScreen('playing');
            }
        });
    } catch (e) {
        showToast(e.message || '创建房间失败');
    }
}

async function onJoinRoom() {
    const code = document.getElementById('joinInput').value.trim().toUpperCase();
    if (code.length !== 6) {
        showToast('请输入6位房间号');
        return;
    }
    try {
        const data = await Network.joinRoom(code);
        Game.startGame(data.roomCode, data.color, data.room);
        updateHUD();
        showScreen('playing');
    } catch (e) {
        showToast(e.message || '加入房间失败');
    }
}

async function onCopyCode() {
    const code = document.getElementById('roomCodeDisplay').textContent;
    try {
        await navigator.clipboard.writeText(code);
        showToast('已复制房间号: ' + code);
    } catch (e) {
        // 降级方案
        const input = document.createElement('input');
        input.value = code;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('已复制: ' + code);
    }
}

function onCancelWait() {
    Network.stopPoll();
    Game.leaveGame();
    showScreen('menu');
}

async function onResign() {
    if (!confirm('确定认输吗？')) return;
    await Game.doResign();
}

function onBackMenu() {
    Game.leaveGame();
    showScreen('menu');
}

// ============ 重连 ============

async function attemptReconnect() {
    const savedCode = localStorage.getItem('wuziqi_roomCode');
    if (!savedCode) return;

    try {
        const data = await Network.getRoomState(savedCode);
        const room = data.room;
        const myId = Network.getPlayerId();

        // 验证玩家在房间中
        if (room.blackPlayer !== myId && room.whitePlayer !== myId) {
            localStorage.removeItem('wuziqi_roomCode');
            return;
        }

        // 确定颜色
        const myColor = room.blackPlayer === myId ? 1 : 2;

        if (room.status === 'finished') {
            // 游戏已结束
            Game.state.roomCode = savedCode;
            Game.state.myColor = myColor;
            Game.syncFromRoom(room);
            Game.onGameEnd();
        } else {
            Game.startGame(savedCode, myColor, room);
            updateHUD();
            showScreen('playing');
        }
    } catch (e) {
        localStorage.removeItem('wuziqi_roomCode');
    }
}

// ============ HUD 更新 ============

function updateHUD() {
    document.getElementById('hudRoomCode').textContent = Game.state.roomCode || '------';
    document.getElementById('hudMyColor').textContent = Game.state.myColor === 1 ? '黑' : '白';

    const turnText = Game.state.status === 'finished'
        ? '已结束'
        : Game.state.currentTurn === Game.state.myColor
            ? '你的回合'
            : '对手回合';
    document.getElementById('hudTurn').textContent = turnText;
}

// 暴露给 game.js 在状态变化时调用
window.__updateHUD = updateHUD;

// ============ Toast ============

let toastTimer = null;
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    // 强制重排
    void toast.offsetHeight;
    toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.classList.add('hidden'), 300);
    }, 2500);
}
