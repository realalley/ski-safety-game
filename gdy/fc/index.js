/**
 * 干瞪眼光 FC 函数 - 完整版
 * 存储：阿里云 Tablestore（强一致）
 *
 * 牌值: 3-10, 11=J, 12=Q, 13=K, 14=A, 15=2, 16=小王, 17=大王
 * 花色: 0=黑桃, 1=红桃, 2=梅花, 3=方块, 4=小王, 5=大王
 *
 * 牌型: single, pair, straight(连牌), pairStraight(连队),
 *       bomb(炸弹3张), hydrogen(氢弹4张), doubleJoker(双王)
 *
 * 接口:
 *   POST /api/gdy/room                  创建房间
 *   GET  /api/gdy/room/:code            获取房间状态
 *   POST /api/gdy/room/:code/join       加入房间
 *   POST /api/gdy/room/:code/start      开始游戏
 *   POST /api/gdy/room/:code/play       出牌
 *   POST /api/gdy/room/:code/pass       过
 *   POST /api/gdy/room/:code/hint       提示
 *   POST /api/gdy/room/:code/leave      离开房间
 */

const TableStore = require('tablestore');

const TABLE_NAME = process.env.OTS_TABLE_NAME || 'gdy_room';
const ROOM_EXPIRE_MS = 2 * 60 * 60 * 1000;
const MAX_PLAYERS = 3;

let client = null;
function getClient() {
    if (!client) {
        client = new TableStore.Client({
            accessKeyId: process.env.OTS_AK_ID,
            secretAccessKey: process.env.OTS_AK_SECRET,
            endpoint: process.env.OTS_ENDPOINT,
            instancename: process.env.OTS_INSTANCE,
            maxRetries: 3,
        });
    }
    return client;
}

// ============ 工具 ============

function json(resp, data, status = 200) {
    resp.setStatusCode(status);
    resp.setHeader('Content-Type', 'application/json');
    resp.setHeader('Access-Control-Allow-Origin', '*');
    resp.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    resp.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    resp.send(JSON.stringify(data));
}
function fail(resp, error, status = 400) { json(resp, { success: false, error }, status); }

async function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
    });
}

function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ============ Tablestore ============

async function roomGet(code) {
    try {
        const res = await getClient().getRow({
            tableName: TABLE_NAME, primaryKey: [{ roomCode: code }], maxVersions: 1,
        });
        if (!res.row || !res.row.attributes) return null;
        const attr = {};
        res.row.attributes.forEach(a => { attr[a.columnName] = a.columnValue; });
        return JSON.parse(attr.data);
    } catch (e) {
        if (e.code === 'OTSObjectNotExist') return null;
        throw e;
    }
}

async function roomPut(code, room) {
    room.version = (room.version || 0) + 1;
    room.updatedAt = Date.now();
    await getClient().putRow({
        tableName: TABLE_NAME,
        condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
        primaryKey: [{ roomCode: code }],
        attributeColumns: [
            { data: JSON.stringify(room) },
            { expiresAt: room.expiresAt || Date.now() + ROOM_EXPIRE_MS },
        ],
    });
    return room;
}

// ============ 牌逻辑 ============

function createDeck() {
    const deck = [];
    for (let v = 3; v <= 14; v++) {
        for (let s = 0; s < 4; s++) deck.push({ value: v, suit: s });
    }
    for (let s = 0; s < 4; s++) deck.push({ value: 15, suit: s });
    deck.push({ value: 16, suit: 4 });
    deck.push({ value: 17, suit: 5 });
    return shuffle(deck);
}

/**
 * 检查连牌（straight）：3+连续单牌，3-A（不含2）
 * 王可补空缺
 */
function checkStraight(realValues, jokerCount, length) {
    const realSet = new Set(realValues);
    if (realSet.has(15)) return null;
    if (new Set(realValues).size !== realValues.length) return null;

    for (let start = 3; start <= 14 - length + 1; start++) {
        const end = start + length - 1;
        let gaps = 0;
        let outOfRange = false;
        for (let v = start; v <= end; v++) {
            if (!realSet.has(v)) gaps++;
        }
        for (const v of realValues) {
            if (v < start || v > end) { outOfRange = true; break; }
        }
        if (!outOfRange && gaps <= jokerCount) {
            return { type: 'straight', value: end, length, pairCount: 0 };
        }
    }
    return null;
}

/**
 * 检查连队（pairStraight）：2+连续对子，3-A（不含2）
 * 王可补对
 */
