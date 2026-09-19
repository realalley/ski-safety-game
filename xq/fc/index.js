/**
 * 中国象棋在线对战 - 函数计算 FC
 * 存储：阿里云 Tablestore（强一致）
 *
 * 接口：
 *   POST /api/xq/room                    {playerName}
 *   GET  /api/xq/room/:code
 *   POST /api/xq/room/:code/join         {playerName}
 *   POST /api/xq/room/:code/move         {playerId, from:{x,y}, to:{x,y}}
 *   POST /api/xq/room/:code/resign       {playerId}
 */

const TableStore = require('tablestore');

const ROOM_EXPIRE_MS = 2 * 60 * 60 * 1000;
const TABLE_NAME = process.env.OTS_TABLE_NAME || 'xq_room';

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

// ============ 工具函数 ============

function json(resp, data, status = 200) {
    resp.setStatusCode(status);
    resp.setHeader('Content-Type', 'application/json');
    resp.setHeader('Access-Control-Allow-Origin', '*');
    resp.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    resp.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    resp.setHeader('Cache-Control', 'no-store');
    resp.send(JSON.stringify(data));
}
function fail(resp, error, status) { json(resp, { success: false, error }, status); }

async function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch (e) { reject(new Error('请求体不是合法 JSON')); }
        });
        req.on('error', reject);
    });
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function generateId() {
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// ============ 棋盘初始化 ============
// 棋盘 9列(x:0-8) × 10行(y:0-9)
// 黑方在上(y:0-4)，红方在下(y:5-9)
// 棋子: { type, color }  type: general/advisor/elephant/horse/chariot/cannon/soldier

function createInitialBoard() {
    const board = Array.from({ length: 10 }, () => Array(9).fill(null));

    // 黑方 (y=0 底线)
    const backRow = ['chariot', 'horse', 'elephant', 'advisor', 'general', 'advisor', 'elephant', 'horse', 'chariot'];
    for (let x = 0; x < 9; x++) {
        board[0][x] = { type: backRow[x], color: 'black' };
    }
    board[2][1] = { type: 'cannon', color: 'black' };
    board[2][7] = { type: 'cannon', color: 'black' };
    for (const x of [0, 2, 4, 6, 8]) board[3][x] = { type: 'soldier', color: 'black' };

    // 红方 (y=9 底线)
    for (let x = 0; x < 9; x++) {
        board[9][x] = { type: backRow[x], color: 'red' };
    }
    board[7][1] = { type: 'cannon', color: 'red' };
    board[7][7] = { type: 'cannon', color: 'red' };
    for (const x of [0, 2, 4, 6, 8]) board[6][x] = { type: 'soldier', color: 'red' };

    return board;
}

// ============ 走棋规则校验 ============

function inBoard(x, y) { return x >= 0 && x < 9 && y >= 0 && y < 10; }

// 九宫格判断
function inPalace(x, y, color) {
    if (x < 3 || x > 5) return false;
    if (color === 'red') return y >= 7 && y <= 9;
    return y >= 0 && y <= 2;
}

// 是否过河
function hasCrossedRiver(y, color) {
    if (color === 'red') return y <= 4;  // 红兵过河到 y<=4
    return y >= 5;  // 黑卒过河到 y>=5
}

function getPiece(board, x, y) {
    if (!inBoard(x, y)) return null;
    return board[y][x];
}

/**
 * 判断某棋子从 (fx,fy) 到 (tx,ty) 的走法是否合法
 * 返回 { valid, reason }
 */
function validateMove(board, fx, fy, tx, ty) {
    if (!inBoard(fx, fy) || !inBoard(tx, ty)) return { valid: false, reason: '越界' };
    if (fx === tx && fy === ty) return { valid: false, reason: '未移动' };

    const piece = board[fy][fx];
    if (!piece) return { valid: false, reason: '起点无棋子' };

    const target = board[ty][tx];
    if (target && target.color === piece.color) return { valid: false, reason: '不能吃己方棋子' };

    const { type, color } = piece;
    const dx = tx - fx;
    const dy = ty - fy;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    switch (type) {
        case 'general': // 帅/将
        {
            // 九宫内
            if (!inPalace(tx, ty, color)) return { valid: false, reason: '将帅不能出九宫' };
            // 每次一格，直线
            if ((adx === 1 && ady === 0) || (adx === 0 && ady === 1)) {
                return checkNoFlyingGeneral(board, fx, fy, tx, ty, color);
            }
            return { valid: false, reason: '将帅每次走一格直线' };
        }

        case 'advisor': // 仕/士
        {
            if (!inPalace(tx, ty, color)) return { valid: false, reason: '仕士不能出九宫' };
            if (adx === 1 && ady === 1) return { valid: true };
            return { valid: false, reason: '仕士斜走一格' };
        }

        case 'elephant': // 相/象
        {
            // 不过河
            if (color === 'red' && ty < 5) return { valid: false, reason: '相不过河' };
            if (color === 'black' && ty > 4) return { valid: false, reason: '象不过河' };
            // 田字
            if (adx === 2 && ady === 2) {
                // 象眼
                const eyeX = fx + dx / 2;
                const eyeY = fy + dy / 2;
                if (board[eyeY][eyeX]) return { valid: false, reason: '塞象眼' };
                return { valid: true };
            }
            return { valid: false, reason: '相走田字' };
        }

        case 'horse': // 马
        {
            // 日字
            if ((adx === 1 && ady === 2) || (adx === 2 && ady === 1)) {
                // 蹩马腿：第一步方向有子
                let legX, legY;
                if (adx === 2) { legX = fx + dx / 2; legY = fy; }
                else { legX = fx; legY = fy + dy / 2; }
                if (board[legY][legX]) return { valid: false, reason: '蹩马腿' };
                return { valid: true };
            }
            return { valid: false, reason: '马走日字' };
        }

        case 'chariot': // 车
        {
            // 直线
            if (adx !== 0 && ady !== 0) return { valid: false, reason: '车走直线' };
            // 中间无子
            if (!isPathClear(board, fx, fy, tx, ty)) return { valid: false, reason: '车被阻挡' };
            return { valid: true };
        }

        case 'cannon': // 炮
        {
            if (adx !== 0 && ady !== 0) return { valid: false, reason: '炮走直线' };
            const count = countBetween(board, fx, fy, tx, ty);
            if (target) {
                // 吃子：必须恰好隔一个
                if (count !== 1) return { valid: false, reason: '炮吃子需隔一子' };
            } else {
                // 移动：中间不能有子
                if (count !== 0) return { valid: false, reason: '炮移动不能越子' };
            }
            return { valid: true };
        }

        case 'soldier': // 兵/卒
        {
            // 每次一格
            if (adx + ady !== 1) return { valid: false, reason: '兵卒每次走一格' };
            // 不能后退
            if (color === 'red') {
                if (dy > 0) return { valid: false, reason: '兵不能后退' };
                if (!hasCrossedRiver(fy, color) && dx !== 0) return { valid: false, reason: '未过河兵不能横走' };
            } else {
                if (dy < 0) return { valid: false, reason: '卒不能后退' };
                if (!hasCrossedRiver(fy, color) && dx !== 0) return { valid: false, reason: '未过河卒不能横走' };
            }
            return { valid: true };
        }
    }

    return { valid: false, reason: '未知棋子' };
}

// 检查直线上中间的棋子数
function countBetween(board, fx, fy, tx, ty) {
    let count = 0;
    if (fx === tx) {
        const minY = Math.min(fy, ty), maxY = Math.max(fy, ty);
        for (let y = minY + 1; y < maxY; y++) if (board[y][fx]) count++;
    } else {
        const minX = Math.min(fx, tx), maxX = Math.max(fx, tx);
        for (let x = minX + 1; x < maxX; x++) if (board[fy][x]) count++;
    }
    return count;
}

function isPathClear(board, fx, fy, tx, ty) {
    return countBetween(board, fx, fy, tx, ty) === 0;
}

// 检查将帅照面（飞将）：移动后不能让双方将帅在同一列且中间无子
function checkNoFlyingGeneral(board, fx, fy, tx, ty, color) {
    // 临时移动
    const piece = board[fy][fx];
    const target = board[ty][tx];
    board[ty][tx] = piece;
    board[fy][fx] = null;

    let blocked = false;
    // 找到双方将帅位置
    let redGen = null, blackGen = null;
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 9; x++) {
            const p = board[y][x];
            if (p && p.type === 'general') {
                if (p.color === 'red') redGen = { x, y };
                else blackGen = { x, y };
            }
        }
    }

    if (redGen && blackGen && redGen.x === blackGen.x) {
        // 同一列，检查中间是否有子
        const minY = Math.min(redGen.y, blackGen.y);
        const maxY = Math.max(redGen.y, blackGen.y);
        let between = 0;
        for (let y = minY + 1; y < maxY; y++) {
            if (board[y][redGen.x]) between++;
        }
        if (between === 0) blocked = true;
    }

    // 还原
    board[fy][fx] = piece;
    board[ty][tx] = target;

    if (blocked) return { valid: false, reason: '将帅不能照面' };
    return { valid: true };
}

