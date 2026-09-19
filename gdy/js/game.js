/**
 * 游戏状态管理与 UI 渲染
 */
const Game = (function () {
    let room = null;
    let myPlayerId = null;
    let myIndex = -1;
    let selectedCards = new Set(); // 选中的牌索引

    function init() {
        myPlayerId = Network.getPlayerId();
    }

    function setRoom(r) {
        room = r;
        myIndex = r.players.findIndex(p => p.playerId === myPlayerId);
    }

    function getMyHand() {
        if (myIndex < 0 || !room) return [];
        return Cards.sortHand(room.players[myIndex].hand || []);
    }

    function getOpponent() {
        if (!room) return null;
        return room.players.find((p, i) => i !== myIndex);
    }

    function isMyTurn() {
        return room && room.currentPlayer === myIndex;
    }

    function canPass() {
        // 只有当上家出了牌（不是自由出牌）时才能过
        return room && room.lastPlay && room.lastPlay.playerIndex !== myIndex;
    }

    function toggleSelect(index) {
        if (selectedCards.has(index)) selectedCards.delete(index);
        else selectedCards.add(index);
    }

    function clearSelection() {
        selectedCards.clear();
    }

    function getSelectedCards() {
        const hand = getMyHand();
        return Array.from(selectedCards).map(i => hand[i]).filter(Boolean);
    }

    /**
     * 渲染游戏界面
     */
    function render() {
        if (!room) return;
        const hand = getMyHand();
        const opponent = getOpponent();

        // 房间号
        document.getElementById('game-room-code').textContent = '房间号: ' + room.roomCode;

        // 回合提示
        const turnEl = document.getElementById('turn-indicator');
        if (room.status === 'playing') {
            turnEl.textContent = isMyTurn() ? '轮到你出牌' : (opponent ? opponent.name + ' 出牌中...' : '');
        } else {
            turnEl.textContent = '';
        }

        // 对手信息
        if (opponent) {
            document.getElementById('opponent-name').textContent = opponent.name;
            document.getElementById('opponent-count').textContent = (opponent.hand ? opponent.hand.length : 0) + ' 张';
            document.getElementById('opponent-alarm').style.display = (opponent.hand && opponent.hand.length === 1) ? 'inline' : 'none';
            const backEl = document.getElementById('opponent-back');
            backEl.innerHTML = '';
            const cnt = opponent.hand ? opponent.hand.length : 0;
            for (let i = 0; i < Math.min(cnt, 8); i++) backEl.appendChild(Cards.renderCardBack());
        }

        // 我的信息
        document.getElementById('my-name').textContent = Network.getPlayerName();
        document.getElementById('my-count').textContent = hand.length + ' 张';
        document.getElementById('my-alarm').style.display = hand.length === 1 ? 'inline' : 'none';

        // 我的手牌
        const handEl = document.getElementById('my-hand');
        handEl.innerHTML = '';
        hand.forEach((card, i) => {
            const el = Cards.renderCard(card, selectedCards.has(i), () => {
                if (isMyTurn()) { toggleSelect(i); render(); }
            });
            handEl.appendChild(el);
        });

        // 上一手牌
        const lastEl = document.getElementById('last-cards');
        const lastPlayerEl = document.getElementById('last-player');
        lastEl.innerHTML = '';
        if (room.lastPlay && room.lastPlay.cards && room.lastPlay.cards.length > 0) {
            const lastPlayer = room.players[room.lastPlay.playerIndex];
            lastPlayerEl.textContent = (lastPlayer ? lastPlayer.name : '') + ' 出：';
            room.lastPlay.cards.forEach(c => lastEl.appendChild(Cards.renderCard(c)));
        } else {
            lastPlayerEl.textContent = '自由出牌';
        }

        // 消息
        const msgEl = document.getElementById('message');
        if (room.passMessage) {
            msgEl.textContent = room.passMessage;
        } else if (room.status === 'waiting') {
            msgEl.textContent = '等待开始...';
        } else {
            msgEl.textContent = '';
        }

        // 按钮状态
        const btnPlay = document.getElementById('btn-play');
        const btnPass = document.getElementById('btn-pass');
        const myTurn = isMyTurn();
        btnPlay.disabled = !myTurn;
        btnPass.disabled = !myTurn || !canPass();
        btnPlay.style.opacity = myTurn ? 1 : 0.5;
        btnPass.style.opacity = (myTurn && canPass()) ? 1 : 0.5;
    }

    function renderWaiting() {
        if (!room) return;
        document.getElementById('display-room-code').textContent = room.roomCode;
        const listEl = document.getElementById('waiting-player-list');
        listEl.innerHTML = '';
        room.players.forEach(p => {
            const el = document.createElement('div');
            el.className = 'player-item' + (p.isDealer ? ' dealer' : '');
            el.textContent = p.name + (p.isDealer ? ' (庄家)' : '');
            listEl.appendChild(el);
        });
        const btnStart = document.getElementById('btn-start');
        if (room.players.length >= 2) {
            btnStart.style.display = 'block';
            btnStart.style.display = myIndex === 0 ? 'block' : 'none';
        } else {
            btnStart.style.display = 'none';
        }
    }

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    return { init, setRoom, getMyHand, getOpponent, isMyTurn, canPass, getSelectedCards, clearSelection, render, renderWaiting, showScreen };
})();