function checkPairStraight(realValues, jokerCount, pairCount) {
    const countMap = {};
    realValues.forEach(v => { countMap[v] = (countMap[v] || 0) + 1; });
    if (countMap[15]) return null;

    for (let start = 3; start <= 14 - pairCount + 1; start++) {
        const end = start + pairCount - 1;
        let jokersNeeded = 0;
        let valid = true;
        let outOfRange = false;
        for (let v = start; v <= end; v++) {
            const cnt = countMap[v] || 0;
            if (cnt > 2) { valid = false; break; }
            jokersNeeded += (2 - cnt);
        }
        for (const v of realValues) {
            if (v < start || v > end) { outOfRange = true; break; }
        }
        if (valid && !outOfRange && jokersNeeded <= jokerCount) {
            return { type: 'pairStraight', value: end, length: pairCount * 2, pairCount };
        }
    }
    return null;
}

/**
 * 识别牌型（支持王百搭）
 * 返回 { type, value, length, pairCount } 或 null
 */
function identifyType(cards) {
    if (!cards || cards.length === 0) return null;

    const jokers = cards.filter(c => c.value >= 16);
    const realCards = cards.filter(c => c.value < 16);
    const jokerCount = jokers.length;

    // 不能全是王
    if (jokerCount === cards.length) return null;

    // 单张：必须是实牌
    if (cards.length === 1) {
        return { type: 'single', value: realCards[0].value, length: 1 };
    }

    // 双王炸弹
    if (cards.length === 2 && jokerCount === 2) {
        const hasSmall = jokers.some(j => j.value === 16);
        const hasBig = jokers.some(j => j.value === 17);
        if (hasSmall && hasBig) return { type: 'doubleJoker', value: 100, length: 2 };
        return null;
    }

    const values = realCards.map(c => c.value).sort((a, b) => a - b);
    const firstValue = values[0];
    const allRealSame = values.every(v => v === firstValue);

    // 对子/炸弹/氢弹：实牌同值，王补齐
    if (allRealSame) {
        const total = cards.length;
        if (total === 2) return { type: 'pair', value: firstValue, length: 2 };
        if (total === 3) return { type: 'bomb', value: firstValue, length: 3 };
        if (total === 4) return { type: 'hydrogen', value: firstValue, length: 4 };
    }

    // 连牌
    if (cards.length >= 3) {
        const s = checkStraight(values, jokerCount, cards.length);
        if (s) return s;
    }

    // 连队（偶数张）
    if (cards.length >= 4 && cards.length % 2 === 0) {
        const ps = checkPairStraight(values, jokerCount, cards.length / 2);
        if (ps) return ps;
    }

    return null;
}

/**
 * 判断 newPlay 是否能压过 lastPlay
 */
function canBeat(newPlay, lastPlay) {
    if (!lastPlay) return true;
    if (!newPlay) return false;

    const bombTypes = ['bomb', 'hydrogen', 'doubleJoker'];
    const lastIsBomb = bombTypes.includes(lastPlay.type);
    const newIsBomb = bombTypes.includes(newPlay.type);

    // 炸弹压非炸弹
    if (newIsBomb && !lastIsBomb) return true;
    if (newIsBomb && lastIsBomb) {
        const rank = { doubleJoker: 3, hydrogen: 2, bomb: 1 };
        if (rank[newPlay.type] !== rank[lastPlay.type]) {
            return rank[newPlay.type] > rank[lastPlay.type];
        }
        return newPlay.value > lastPlay.value;
    }

    // 非炸弹必须同牌型
    if (newPlay.type !== lastPlay.type) return false;

    // 连队：对子数相同才能压
    if (newPlay.type === 'pairStraight') {
        if (newPlay.pairCount !== lastPlay.pairCount) return false;
        return newPlay.value > lastPlay.value;
    }

    // 连牌：长度相同才能压
    if (newPlay.type === 'straight') {
        if (newPlay.length !== lastPlay.length) return false;
        return newPlay.value > lastPlay.value;
    }

    // 单牌/对子：2可压任意（除了2本身）
    if (newPlay.type === 'single' && newPlay.value === 15) return lastPlay.value !== 15;
    if (newPlay.type === 'pair' && newPlay.value === 15) return lastPlay.value !== 15;

    return newPlay.value > lastPlay.value;
}

function cardsEqual(a, b) {
    return a.value === b.value && a.suit === b.suit;
}

function removeCardsFromHand(hand, cards) {
    return hand.filter(h => !cards.some(c => cardsEqual(h, c)));
}