// 检查某方的帅/将是否还在
function findGeneral(board, color) {
    for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 9; x++) {
            const p = board[y][x];
            if (p && p.type === 'general' && p.color === color) return { x, y };
        }
    }
    return null;
}

// ============ Tablestore ============

async function roomGet(code) {
    const c = getClient();
    const r = await c.getRow({
        tableName: TABLE_NAME,
        primaryKey: [{ roomCode: code }],
    });
    if (!r || !r.row || !r.row.attributes || r.row.attributes.length === 0) return undefined;
    const col = r.row.attributes.find((a) => a.columnName === 'data');
    if (!col || !col.columnValue) return undefined;
    try { return JSON.parse(col.columnValue); } catch (e) { return undefined; }
}

async function roomPut(code, room) {
    const c = getClient();
    await c.putRow({
        tableName: TABLE_NAME,
        condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
        primaryKey: [{ roomCode: code }],
        attributeColumns: [{ data: JSON.stringify(room) }],
    });
}

async function roomDelete(code) {
    const c = getClient();
    await c.deleteRow({
        tableName: TABLE_NAME,
        condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
        primaryKey: [{ roomCode: code }],
    });
}

// ============ 接口处理 ============

async function handleCreateRoom(req, resp) {
    const body = await readBody(req);
    const playerName = (body.playerName || '玩家').toString().slice(0, 8);
    const playerId = body.playerId || generateId();

    let code = '';
    for (let i = 0; i < 3; i++) {
        code = generateRoomCode();
        const existing = await roomGet(code);
        if (!existing || Date.now() > existing.expiresAt) break;
    }

    const now = Date.now();
    const room = {
        board: createInitialBoard(),
        currentTurn: 'red',
        players: [{ id: playerId, name: playerName, color: 'red' }],
        status: 'waiting',
        winner: null,
        moves: [],
        lastMove: null,
        createdAt: now,
        lastMoveAt: now,
        expiresAt: now + ROOM_EXPIRE_MS,
    };
    await roomPut(code, room);
    json(resp, { success: true, data: { roomCode: code, playerId, color: 'red', room } });
}

