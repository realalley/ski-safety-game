/**
 * 五子棋在线对战 - 函数计算 FC 版本
 * 替代原 ESA 边缘函数（EdgeKV 最终一致性实测 2 分钟+，无法支撑实时对战）
 * 存储：阿里云 Tablestore（强一致），CU 模式按量计费
 *
 * 环境变量：
 *   OTS_ENDPOINT    形如 https://xxx.cn-hangzhou.ots.aliyuncs.com
 *   OTS_INSTANCE    实例名
 *   OTS_TABLE_NAME  表名，默认 room
 *   OTS_AK_ID / OTS_AK_SECRET  RAM 子账号 AccessKey（建议在 FC 控制台配置，勿写入代码）
 *
 * 接口与原边缘函数完全兼容：
 *   GET  /api/wuziqi/version
 *   GET  /api/wuziqi/diag
 *   POST /api/wuziqi/room                        {playerId}
 *   GET  /api/wuziqi/room/:code
 *   POST /api/wuziqi/room/:code/join             {playerId}
 *   POST /api/wuziqi/room/:code/move             {playerId, x, y}
 *   POST /api/wuziqi/room/:code/resign           {playerId}
 */

const TableStore = require('tablestore');

const BOARD_SIZE = 15;
const ROOM_EXPIRE_MS = 2 * 60 * 60 * 1000; // 2小时过期

const TABLE_NAME = process.env.OTS_TABLE_NAME || 'room';

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

function fail(resp, error, status) {
    json(resp, { success: false, error }, status);
}

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
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆的 I/O/0/1
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function generateEmptyBoard() {
    const board = [];
    for (let i = 0; i < BOARD_SIZE; i++) board.push(new Array(BOARD_SIZE).fill(0));
    return board;
}

/**
 * 从 Tablestore 读取房间 JSON；不存在返回 undefined
 */
async function roomGet(code) {
    const c = getClient();
    const r = await c.getRow({
        tableName: TABLE_NAME,
        primaryKey: [{ roomCode: code }],
    });
    if (!r || !r.row || !r.row.attributes || r.row.attributes.length === 0) return undefined;
    const col = r.row.attributes.find((a) => a.columnName === 'data');
    if (!col || !col.columnValue) return undefined;
    try {
        return JSON.parse(col.columnValue);
    } catch (e) {
        console.error('room JSON parse error:', e.message);
        return undefined;
    }
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

/**
 * 胜负判定：与原边缘函数逻辑一致
 */
function checkWin(x, y, board) {
    const color = board[y][x];
    if (color === 0) return null;
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dx, dy] of directions) {
        let count = 1;
        const line = [[x, y]];
        for (let i = 1; i < 5; i++) {
            const nx = x + dx * i, ny = y + dy * i;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
            if (board[ny][nx] !== color) break;
            count++;
            line.push([nx, ny]);
        }
        for (let i = 1; i < 5; i++) {
            const nx = x - dx * i, ny = y - dy * i;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
            if (board[ny][nx] !== color) break;
            count++;
            line.unshift([nx, ny]);
        }
        if (count >= 5) return { winner: color, line };
    }
    return null;
}

// ============ 处理函数（逻辑与原 api/index.js 保持一致） ============

