/**
 * 围棋在线对战 - 函数计算 FC 版本
 * 存储：阿里云 Tablestore（复用 wuziqi 实例）
 *
 * 规则：中国规则，数子法，黑贴 3.75 子
 * - 19x19 / 13x13 / 9x9 可选
 * - 气、提子、禁入点、打劫
 * - 停一手(pass)，双方连续 pass 结束对局
 * - 终局后数子（简单实现：活棋+空点归属）
 */

const TableStore = require('tablestore');

const ROOM_EXPIRE_MS = 2 * 60 * 60 * 1000;
const TABLE_NAME = process.env.OTS_TABLE_NAME || 'wq_room';

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

function generateEmptyBoard(size) {
    const b = [];
    for (let i = 0; i < size; i++) b.push(new Array(size).fill(0));
    return b;
}

async function roomGet(code) {
    const c = getClient();
    const r = await c.getRow({ tableName: TABLE_NAME, primaryKey: [{ roomCode: code }] });
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

// ============ 围棋核心规则 ============

/**
 * 获取一个棋子所在棋块（连通的同色棋子）的所有位置和气
 */
function getGroup(board, x, y, size) {
    const color = board[y][x];
    if (!color) return { stones: [], liberties: new Set() };
    const visited = new Set();
    const stones = [];
    const liberties = new Set();
    const stack = [[x, y]];
    while (stack.length) {
        const [cx, cy] = stack.pop();
        const key = cx + ',' + cy;
        if (visited.has(key)) continue;
        visited.add(key);
        if (cx < 0 || cx >= size || cy < 0 || cy >= size) continue;
        if (board[cy][cx] === 0) { liberties.add(key); continue; }
        if (board[cy][cx] !== color) continue;
        stones.push([cx, cy]);
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return { stones, liberties };
}

/**
 * 落子并处理提子，返回 { captured, board, koPoint }
 * koPoint: 打劫禁入点（上一手被提的单点位置）
 */
function placeStone(board, x, y, color, size, prevKoPoint) {
    // 检查位置是否为空
    if (board[y][x] !== 0) return { error: '该位置已有棋子' };
    // 检查打劫禁入
    if (prevKoPoint && prevKoPoint.x === x && prevKoPoint.y === y) {
        return { error: '打劫禁入点' };
    }

    const newBoard = board.map((row) => row.slice());
    newBoard[y][x] = color;
    const opp = color === 1 ? 2 : 1;

    // 检查周围对方棋块是否被提
    let captured = [];
    const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nx, ny] of neighbors) {
        if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
        if (newBoard[ny][nx] === opp) {
            const group = getGroup(newBoard, nx, ny, size);
            if (group.liberties.size === 0) {
                for (const [sx, sy] of group.stones) {
                    newBoard[sy][sx] = 0;
                    captured.push({ x: sx, y: sy });
                }
            }
        }
    }

    // 检查自杀：落子后己方棋块是否有气
    const myGroup = getGroup(newBoard, x, y, size);
    if (myGroup.liberties.size === 0) {
        return { error: '禁入点（自杀）' };
    }

    // 打劫判断：如果只提了一个子，且落子是单气孤立子，则形成打劫
    let koPoint = null;
    if (captured.length === 1 && myGroup.stones.length === 1 && myGroup.liberties.size === 1) {
        koPoint = { x: captured[0].x, y: captured[0].y };
    }

    return { captured, board: newBoard, koPoint };
}

/**
 * 数子法计算胜负（中国规则）
 * 简化版：统计双方活棋数量 + 空点归属
 * 贴目：黑贴 3.75 子
 */
function countScore(board, size, captures) {
    // 简化数子：遍历所有空点，判断归属（被同色棋子完全包围的空点归该方）
    // 实际终局应标记死棋，这里简化为：活棋数 + 完全包围的空点
    let blackArea = 0, whiteArea = 0;
    const visited = new Set();

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (board[y][x] === 1) blackArea++;
            else if (board[y][x] === 2) whiteArea++;
            else {
                const key = x + ',' + y;
                if (visited.has(key)) continue;
                // BFS 找空点区域
                const region = [];
                const borders = new Set();
                const stack = [[x, y]];
                while (stack.length) {
                    const [cx, cy] = stack.pop();
                    const k = cx + ',' + cy;
                    if (visited.has(k)) continue;
                    if (cx < 0 || cx >= size || cy < 0 || cy >= size) continue;
                    if (board[cy][cx] !== 0) { borders.add(board[cy][cx]); continue; }
                    visited.add(k);
                    region.push([cx, cy]);
                    stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
                }
                if (borders.size === 1) {
                    const owner = borders.values().next().value;
                    if (owner === 1) blackArea += region.length;
                    else whiteArea += region.length;
                }
                // 双方边界的空点不归任何一方（公气）
            }
        }
    }

    const komi = 3.75; // 黑贴 3.75 子
    const blackScore = blackArea;
    const whiteScore = whiteArea + komi;
    const winner = blackScore > whiteScore ? 1 : (whiteScore > blackScore ? 2 : 'draw');

    return {
        black: blackScore,
        white: whiteScore,
        komi,
        winner,
        blackCaptures: captures ? captures[1] || 0 : 0,
        whiteCaptures: captures ? captures[2] || 0 : 0,
    };
}