async function handleGetRoom(code, resp) {
    const room = await roomGet(code);
    if (!room) return fail(resp, '房间不存在', 404);
    if (Date.now() > room.expiresAt) {
        await roomDelete(code);
        return fail(resp, '房间已过期', 410);
    }
    json(resp, { success: true, data: { room } });
}

async function handleJoinRoom(code, req, resp) {
    const body = await readBody(req);
    const playerName = (body.playerName || '玩家').toString().slice(0, 8);
    const playerId = body.playerId || generateId();

    const room = await roomGet(code);
    if (!room) return fail(resp, '房间不存在', 404);
    if (Date.now() > room.expiresAt) {
        await roomDelete(code);
        return fail(resp, '房间已过期', 410);
    }

    // 重连
    const existing = room.players.find(p => p.id === playerId);
    if (existing) return json(resp, { success: true, data: { roomCode: code, playerId, color: existing.color, room } });

    if (room.players.length >= 2) return fail(resp, '房间已满', 409);

    const color = room.players.length === 0 ? 'red' : 'black';
    room.players.push({ id: playerId, name: playerName, color });
    if (room.players.length === 2) {
        room.status = 'playing';
        room.currentTurn = 'red';
    }
    room.lastMoveAt = Date.now();
    await roomPut(code, room);
    json(resp, { success: true, data: { roomCode: code, playerId, color, room } });
}