async function handleCreateRoom(req, resp) {
    const body = await readBody(req);
    const playerId = body.playerId;
    if (!playerId) return fail(resp, '缺少 playerId', 400);

    // 生成唯一房间号（冲突重试3次）
    let code = '';
    for (let i = 0; i < 3; i++) {
        code = generateRoomCode();
        const existing = await roomGet(code);
        if (!existing || Date.now() > existing.expiresAt) break;
    }

    const now = Date.now();
    const room = {
        board: generateEmptyBoard(),
        currentTurn: 1,
        blackPlayer: playerId,
        whitePlayer: null,
        status: 'waiting',
        winner: null,
        winLine: null,
        moves: [],
        createdAt: now,
        lastMoveAt: now,
        expiresAt: now + ROOM_EXPIRE_MS,
    };
    await roomPut(code, room);
    json(resp, { success: true, data: { roomCode: code, playerId, color: 1, room } });
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
    const playerId = body.playerId;
    if (!playerId) return fail(resp, '缺少 playerId', 400);

    const room = await roomGet(code);
    if (!room) return fail(resp, '房间不存在', 404);
    if (Date.now() > room.expiresAt) {
        await roomDelete(code);
        return fail(resp, '房间已过期', 410);
    }

    // 重连：同 playerId 已在房间中
    if (room.blackPlayer === playerId) return json(resp, { success: true, data: { roomCode: code, playerId, color: 1, room } });
    if (room.whitePlayer === playerId) return json(resp, { success: true, data: { roomCode: code, playerId, color: 2, room } });

    if (room.whitePlayer !== null) return fail(resp, '房间已满', 409);

    room.whitePlayer = playerId;
    room.status = 'playing';
    room.lastMoveAt = Date.now();
    await roomPut(code, room);
    json(resp, { success: true, data: { roomCode: code, playerId, color: 2, room } });
}

async function handleMove(code, req, resp) {
    const body = await readBody(req);
    const { playerId, x, y } = body;
    if (!playerId || x === undefined || y === undefined) return fail(resp, '缺少参数', 400);
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return fail(resp, '坐标越界', 400);

    const room = await roomGet(code);
    if (!room) return fail(resp, '房间不存在', 404);
    if (room.status !== 'playing') return fail(resp, '游戏未开始或已结束', 400);
    if (room.board[y][x] !== 0) return fail(resp, '该位置已有棋子', 400);

    let color = 0;
    if (room.blackPlayer === playerId) color = 1;
    else if (room.whitePlayer === playerId) color = 2;
    else return fail(resp, '你不在该房间中', 403);
    if (room.currentTurn !== color) return fail(resp, '还没轮到你', 400);

    room.board[y][x] = color;
    room.moves.push({ x, y, p: color, t: Date.now() });
    room.lastMoveAt = Date.now();

    const winResult = checkWin(x, y, room.board);
    if (winResult) {
        room.status = 'finished';
        room.winner = winResult.winner;
        room.winLine = winResult.line;
    } else if (room.moves.length >= BOARD_SIZE * BOARD_SIZE) {
        room.status = 'finished';
        room.winner = 'draw';
    } else {
        room.currentTurn = color === 1 ? 2 : 1;
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

    let loserColor = 0;
    if (room.blackPlayer === playerId) loserColor = 1;
    else if (room.whitePlayer === playerId) loserColor = 2;
    else return fail(resp, '你不在该房间中', 403);

    room.status = 'finished';
    room.winner = loserColor === 1 ? 2 : 1;
    room.lastMoveAt = Date.now();
    await roomPut(code, room);
    json(resp, { success: true, data: { room } });
}

async function handleDiag(resp) {
    const result = {};
    try {
        // 用一个一次性 diag key 做写后立即读验证
        const code = 'DIAG' + Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
        code.length = 6;
        // Tablestore 主键仅允许字母数字 - _，用固定 diag 行测试
        const room = { board: generateEmptyBoard(), status: 'diag', createdAt: Date.now() };
        await roomPut('diag-test', room);
        const back = await roomGet('diag-test');
        result.putGet = back && back.status === 'diag' ? 'match' : 'mismatch';
        await roomDelete('diag-test');
        result.cleanup = 'done';
    } catch (e) {
        result.error = e.message;
    }
    json(resp, { success: true, data: result });
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
            resp.setHeader('Cache-Control', 'no-store');
            resp.send('');
            return;
        }

        if (path === '/api/wuziqi/version') {
            return json(resp, { success: true, data: { version: 'fc-tablestore-v1', timestamp: Date.now() } });
        }

        if (path === '/api/wuziqi/diag' && req.method === 'GET') {
            return await handleDiag(resp);
        }

        if (path === '/api/wuziqi/room' && req.method === 'POST') {
            return await handleCreateRoom(req, resp);
        }

        const match = path.match(/^\/api\/wuziqi\/room\/([A-Za-z0-9]{6})(\/(join|move|resign))?$/);
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
