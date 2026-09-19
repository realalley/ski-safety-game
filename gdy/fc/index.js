/**
 * 干瞪眼光 FC 函数
 * 存储：阿里云 Tablestore（强一致）
 *
 * 牌值: 3-10, 11=J, 12=Q, 13=K, 14=A, 15=2, 16=小王, 17=大王
 * 花色: 0=黑桃, 1=红桃, 2=梅花, 3=方块, 4=小王, 5=大王
 *
 * 接口:
 *   POST /api/gdy/room                  创建房间
 *   GET  /api/gdy/room/:code            获取房间状态
 *   POST /api/gdy/room/:code/join       加入房间
 *   POST /api/gdy/room/:code/start      开始游戏（庄家）
 *   POST /api/gdy/room/:code/play       出牌 {cards:[{value,suit}]}
 *   POST /api/gdy/room/:code/pass       过
 *   POST /api/gdy/room/:code/leave      离开房间
 */

const TableStore = require('tablestore');

const TABLE_NAME = process.env.OTS_TABLE_NAME || 'gdy_room';
const BOARD_SIZE = 15; // 兼容
const ROOM_EXPIRE_MS = 2 * 60 * 60 * 1000;

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
            tableName: TABLE_NAME,
            primaryKey: [{ roomCode: code }],
            maxVersions: 1,
        });
        if (!res.row || !res.row.attributes) return null;
        const attr = {};
        res.row.attributes.forEach(a => { attr[a.columnName] = a.columnValue; });
        const room = JSON.parse(attr.data);
        return room;
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

/**
 * 生成一副牌（54张）
 */
function createDeck() {
    const deck = [];
    // 普通牌 3-A (3-14), 花色 0-3
    for (let v = 3; v <= 14; v++) {
        for (let s = 0; s < 4; s++) deck.push({ value: v, suit: s });
    }
    // 2 (value=15)
    for (let s = 0; s < 4; s++) deck.push({ value: 15, suit: s });
    // 小王(16), 大王(17)
    deck.push({ value: 16, suit: 4 });
    deck.push({ value: 17, suit: 5 });
    return shuffle(deck);
}

/**
 * 识别牌型
 * 返回 { type, value, length } 或 null
 * type: single, pair, bomb(3张), hydrogen(4张), doubleJoker
 */
