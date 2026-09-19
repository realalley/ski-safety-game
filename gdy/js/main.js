/**
 * 主入口 - 屏幕切换与事件绑定
 */
(function () {
    Game.init();
    let currentCode = null;

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    // ========== 首页 ==========
    document.getElementById('btn-create').addEventListener('click', async () => {
        const name = document.getElementById('player-name').value.trim();
        if (!name) { alert('请输入昵称'); return; }
        Network.setPlayerName(name);
        try {
            const data = await Network.createRoom();
            currentCode = data.roomCode;
            Game.setRoom(data.room);
            Game.renderWaiting();
            showScreen('waiting-screen');
            Network.startPoll(currentCode, (room, err) => {
                if (err) { alert(err); return; }
                Game.setRoom(room);
                if (room.status === 'playing') {
                    showScreen('game-screen');
                    Game.render();
                } else if (room.status === 'finished') {
                    showResult(room);
                } else {
                    Game.renderWaiting();
                }
            });
        } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-join').addEventListener('click', async () => {
        const name = document.getElementById('player-name').value.trim();
        const code = document.getElementById('room-code').value.trim().toUpperCase();
        if (!name) { alert('请输入昵称'); return; }
        if (!code || code.length !== 6) { alert('请输入6位房间号'); return; }
        Network.setPlayerName(name);
        try {
            const data = await Network.joinRoom(code);
            currentCode = code;
            Game.setRoom(data.room);
            Game.renderWaiting();
            showScreen('waiting-screen');
            Network.startPoll(currentCode, (room, err) => {
                if (err) { alert(err); return; }
                Game.setRoom(room);
                if (room.status === 'playing') {
                    showScreen('game-screen');
                    Game.render();
                } else if (room.status === 'finished') {
                    showResult(room);
                } else {
                    Game.renderWaiting();
                }
            });
        } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-rules').addEventListener('click', () => {
        document.getElementById('rules-modal').classList.add('active');
    });
    document.getElementById('btn-close-rules').addEventListener('click', () => {
        document.getElementById('rules-modal').classList.remove('active');
    });

    // ========== 等待页 ==========
    document.getElementById('btn-copy').addEventListener('click', () => {
        const code = document.getElementById('display-room-code').textContent;
        navigator.clipboard.writeText(code).then(() => alert('房间号已复制: ' + code));
    });

    document.getElementById('btn-start').addEventListener('click', async () => {
        try {
            const data = await Network.startGame(currentCode);
            Game.setRoom(data.room);
            showScreen('game-screen');
            Game.render();
        } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-leave-waiting').addEventListener('click', () => {
        Network.stopPoll();
        Network.leaveRoom(currentCode);
        showScreen('home-screen');
    });

    // ========== 游戏页 ==========
    document.getElementById('btn-play').addEventListener('click', async () => {
        const cards = Game.getSelectedCards();
        if (cards.length === 0) { alert('请选择要出的牌'); return; }
        const playType = Cards.identifyType(cards);
        if (!playType) { alert('无效牌型'); return; }
        try {
            const data = await Network.playCards(currentCode, cards);
            Game.setRoom(data.room);
            Game.clearSelection();
            Game.render();
            if (data.room.status === 'finished') {
                setTimeout(() => showResult(data.room), 500);
            }
        } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-pass').addEventListener('click', async () => {
        try {
            const data = await Network.pass(currentCode);
            Game.setRoom(data.room);
            Game.clearSelection();
            Game.render();
        } catch (e) { alert(e.message); }
    });

    document.getElementById('btn-hint').addEventListener('click', () => {
        alert('提示功能开发中');
    });

    document.getElementById('btn-leave-game').addEventListener('click', () => {
        if (!confirm('确定退出游戏？')) return;
        Network.stopPoll();
        Network.leaveRoom(currentCode);
        showScreen('home-screen');
    });

    // ========== 结算页 ==========
    function showResult(room) {
        Network.stopPoll();
        showScreen('result-screen');
        const titleEl = document.getElementById('result-title');
        const contentEl = document.getElementById('result-content');
        const myPlayer = room.players.find(p => p.playerId === Network.getPlayerId());
        const winner = room.players.find(p => p.hand && p.hand.length === 0);
        if (winner && winner.playerId === Network.getPlayerId()) {
            titleEl.textContent = '🎉 你赢了！';
        } else if (winner) {
            titleEl.textContent = '😢 你输了';
        } else {
            titleEl.textContent = '游戏结束';
        }
        contentEl.innerHTML = room.players.map(p => {
            const isWinner = p.hand && p.hand.length === 0;
            return `<div class="result-item ${isWinner ? 'winner' : ''}">
                <span>${p.name}${isWinner ? ' 🏆' : ''}</span>
                <span>${p.hand ? p.hand.length : 0} 张</span>
            </div>`;
        }).join('');
    }

    document.getElementById('btn-again').addEventListener('click', () => {
        showScreen('home-screen');
    });
    document.getElementById('btn-home').addEventListener('click', () => {
        showScreen('home-screen');
    });
})();
