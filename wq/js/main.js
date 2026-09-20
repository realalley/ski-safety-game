/**
 * 围棋页面逻辑
 */
(function () {
    let selectedSize = 19;
    let selectedColor = 'random';

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    function showToast(msg) {
        const t = document.getElementById('toast');
        t.textContent = msg;
        t.classList.remove('hidden');
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.add('hidden'), 2200);
    }

    // 棋盘大小选择
    document.querySelectorAll('.size-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.size-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            selectedSize = parseInt(btn.dataset.size);
        });
    });

    // 执色选择
    document.querySelectorAll('.color-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            selectedColor = btn.dataset.color;
        });
    });

    // 创建房间
    document.getElementById('createBtn').addEventListener('click', async () => {
        try {
            const data = await Network.createRoom(selectedSize, selectedColor);
            Game.setRoomCode(data.roomCode);
            Game.setMyInfo(data.playerId, data.color);
            Game.setRoom(data.room);
            Network.saveSession(data.roomCode);
            document.getElementById('roomCodeDisplay').textContent = data.roomCode;
            showScreen('waitScreen');

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
        await doJoin(code);
    });

    async function doJoin(code) {
        try {
            const data = await Network.joinRoom(code);
            Game.setRoomCode(data.roomCode);
            Game.setMyInfo(data.playerId, data.color);
            Game.setRoom(data.room);
            Network.saveSession(data.roomCode);
            startGame(data.room);
        } catch (e) {
            showToast(e.message);
        }
    }

    // 复制房间号
    document.getElementById('copyBtn').addEventListener('click', async () => {
        const code = Game.getRoomCode();
        try {
            await navigator.clipboard.writeText(code);
            showToast('房间号已复制');
        } catch {
            // 降级方案
            const ta = document.createElement('textarea');
            ta.value = code;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('房间号已复制');
        }
    });

    // 分享链接
    document.getElementById('shareBtn').addEventListener('click', async () => {
        const code = Game.getRoomCode();
        const url = location.origin + location.pathname + '?room=' + code;
        try {
            if (navigator.share) {
                await navigator.share({ title: '围棋对弈', text: '来下一盘围棋吧！', url });
            } else {
                await navigator.clipboard.writeText(url);
                showToast('链接已复制');
            }
        } catch {
            try {
                await navigator.clipboard.writeText(url);
                showToast('链接已复制');
            } catch {
                showToast(url);
            }
        }
    });

    // 取消等待
    document.getElementById('cancelWaitBtn').addEventListener('click', () => {
        Network.stopPoll();
        Network.clearSession();
        showScreen('menuScreen');
    });

    // 返回
    document.getElementById('backBtn').addEventListener('click', () => {
        if (Game.getRoom() && Game.getRoom().status === 'playing') {
            if (!confirm('确定退出对局吗？')) return;
        }
        Network.stopPoll();
        Network.clearSession();
        showScreen('menuScreen');
    });

    // 停一手 / 认输
    document.getElementById('passBtn').addEventListener('click', () => Game.handlePass());
    document.getElementById('resignBtn').addEventListener('click', () => Game.handleResign());

    // 结算关闭
    document.getElementById('resultCloseBtn').addEventListener('click', () => {
        document.getElementById('resultModal').classList.remove('active');
        Network.stopPoll();
        Network.clearSession();
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
                Game.onRoomUpdate(r);
                if (r.status === 'finished') {
                    Network.stopPoll();
                    Network.clearSession();
                    Game.showResult();
                }
            }
        });
    }

    // 启动时检查：分享链接 / 断线重连
    async function autoRestore() {
        // 1. 分享链接 ?room=XXX
        const params = new URLSearchParams(location.search);
        const roomFromUrl = params.get('room');
        if (roomFromUrl && roomFromUrl.length === 6) {
            document.getElementById('roomCodeInput').value = roomFromUrl.toUpperCase();
            showToast('正在加入房间 ' + roomFromUrl.toUpperCase());
            await doJoin(roomFromUrl.toUpperCase());
            history.replaceState(null, '', location.pathname);
            return;
        }

        // 2. 断线重连：localStorage 保存的房间
        const savedCode = Network.getSavedRoomCode();
        if (savedCode) {
            try {
                const data = await Network.getRoomState(savedCode);
                const room = data.room;
                // 判断当前玩家是否在房间中
                const pid = Network.getPlayerId();
                if (room.status === 'playing' && (room.blackPlayer === pid || room.whitePlayer === pid)) {
                    const color = room.blackPlayer === pid ? 1 : 2;
                    Game.setRoomCode(savedCode);
                    Game.setMyInfo(pid, color);
                    showToast('已恢复对局');
                    startGame(room);
                    return;
                }
                // 如果是 waiting 状态且是创建者，回到等待页
                if (room.status === 'waiting' && (room.blackPlayer === pid || room.whitePlayer === pid)) {
                    const color = room.blackPlayer === pid ? 1 : 2;
                    Game.setRoomCode(savedCode);
                    Game.setMyInfo(pid, color);
                    Game.setRoom(room);
                    document.getElementById('roomCodeDisplay').textContent = savedCode;
                    showScreen('waitScreen');
                    Network.startPoll(savedCode, (r, err) => {
                        if (err) { showToast(err); return; }
                        if (r && r.status === 'playing') {
                            Network.stopPoll();
                            startGame(r);
                        }
                    });
                    return;
                }
            } catch (e) {
                // 房间不存在或已过期，清除
                Network.clearSession();
            }
        }
    }

    document.getElementById('roomCodeInput').addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });

    // 页面加载后自动恢复
    window.addEventListener('load', autoRestore);
})();