// ============ 提示功能 ============

/**
 * 从手牌中找出能压过 lastPlay 的最小牌型
 * 返回要出的牌数组，或 null
 */
function findHint(hand, lastPlay) {
    // 按值分组
    const byValue = {};
    const jokers = [];
    hand.forEach(c => {
        if (c.value >= 16) jokers.push(c);
        else { (byValue[c.value] = byValue[c.value] || []).push(c); }
    });

    // 自由出牌：出最小单张
    if (!lastPlay) {
        const sorted = [...hand].filter(c => c.value < 16).sort((a, b) => a.value - b.value);
        if (sorted.length > 0) return [sorted[0]];
        if (hand.length > 0) return [hand[0]];
        return null;
    }

    const lt = lastPlay.type;
    const bombTypes = ['bomb', 'hydrogen', 'doubleJoker'];
    const lastIsBomb = bombTypes.includes(lt);

    // 同牌型压制（非炸弹）
    if (!lastIsBomb) {
        if (lt === 'single') {
            // 2压任意单牌
            if (byValue[15] && byValue[15].length > 0 && lastPlay.value !== 15) {
                return [byValue[15][0]];
            }
            // 找比lastPlay大的最小单牌
            for (let v = lastPlay.value + 1; v <= 14; v++) {
                if (byValue[v] && byValue[v].length > 0) return [byValue[v][0]];
            }
        } else if (lt === 'pair') {
            // 对2压任意对子
            if (byValue[15] && byValue[15].length >= 2 && lastPlay.value !== 15) {
                return byValue[15].slice(0, 2);
            }
            // 王+实牌组对子
            for (let v = lastPlay.value + 1; v <= 14; v++) {
                if (byValue[v] && byValue[v].length >= 2) return byValue[v].slice(0, 2);
                if (byValue[v] && byValue[v].length === 1 && jokers.length >= 1) {
                    return [byValue[v][0], jokers[0]];
                }
            }
        } else if (lt === 'straight') {
            // 找更长或更大的连牌（简化：只找同长度更大的）
            const len = lastPlay.length;
            for (let end = lastPlay.value + 1; end <= 14; end++) {
                const start = end - len + 1;
                if (start < 3) continue;
                const needed = [];
                let jokersNeeded = 0;
                for (let v = start; v <= end; v++) {
                    if (byValue[v] && byValue[v].length > 0) needed.push(byValue[v][0]);
                    else jokersNeeded++;
                }
                if (jokersNeeded <= jokers.length) {
                    return [...needed, ...jokers.slice(0, jokersNeeded)];
                }
            }
        } else if (lt === 'pairStraight') {
            const pc = lastPlay.pairCount;
            for (let end = lastPlay.value + 1; end <= 14; end++) {
                const start = end - pc + 1;
                if (start < 3) continue;
                const needed = [];
                let jokersNeeded = 0;
                let ok = true;
                for (let v = start; v <= end; v++) {
                    const cnt = byValue[v] ? byValue[v].length : 0;
                    if (cnt > 2) { ok = false; break; }
                    needed.push(...(byValue[v] || []).slice(0, 2));
                    jokersNeeded += (2 - cnt);
                }
                if (ok && jokersNeeded <= jokers.length) {
                    return [...needed, ...jokers.slice(0, jokersNeeded)];
                }
            }
        }
    }

    // 炸弹压制
    // 氢弹
    if (byValue[15] && byValue[15].length >= 4 && (!lastIsBomb || lt === 'bomb')) {
        return byValue[15].slice(0, 4);
    }
    for (let v = 3; v <= 14; v++) {
        if (byValue[v] && byValue[v].length >= 4) {
            if (!lastIsBomb || (lt === 'bomb' && v > lastPlay.value) || lt === 'bomb') {
                return byValue[v].slice(0, 4);
            }
        }
    }
    // 王+3张实牌组氢弹
    for (let v = 3; v <= 14; v++) {
        if (byValue[v] && byValue[v].length === 3 && jokers.length >= 1) {
            return [...byValue[v].slice(0, 3), jokers[0]];
        }
    }

    // 炸弹(3张)
    for (let v = 3; v <= 15; v++) {
        if (byValue[v] && byValue[v].length >= 3) {
            if (!lastIsBomb || (lt === 'bomb' && v > lastPlay.value)) {
                return byValue[v].slice(0, 3);
            }
        }
    }
    // 王+2张实牌组炸弹
    for (let v = 3; v <= 14; v++) {
        if (byValue[v] && byValue[v].length === 2 && jokers.length >= 1) {
            if (!lastIsBomb || (lt === 'bomb' && v > lastPlay.value)) {
                return [...byValue[v].slice(0, 2), jokers[0]];
            }
        }
    }

    // 双王炸弹
    if (jokers.length >= 2) {
        const hasSmall = jokers.some(j => j.value === 16);
        const hasBig = jokers.some(j => j.value === 17);
        if (hasSmall && hasBig) {
            return jokers.filter(j => j.value >= 16).slice(0, 2);
        }
    }

    return null;
}

