/**
 * 牌的渲染和工具函数
 * 牌值: 3=3, 4=4, ..., 10=10, 11=J, 12=Q, 13=K, 14=A, 15=2, 16=小王, 17=大王
 * 花色: 0=黑桃♠, 1=红桃♥, 2=梅花♣, 3=方块♦, 4=小王, 5=大王
 */
const Cards = (function () {
    const RANK_NAMES = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'joker', 17: 'JOKER' };
    const SUIT_SYMBOLS = ['♠', '♥', '♣', '♦'];

    function getRankLabel(v) { return RANK_NAMES[v] || String(v); }
    function getSuitSymbol(s) { return SUIT_SYMBOLS[s] || ''; }
    function isRed(suit) { return suit === 1 || suit === 3 || suit === 5; }

    /**
     * 渲染一张牌
     */
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

    /**
     * 渲染牌背（对手牌）
     */
    function renderCardBack() {
        const el = document.createElement('div');
        el.className = 'card-back';
        return el;
    }

    /**
     * 识别牌型，返回 { type, value, length } 或 null
     * type: single, pair, bomb(3张), hydrogen(4张), doubleJoker
     */
    function identifyType(cards) {
        if (!cards || cards.length === 0) return null;
        const values = cards.map(c => c.value).sort((a, b) => a - b);

        // 双王炸弹
        if (cards.length === 2 && values[0] === 16 && values[1] === 17) {
            return { type: 'doubleJoker', value: 100, length: 2 };
        }

        // 单张
        if (cards.length === 1) {
            return { type: 'single', value: values[0], length: 1 };
        }

        // 同点数牌
        const allSame = values.every(v => v === values[0]);
        if (allSame) {
            if (cards.length === 2) return { type: 'pair', value: values[0], length: 2 };
            if (cards.length === 3) return { type: 'bomb', value: values[0], length: 3 };
            if (cards.length === 4) return { type: 'hydrogen', value: values[0], length: 4 };
        }

        return null; // 暂不支持连牌/连队
    }

    /**
     * 判断 newPlay 是否能压过 lastPlay
     */
    function canBeat(newPlay, lastPlay) {
        if (!lastPlay) return true; // 自由出牌
        if (!newPlay) return false;

        // 炸弹及以上可以压任意非炸弹牌型
        const bombTypes = ['bomb', 'hydrogen', 'doubleJoker'];
        const lastIsBomb = bombTypes.includes(lastPlay.type);
        const newIsBomb = bombTypes.includes(newPlay.type);

        if (newIsBomb && !lastIsBomb) return true;
        if (newIsBomb && lastIsBomb) {
            // 双王 > 氢弹(4张) > 炸弹(3张)
            const rank = { doubleJoker: 3, hydrogen: 2, bomb: 1 };
            if (rank[newPlay.type] !== rank[lastPlay.type]) {
                return rank[newPlay.type] > rank[lastPlay.type];
            }
            return newPlay.value > lastPlay.value;
        }

        // 同牌型比较
        if (newPlay.type !== lastPlay.type) return false;
        if (newPlay.length !== lastPlay.length) return false;

        // 2可以压任意单牌/对子
        if (newPlay.type === 'single' && newPlay.value === 15) return true;
        if (newPlay.type === 'pair' && newPlay.value === 15) return true;
        // 同是2的情况，2不能压2
        if (lastPlay.value === 15 && newPlay.value === 15) return false;

        return newPlay.value > lastPlay.value;
    }

    /**
     * 给手牌排序（从大到小）
     */
    function sortHand(hand) {
        return [...hand].sort((a, b) => {
            if (b.value !== a.value) return b.value - a.value;
            return b.suit - a.suit;
        });
    }

    return { renderCard, renderCardBack, identifyType, canBeat, sortHand, getRankLabel };
})();
