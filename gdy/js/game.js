/**
 * 游戏状态管理与 UI 渲染（支持2-3人）
 */
const Game = (function () {
    let room = null;
    let myPlayerId = null;
    let myIndex = -1;
    let selectedCards = new Set();

    function init() { myPlayerId = Network.getPlayerId(); }
    function setRoom(r) { room = r; myIndex = r.players.findIndex(p => p.playerId === myPlayerId); }
    function getMyHand() { return myIndex < 0 || !room ? [] : Cards.sortHand(room.players[myIndex].hand || []); }
    function getOpponents() { return room ? room.players.filter((p, i) => i !== myIndex) : []; }
    function isMyTurn() { return room && room.currentPlayer === myIndex; }
    function canPass() { return room && room.lastPlay && room.lastPlay.playerIndex !== myIndex; }

    function toggleSelect(index) {
        if (selectedCards.has(index)) selectedCards.delete(index);
        else selectedCards.add(index);
    }
    function clearSelection() { selectedCards.clear(); }
    function getSelectedCards() {
        const hand = getMyHand();
        return Array.from(selectedCards).map(i => hand[i]).filter(Boolean);
    }
    function setSelectedCards(cards) {
        const hand = getMyHand();
        selectedCards.clear();
        cards.forEach(c => {
            const idx = hand.findIndex(h => h.value === c.value && h.suit === c.suit);
            if (idx >= 0) selectedCards.add(idx);
        });
    }

    function render() {
        if (!room) return;
        const hand = getMyHand();
        const opponents = getOpponents();

        document.getElementById('game-room-code').textContent = '#' + room.roomCode;
        const turnEl = document.getElementById('turn-indicator');
        if (room.status === 'playing') {
            const curName = room.players[room.currentPlayer] ? room.players[room.currentPlayer].name : '';
            turnEl.textContent = isMyTurn() ? '轮到你出牌' : curName + ' 出牌中...';
        } else { turnEl.textContent = ''; }

        // 对手区域（支持多个对手）
        const oppArea = document.querySelector('.opponent-area');
        oppArea.innerHTML = '';
        opponents.forEach(opp => {
            const info = document.createElement('div');
            info.className = 'opponent-info';
            const isCur = room.currentPlayer === room.players.indexOf(opp);
            const alarm = (opp.hand && opp.hand.length === 1) ? '<span class="alarm">报警!</span>' : '';
            info.innerHTML = `<span class="${isCur ? 'cur-turn' : ''}">${opp.name}</span>
                <span class="count">${opp.hand ? opp.hand.length : 0} 张</span>${alarm}`;
            oppArea.appendChild(info);

            const backWrap = document.createElement('div');
            backWrap.className = 'opponent-cards';
            const cnt = opp.hand ? opp.hand.length : 0;
            for (let i = 0; i < Math.min(cnt, 8); i++) backWrap.appendChild(Cards.renderCardBack());
            oppArea.appendChild(backWrap);
        });

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

        const msgEl = document.getElementById('message');
        msgEl.textContent = room.passMessage || '';

        // 按钮
        const btnPlay = document.getElementById('btn-play');
        const btnPass = document.getElementById('btn-pass');
        const btnHint = document.getElementById('btn-hint');
        const myTurn = isMyTurn();
        btnPlay.disabled = !myTurn;
        btnPass.disabled = !myTurn || !canPass();
        btnHint.disabled = !myTurn;
        btnPlay.style.opacity = myTurn ? 1 : 0.5;
        btnPass.style.opacity = (myTurn && canPass()) ? 1 : 0.5;
        btnHint.style.opacity = myTurn ? 1 : 0.5;
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
        btnStart.style.display = (room.players.length >= 2 && myIndex === 0) ? 'block' : 'none';
    }

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
    }

    return { init, setRoom, getMyHand, getOpponents, isMyTurn, canPass, getSelectedCards, setSelectedCards, clearSelection, render, renderWaiting, showScreen };
})();