function identifyType(cards) {
    if (!cards || cards.length === 0) return null;
    const values = cards.map(c => c.value).sort((a, b) => a - b);

    // 双王炸弹
    if (cards.length === 2 && values[0] === 16 && values[1] === 17) {
        return { type: 'doubleJoker', value: 100, length: 2 };
    }
    if (cards.length === 1) return { type: 'single', value: values[0], length: 1 };

    const allSame = values.every(v => v === values[0]);
    if (allSame) {
        if (cards.length === 2) return { type: 'pair', value: values[0], length: 2 };
        if (cards.length === 3) return { type: 'bomb', value: values[0], length: 3 };
        if (cards.length === 4) return { type: 'hydrogen', value: values[0], length: 4 };
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

    if (newIsBomb && !lastIsBomb) return true;
    if (newIsBomb && lastIsBomb) {
        const rank = { doubleJoker: 3, hydrogen: 2, bomb: 1 };
        if (rank[newPlay.type] !== rank[lastPlay.type]) {
            return rank[newPlay.type] > rank[lastPlay.type];
        }
        return newPlay.value > lastPlay.value;
    }
    if (newPlay.type !== lastPlay.type) return false;
    if (newPlay.length !== lastPlay.length) return false;

    // 2可以压任意单牌/对子
    if (newPlay.type === 'single' && newPlay.value === 15) return lastPlay.value !== 15;
    if (newPlay.type === 'pair' && newPlay.value === 15) return lastPlay.value !== 15;

    return newPlay.value > lastPlay.value;
}

function cardsEqual(a, b) {
    return a.value === b.value && a.suit === b.suit;
}

/**
 * 从手牌中移除出牌
 */
function removeCardsFromHand(hand, cards) {
    return hand.filter(h => !cards.some(c => cardsEqual(h, c)));
}

// ============ 游戏流程 ============

/**
 * 发牌：庄家6张，闲家5张
 */
function dealCards(room) {
    const deck = createDeck();
    room.players.forEach((p, i) => {
        p.hand = deck.splice(0, i === 0 ? 6 : 5);
        p.isDealer = i === 0;
    });
    room.deck = deck;
    room.currentPlayer = 0; // 庄家先出
    room.lastPlay = null;
    room.lastPlayerIndex = -1;
    room.passCount = 0;
    room.passMessage = '';
}

/**
 * 下一个玩家索引
 */
function nextPlayerIndex(room, from) {
    return (from + 1) % room.players.length;
}

/**
 * 处理出牌
 */
function handlePlayCards(room, playerIndex, cards) {
    const player = room.players[playerIndex];
    if (!player) throw new Error('玩家不存在');

    // 验证手牌包含这些牌
    for (const c of cards) {
        if (!player.hand.some(h => cardsEqual(h, c))) {
            throw new Error('手牌中没有这些牌');
        }
    }

    const playType = identifyType(cards);
    if (!playType) throw new Error('无效牌型');

    // 判断是否能压过上一手
    const lastPlay = room.lastPlay;
    const isFreePlay = !lastPlay || lastPlay.playerIndex === playerIndex;
    if (!isFreePlay && !canBeat(playType, lastPlay.type)) {
        throw new Error('压不过上家的牌');
    }

    // 执行出牌
    player.hand = removeCardsFromHand(player.hand, cards);
    room.lastPlay = {
        playerIndex,
        cards,
        type: playType,
    };
    room.lastPlayerIndex = playerIndex;
    room.passCount = 0;
    room.passMessage = '';

    // 检查胜利
    if (player.hand.length === 0) {
        room.status = 'finished';
        room.winner = playerIndex;
        return;
    }

    // 切换到下一个玩家
    room.currentPlayer = nextPlayerIndex(room, playerIndex);
}

/**
 * 处理过牌
 */
function handlePass(room, playerIndex) {
    // 自由出牌时不能过
    if (!room.lastPlay || room.lastPlay.playerIndex === playerIndex) {
        throw new Error('自由出牌时不能过');
    }

    room.passCount++;
    room.passMessage = room.players[playerIndex].name + ' 过';

    // 所有人都过了，最后出牌的玩家补牌并自由出牌
    if (room.passCount >= room.players.length - 1) {
        const lastPlayer = room.players[room.lastPlayerIndex];
        // 补一张牌（如果牌堆还有）
        if (room.deck && room.deck.length > 0) {
            lastPlayer.hand.push(room.deck.shift());
        }
        room.currentPlayer = room.lastPlayerIndex;
        room.lastPlay = null;
        room.passCount = 0;
    } else {
        // 切换到下一个玩家
        room.currentPlayer = nextPlayerIndex(room, playerIndex);
    }
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

            let code, room;
            for (let i = 0; i < 10; i++) {
                code = genCode();
                const exists = await roomGet(code);
                if (!exists) break;
            }
            room = {
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

        const match = path.match(/^\/api\/gdy\/room\/([A-Za-z0-9]{6})(\/(join|start|play|pass|leave))?$/);
        if (match) {
            const code = match[1];
            const action = match[3];
            const room = await roomGet(code);
            if (!room) return fail(resp, '房间不存在', 404);

            if (!action) {
                // 获取状态 - 不返回其他玩家的手牌
                const safeRoom = JSON.parse(JSON.stringify(room));
                return json(resp, { success: true, data: { room: safeRoom, version: room.version } });
            }

            const body = await readBody(req);
            const { playerId, cards } = body;

            if (action === 'join' && req.method === 'POST') {
                if (room.status !== 'waiting') return fail(resp, '游戏已开始');
                if (room.players.length >= 2) return fail(resp, '房间已满');
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