// ============ 接口处理 ============

async function handleCreateRoom(req, resp) {
    const body = await readBody(req);
    const playerId = body.playerId;
    const boardSize = body.boardSize || 19;
    if (!playerId) return fail(resp, '缺少 playerId', 400);
    if (![9, 13, 19].includes(boardSize)) return fail(resp, '棋盘大小不支持', 400);

    let code = '';
    for (let i = 0; i < 3; i++) {
        code = generateRoomCode();
        const existing = await roomGet(code);
        if (!existing || Date.now() > existing.expiresAt) break;
    }

    const now = Date.now();
    const room = {
        boardSize,
        board: generateEmptyBoard(boardSize),
        currentTurn: 1, // 黑先
        blackPlayer: playerId,
        whitePlayer: null,
        status: 'waiting',
        winner: null,
        score: null,
        moves: [],
        captures: { 1: 0, 2: 0 }, // 黑方提子数、白方提子数
        koPoint: null,
        consecutivePasses: 0,
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
    if (Date.now() > room.expiresAt) return fail(resp, '房间已过期', 410);
    json(resp, { success: true, data: { room } });
}

async function handleJoinRoom(code, req, resp) {
    const body = await readBody(req);
    const playerId = body.playerId;
    if (!playerId) return fail(resp, '缺少 playerId', 400);

    const room = await roomGet(code);
    if (!room) return fail(resp, '房间不存在', 404);
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

    const room = await roomGet(code);
    if (!room) return fail(resp, '房间不存在', 404);
    if (room.status !== 'playing') return fail(resp, '游戏未开始或已结束', 400);
    const size = room.boardSize;
    if (x < 0 || x >= size || y < 0 || y >= size) return fail(resp, '坐标越界', 400);

    let color = 0;
    if (room.blackPlayer === playerId) color = 1;
    else if (room.whitePlayer === playerId) color = 2;
    else return fail(resp, '你不在该房间中', 403);
    if (room.currentTurn !== color) return fail(resp, '还没轮到你', 400);

    const result = placeStone(room.board, x, y, color, size, room.koPoint);
    if (result.error) return fail(resp, result.error, 400);

    room.board = result.board;
    room.koPoint = result.koPoint;
    room.consecutivePasses = 0;
    room.moves.push({ x, y, p: color, t: Date.now() });
    room.lastMoveAt = Date.now();
    if (result.captured && result.captured.length > 0) {
        room.captures[color] = (room.captures[color] || 0) + result.captured.length;
    }
    room.currentTurn = color === 1 ? 2 : 1;
    await roomPut(code, room);
    json(resp, { success: true, data: { room, captured: result.captured } });
}

async function handlePass(code, req, resp) {
    const body = await readBody(req);
    const { playerId } = body;
    if (!playerId) return fail(resp, '缺少 playerId', 400);

    const room = await roomGet(code);
    if (!room) return fail(resp, '房间不存在', 404);
    if (room.status !== 'playing') return fail(resp, '游戏未开始或已结束', 400);

    let color = 0;
    if (room.blackPlayer === playerId) color = 1;
    else if (room.whitePlayer === playerId) color = 2;
    else return fail(resp, '你不在该房间中', 403);
    if (room.currentTurn !== color) return fail(resp, '还没轮到你', 400);

    room.consecutivePasses += 1;
    room.koPoint = null; // pass 后打劫解除
    room.moves.push({ pass: true, p: color, t: Date.now() });
    room.lastMoveAt = Date.now();

    if (room.consecutivePasses >= 2) {
        // 双方连续 pass，终局数子
        room.status = 'finished';
        room.score = countScore(room.board, room.boardSize, room.captures);
        room.winner = room.score.winner;
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

        if (path === '/api/wq/version') {
            return json(resp, { success: true, data: { version: 'fc-v1', timestamp: Date.now() } });
        }

        if (path === '/api/wq/room' && req.method === 'POST') {
            return await handleCreateRoom(req, resp);
        }

        const match = path.match(/^\/api\/wq\/room\/([A-Za-z0-9]{6})(\/(join|move|pass|resign))?$/);
        if (match) {
            const code = match[1].toUpperCase();
            const action = match[3];
            if (!action && req.method === 'GET') return await handleGetRoom(code, resp);
            if (action === 'join' && req.method === 'POST') return await handleJoinRoom(code, req, resp);
            if (action === 'move' && req.method === 'POST') return await handleMove(code, req, resp);
            if (action === 'pass' && req.method === 'POST') return await handlePass(code, req, resp);
            if (action === 'resign' && req.method === 'POST') return await handleResign(code, req, resp);
        }

        return fail(resp, '接口不存在', 404);
    } catch (e) {
        console.error('handler error:', e && e.stack ? e.stack : e);
        return fail(resp, '服务器错误: ' + (e && e.message ? e.message : String(e)), 500);
    }
};
