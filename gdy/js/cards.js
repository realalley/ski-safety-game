/**
 * 牌的渲染和工具函数（与 FC 端牌型判断保持一致）
 * 牌值: 3=3, 4=4, ..., 10=10, 11=J, 12=Q, 13=K, 14=A, 15=2, 16=小王, 17=大王
 * 花色: 0=黑桃♠, 1=红桃♥, 2=梅花♣, 3=方块♦, 4=小王, 5=大王
 */
const Cards = (function () {
    const RANK_NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'joker', 17: 'JOKER' };
    const SUIT_SYMBOLS = ['♠', '♥', '♣', '♦'];

    function getRankLabel(v) { return RANK_NAMES[v] || String(v); }
    function getSuitSymbol(s) { return SUIT_SYMBOLS[s] || ''; }
    function isRed(suit) { return suit === 1 || suit === 3 || suit === 5; }

    function renderCard(card, selected, onClick) {
        const el = document.createElement('div');
        el.className = 'card';
        if (card.suit >= 4) {
            el.classList.add(card.suit === 5 ? 'joker-red' : 'joker-black');
            el.innerHTML = `<span class="rank">${card.suit === 5 ? '大王' : '小王'}</span>`;
        } else {
            el.classList.add(isRed(card.suit) ? 'red' : 'black');
            el.innerHTML = `<span class="rank">${getRankLabel(card.value)}</span><span class="suit">${getSuitSymbol(card.suit)}</span>`;
        }
        if (selected) el.classList.add('selected');
        if (onClick) el.addEventListener('click', () => onClick(card));
        return el;
    }

    function renderCardBack() {
        const el = document.createElement('div');
        el.className = 'card-back';
        return el;
    }

    function checkStraight(realValues, jokerCount, length) {
        const realSet = new Set(realValues);
        if (realSet.has(15)) return null;
        if (new Set(realValues).size !== realValues.length) return null;
        for (let start = 3; start <= 14 - length + 1; start++) {
            const end = start + length - 1;
            let gaps = 0, outOfRange = false;
            for (let v = start; v <= end; v++) if (!realSet.has(v)) gaps++;
            for (const v of realValues) if (v < start || v > end) { outOfRange = true; break; }
            if (!outOfRange && gaps <= jokerCount) return { type: 'straight', value: end, length, pairCount: 0 };
        }
        return null;
    }

    function checkPairStraight(realValues, jokerCount, pairCount) {
        const countMap = {};
        realValues.forEach(v => { countMap[v] = (countMap[v] || 0) + 1; });
        if (countMap[15]) return null;
        for (let start = 3; start <= 14 - pairCount + 1; start++) {
            const end = start + pairCount - 1;
            let jokersNeeded = 0, valid = true, outOfRange = false;
            for (let v = start; v <= end; v++) {
                const cnt = countMap[v] || 0;
                if (cnt > 2) { valid = false; break; }
                jokersNeeded += (2 - cnt);
            }
            for (const v of realValues) if (v < start || v > end) { outOfRange = true; break; }
            if (valid && !outOfRange && jokersNeeded <= jokerCount) {
                return { type: 'pairStraight', value: end, length: pairCount * 2, pairCount };
            }
        }
        return null;
    }

    function identifyType(cards) {
        if (!cards || cards.length === 0) return null;
        const jokers = cards.filter(c => c.value >= 16);
        const realCards = cards.filter(c => c.value < 16);
        const jokerCount = jokers.length;
        if (jokerCount === cards.length) return null;
        if (cards.length === 1) return { type: 'single', value: realCards[0].value, length: 1 };
        if (cards.length === 2 && jokerCount === 2) {
            const hasSmall = jokers.some(j => j.value === 16);
            const hasBig = jokers.some(j => j.value === 17);
            if (hasSmall && hasBig) return { type: 'doubleJoker', value: 100, length: 2 };
            return null;
        }
        const values = realCards.map(c => c.value).sort((a, b) => a - b);
        const firstValue = values[0];
        const allRealSame = values.every(v => v === firstValue);
        if (allRealSame) {
            const total = cards.length;
            if (total === 2) return { type: 'pair', value: firstValue, length: 2 };
            if (total === 3) return { type: 'bomb', value: firstValue, length: 3 };
            if (total === 4) return { type: 'hydrogen', value: firstValue, length: 4 };
        }
        if (cards.length >= 3) {
            const s = checkStraight(values, jokerCount, cards.length);
            if (s) return s;
        }
        if (cards.length >= 4 && cards.length % 2 === 0) {
            const ps = checkPairStraight(values, jokerCount, cards.length / 2);
            if (ps) return ps;
        }
        return null;
    }

    function canBeat(newPlay, lastPlay) {
        if (!lastPlay) return true;
        if (!newPlay) return false;
        const bombTypes = ['bomb', 'hydrogen', 'doubleJoker'];
        const lastIsBomb = bombTypes.includes(lastPlay.type);
        const newIsBomb = bombTypes.includes(newPlay.type);
        if (newIsBomb && !lastIsBomb) return true;
        if (newIsBomb && lastIsBomb) {
            const rank = { doubleJoker: 3, hydrogen: 2, bomb: 1 };
            if (rank[newPlay.type] !== rank[lastPlay.type]) return rank[newPlay.type] > rank[lastPlay.type];
            return newPlay.value > lastPlay.value;
        }
        if (newPlay.type !== lastPlay.type) return false;
        if (newPlay.type === 'pairStraight') {
            if (newPlay.pairCount !== lastPlay.pairCount) return false;
            return newPlay.value > lastPlay.value;
        }
        if (newPlay.type === 'straight') {
            if (newPlay.length !== lastPlay.length) return false;
            return newPlay.value > lastPlay.value;
        }
        if (newPlay.type === 'single' && newPlay.value === 15) return lastPlay.value !== 15;
        if (newPlay.type === 'pair' && newPlay.value === 15) return lastPlay.value !== 15;
        return newPlay.value > lastPlay.value;
    }

    function sortHand(hand) {
        return [...hand].sort((a, b) => {
            if (b.value !== a.value) return b.value - a.value;
            return b.suit - a.suit;
        });
    }

    return { renderCard, renderCardBack, identifyType, canBeat, sortHand, getRankLabel };
})();
