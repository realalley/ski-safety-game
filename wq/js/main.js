/**
 * 围棋页面逻辑
 */
(function () {
    let selectedSize = 19;

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    function showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.remove('hidden');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.add('hidden'), 2000);
    }

    // 棋盘大小选择
    document.querySelectorAll('.size-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.size-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            selectedSize = parseInt(btn.dataset.size);
        });
    });

    // 创建房间
    document.getElementById('createBtn').addEventListener('click', async () => {
        try {
            const data = await Network.createRoom(selectedSize);
            Game.setRoomCode(data.roomCode);
            Game.setMyInfo(data.playerId, data.color);
            Game.setRoom(data.room);
            document.getElementById('roomCodeDisplay').textContent = data.roomCode;
            showScreen('waitScreen');

            // 轮询等待对手
            Network.startPoll(data.roomCode, (r, err) => {
                if (err) { showToast(err); return; }
                if (r && r.status === 'playing') {
                    Network.stopPoll();
                    startGame(r);
                }
            });
        } catch (e) {
            showToast(e.message);
        }
    });

    // 加入房间
    document.getElementById('joinBtn').addEventListener('click', async () => {
        const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
        if (code.length !== 6) { showToast('请输入6位房间号'); return; }
        try {
            const data = await Network.joinRoom(code);
            Game.setRoomCode(data.roomCode);
            Game.setMyInfo(data.playerId, data.color);
            Game.setRoom(data.room);
            startGame(data.room);
        } catch (e) {
            showToast(e.message);
        }
    });

    // 取消等待
    document.getElementById('cancelWaitBtn').addEventListener('click', () => {
        Network.stopPoll();
        showScreen('menuScreen');
    });

    // 返回
    document.getElementById('backBtn').addEventListener('click', () => {
        if (Game.getRoom() && Game.getRoom().status === 'playing') {
            if (!confirm('确定退出对局吗？')) return;
        }
        Network.stopPoll();
        showScreen('menuScreen');
    });

    // 停一手
    document.getElementById('passBtn').addEventListener('click', () => Game.handlePass());
    // 认输
    document.getElementById('resignBtn').addEventListener('click', () => Game.handleResign());

    // 结算关闭
    document.getElementById('resultCloseBtn').addEventListener('click', () => {
        document.getElementById('resultModal').classList.remove('active');
        Network.stopPoll();
        showScreen('menuScreen');
    });

    function startGame(room) {
        Game.setRoom(room);
        document.getElementById('gameRoomCode').textContent = Game.getRoomCode();
        Board.init(room.boardSize, room.board, Game.getMyColor(), (x, y) => Game.handleBoardClick(x, y));
        Game.render();
        showScreen('gameScreen');

        Network.startPoll(Game.getRoomCode(), (r, err) => {
            if (err) { showToast(err); return; }
            if (r) {
                Game.setRoom(r);
                Game.render();
                if (r.status === 'finished') {
                    Network.stopPoll();
                    Game.showResult();
                }
            }
        });
    }

    // 页面加载时自动聚焦输入框
    document.getElementById('roomCodeInput').addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
})();