// ============ 游戏流程 ============

function dealCards(room) {
    const deck = createDeck();
    room.players.forEach((p, i) => {
        p.hand = deck.splice(0, i === 0 ? 6 : 5);
        p.isDealer = i === 0;
    });
    room.deck = deck;
    room.currentPlayer = 0;
    room.lastPlay = null;
    room.lastPlayerIndex = -1;
    room.passCount = 0;
    room.passMessage = '';
    room.bombPlayed = false; // 记录是否出过炸弹类（影响倍率）
    room.moves = [];
}

function nextPlayerIndex(room, from) {
    return (from + 1) % room.players.length;
}

function handlePlayCards(room, playerIndex, cards) {
    const player = room.players[playerIndex];
    if (!player) throw new Error('玩家不存在');

    for (const c of cards) {
        if (!player.hand.some(h => cardsEqual(h, c))) {
            throw new Error('手牌中没有这些牌');
        }
    }

    const playType = identifyType(cards);
    if (!playType) throw new Error('无效牌型');

    const lastPlay = room.lastPlay;
    const isFreePlay = !lastPlay || lastPlay.playerIndex === playerIndex;
    if (!isFreePlay && !canBeat(playType, lastPlay.type)) {
        throw new Error('压不过上家的牌');
    }

    // 记录是否出过炸弹类
    if (['bomb', 'hydrogen', 'doubleJoker'].includes(playType.type)) {
        room.bombPlayed = true;
    }

    player.hand = removeCardsFromHand(player.hand, cards);
    room.lastPlay = { playerIndex, cards, type: playType };
    room.lastPlayerIndex = playerIndex;
    room.passCount = 0;
    room.passMessage = '';
    room.moves.push({ playerIndex, cards, type: playType.type });

    if (player.hand.length === 0) {
        room.status = 'finished';
        room.winner = playerIndex;
        calculateScores(room);
        return;
    }

    room.currentPlayer = nextPlayerIndex(room, playerIndex);
}

function handlePass(room, playerIndex) {
    if (!room.lastPlay || room.lastPlay.playerIndex === playerIndex) {
        throw new Error('自由出牌时不能过');
    }

    room.passCount++;
    room.passMessage = room.players[playerIndex].name + ' 过';

    if (room.passCount >= room.players.length - 1) {
        const lastPlayer = room.players[room.lastPlayerIndex];
        if (room.deck && room.deck.length > 0) {
            lastPlayer.hand.push(room.deck.shift());
        }
        room.currentPlayer = room.lastPlayerIndex;
        room.lastPlay = null;
        room.passCount = 0;
    } else {
        room.currentPlayer = nextPlayerIndex(room, playerIndex);
    }
}

/**
 * 计算积分
 * 春天：游戏结束时仍有5张牌的玩家，所输积分加倍
 * 倍率：双王炸弹/氢弹4倍，炸弹2倍，春天2倍
 */
function calculateScores(room) {
    const winnerIdx = room.winner;
    const baseScore = 1;
    let multiplier = 1;

    // 炸弹倍率
    if (room.bombPlayed) {
        // 检查是否有氢弹或双王
        const hasHydrogen = room.moves.some(m => m.type === 'hydrogen' || m.type === 'doubleJoker');
        multiplier = hasHydrogen ? 4 : 2;
    }

    room.players.forEach((p, i) => {
        if (i === winnerIdx) {
            p.score = 0;
        } else {
            const remaining = p.hand ? p.hand.length : 0;
            // 春天：仍有5张牌
            const isSpring = remaining === 5;
            let playerMultiplier = multiplier;
            if (isSpring) playerMultiplier *= 2;
            p.score = -(baseScore * remaining * playerMultiplier);
            p.isSpring = isSpring;
        }
    });

    // 胜者积分 = 所有输家积分绝对值之和
    let winnerScore = 0;
    room.players.forEach((p, i) => {
        if (i !== winnerIdx) winnerScore += Math.abs(p.score);
    });
    room.players[winnerIdx].score = winnerScore;
}