async function handleMove(code, req, resp) {
    const body = await readBody(req);
    const { playerId, from, to } = body;
    if (!playerId || !from || !to) return fail(resp, '缺少参数', 400);

    const room = await roomGet(code);
    if (!room) return fail(resp, '房间不存在', 404);
    if (room.status !== 'playing') return fail(resp, '游戏未开始或已结束', 400);

    const player = room.players.find(p => p.id === playerId);
    if (!player) return fail(resp, '你不在该房间中', 403);
    if (room.currentTurn !== player.color) return fail(resp, '还没轮到你', 400);

    // 校验走棋
    const result = validateMove(room.board, from.x, from.y, to.x, to.y);
    if (!result.valid) return fail(resp, result.reason, 400);

    const movingPiece = room.board[from.y][from.x];
    const capturedPiece = room.board[to.y][to.x];

    // 执行走棋
    room.board[to.y][to.x] = movingPiece;
    room.board[from.y][from.x] = null;

    // 检查是否吃掉对方将帅
    const capturedGeneral = capturedPiece && capturedPiece.type === 'general';

    room.moves.push({
        from, to,
        piece: movingPiece,
        captured: capturedPiece,
        color: player.color,
        t: Date.now(),
    });
    room.lastMove = { from, to };
    room.lastMoveAt = Date.now();

    if (capturedGeneral) {
        room.status = 'finished';
        room.winner = player.color;
    } else {
        room.currentTurn = player.color === 'red' ? 'black' : 'red';
    }

    await roomPut(code, room);
    json(resp, { success: true, data: { room } });
}

async function handleResign(code, req, resp) {
    const body = await readBody(req);
    const { playerId } = body;
    if (!playerId) return fail(resp, '缺少 playerId', 400);

    const room = await roomGet(code);
    if (!room) return fail(resp, '房间不存在', 404);
    if (room.status !== 'playing') return fail(resp, '游戏未在进行中', 400);

    const player = room.players.find(p => p.id === playerId);
    if (!player) return fail(resp, '你不在该房间中', 403);

    room.status = 'finished';
    room.winner = player.color === 'red' ? 'black' : 'red';
    room.lastMoveAt = Date.now();
    await roomPut(code, room);
    json(resp, { success: true, data: { room } });
}

// ============ 入口 ============

exports.handler = async (req, resp, context) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
        if (req.method === 'OPTIONS') {
            resp.setStatusCode(204);
            resp.setHeader('Access-Control-Allow-Origin', '*');
            resp.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            resp.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            resp.send('');
            return;
        }

        if (path === '/api/xq/room' && req.method === 'POST') {
            return await handleCreateRoom(req, resp);
        }

        const match = path.match(/^\/api\/xq\/room\/([A-Za-z0-9]{6})(\/(join|move|resign))?$/);
        if (match) {
            const code = match[1].toUpperCase();
            const action = match[3];
            if (!action && req.method === 'GET') return await handleGetRoom(code, resp);
            if (action === 'join' && req.method === 'POST') return await handleJoinRoom(code, req, resp);
            if (action === 'move' && req.method === 'POST') return await handleMove(code, req, resp);
            if (action === 'resign' && req.method === 'POST') return await handleResign(code, req, resp);
        }

        return fail(resp, '接口不存在', 404);
    } catch (e) {
        console.error('handler error:', e && e.stack ? e.stack : e);
        return fail(resp, '服务器错误: ' + (e && e.message ? e.message : String(e)), 500);
    }
};