// ============ 路由 ============

exports.handler = async (req, resp, context) => {
    try {
        if (req.method === 'OPTIONS') {
            resp.setStatusCode(204);
            resp.setHeader('Access-Control-Allow-Origin', '*');
            resp.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            resp.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            resp.send('');
            return;
        }

        const url = new URL(req.url, 'http://localhost');
        const path = url.pathname;

        if (path === '/api/gdy/room' && req.method === 'POST') {
            const body = await readBody(req);
            const { playerId, playerName } = body;
            if (!playerId) return fail(resp, '缺少 playerId');

            let code;
            for (let i = 0; i < 10; i++) {
                code = genCode();
                if (!await roomGet(code)) break;
            }
            const room = {
                roomCode: code,
                players: [{ playerId, name: playerName || '玩家', hand: [], isDealer: true }],
                currentPlayer: 0,
                lastPlay: null,
                lastPlayerIndex: -1,
                passCount: 0,
                passMessage: '',
                deck: [],
                status: 'waiting',
                winner: null,
                createdAt: Date.now(),
                expiresAt: Date.now() + ROOM_EXPIRE_MS,
                version: 0,
            };
            await roomPut(code, room);
            return json(resp, { success: true, data: { roomCode: code, room } });
        }

        const match = path.match(/^\/api\/gdy\/room\/([A-Za-z0-9]{6})(\/(join|start|play|pass|hint|leave))?$/);
        if (match) {
            const code = match[1];
            const action = match[3];
            const room = await roomGet(code);
            if (!room) return fail(resp, '房间不存在', 404);

            if (!action) {
                const safeRoom = JSON.parse(JSON.stringify(room));
                return json(resp, { success: true, data: { room: safeRoom, version: room.version } });
            }

            const body = await readBody(req);
            const { playerId, cards } = body;

            if (action === 'join' && req.method === 'POST') {
                if (room.status !== 'waiting') return fail(resp, '游戏已开始');
                if (room.players.length >= MAX_PLAYERS) return fail(resp, '房间已满（最多' + MAX_PLAYERS + '人）');
                if (room.players.some(p => p.playerId === playerId)) return fail(resp, '你已在房间中');
                room.players.push({ playerId, name: body.playerName || '玩家', hand: [] });
                await roomPut(code, room);
                return json(resp, { success: true, data: { room } });
            }

            if (action === 'start' && req.method === 'POST') {
                if (room.players[0].playerId !== playerId) return fail(resp, '只有庄家能开始');
                if (room.players.length < 2) return fail(resp, '至少需要2名玩家');
                if (room.status !== 'waiting') return fail(resp, '游戏已开始');
                dealCards(room);
                room.status = 'playing';
                await roomPut(code, room);
                return json(resp, { success: true, data: { room } });
            }

            if (action === 'leave' && req.method === 'POST') {
                const idx = room.players.findIndex(p => p.playerId === playerId);
                if (idx >= 0) {
                    room.players.splice(idx, 1);
                    if (room.players.length === 0 || room.status === 'playing') {
                        room.status = 'finished';
                    }
                    await roomPut(code, room);
                }
                return json(resp, { success: true });
            }

            if (room.status !== 'playing') return fail(resp, '游戏未在进行中');
            const playerIndex = room.players.findIndex(p => p.playerId === playerId);
            if (playerIndex < 0) return fail(resp, '你不在该房间中', 403);

            if (action === 'hint' && req.method === 'POST') {
                if (room.currentPlayer !== playerIndex) return fail(resp, '还没轮到你');
                const hint = findHint(room.players[playerIndex].hand, room.lastPlay ? room.lastPlay.type : null);
                return json(resp, { success: true, data: { cards: hint || [] } });
            }

            if (action === 'play' && req.method === 'POST') {
                if (room.currentPlayer !== playerIndex) return fail(resp, '还没轮到你');
                handlePlayCards(room, playerIndex, cards || []);
                await roomPut(code, room);
                return json(resp, { success: true, data: { room } });
            }

            if (action === 'pass' && req.method === 'POST') {
                if (room.currentPlayer !== playerIndex) return fail(resp, '还没轮到你');
                handlePass(room, playerIndex);
                await roomPut(code, room);
                return json(resp, { success: true, data: { room } });
            }
        }

        return fail(resp, '接口不存在', 404);
    } catch (e) {
        return fail(resp, e.message, 500);
    }
};
