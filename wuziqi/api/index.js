/**
 * 五子棋在线对战 - 边缘函数
 * 处理房间管理、落子校验、胜负判定
 * 使用 ESA Edge KV 存储房间状态
 */

const KV_NAMESPACE = 'wuziqi';
const BOARD_SIZE = 15;
const ROOM_EXPIRE_MS = 2 * 60 * 60 * 1000;  // 2小时过期

// ============ 工具函数 ============

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

/**
 * 从 KV 读取并解析 JSON
 * 用 text 模式读取后手动解析，避免 json 模式的潜在问题
 */
async function kvGetJSON(kv, key) {
    const raw = await kv.get(key, { type: 'text' });
    if (raw === undefined || raw === null || raw === '') return undefined;
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error('KV JSON parse error:', e.message, 'raw length:', raw.length);
        return undefined;
    }
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // 去掉易混淆的 I/O/0/1
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function generateEmptyBoard() {
    const board = [];
    for (let i = 0; i < BOARD_SIZE; i++) {
        board.push(new Array(BOARD_SIZE).fill(0));
    }
    return board;
}

/**
 * 胜负判定：检查落子点4个方向是否有5连
 * @returns {winner, line} 或 null
 */
function checkWin(x, y, board) {
    const color = board[y][x];
    if (color === 0) return null;

    const directions = [
        [1, 0],   // 横
        [0, 1],   // 竖
        [1, 1],   // 斜（左上→右下）
        [1, -1],  // 斜（左下→右上）
    ];

    for (const [dx, dy] of directions) {
        let count = 1;
        const line = [[x, y]];

        // 正方向
        for (let i = 1; i < 5; i++) {
            const nx = x + dx * i;
            const ny = y + dy * i;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
            if (board[ny][nx] !== color) break;
            count++;
            line.push([nx, ny]);
        }

        // 反方向
        for (let i = 1; i < 5; i++) {
            const nx = x - dx * i;
            const ny = y - dy * i;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
            if (board[ny][nx] !== color) break;
            count++;
            line.unshift([nx, ny]);
        }

        if (count >= 5) {
            return { winner: color, line };
        }
    }
    return null;
}

// ============ 路由处理 ============

export default {
    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS 预检
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        // 只处理 /api/wuziqi/* 路径
        if (!path.startsWith('/api/wuziqi/')) {
            return json({ success: false, error: 'Not Found' }, 404);
        }

        // 版本检测
        if (path === '/api/wuziqi/version') {
            return json({ success: true, data: { version: 'text-mode-v2', timestamp: Date.now() } });
        }

        const kv = new EdgeKV({ namespace: KV_NAMESPACE });

        // KV 诊断：同一请求内写后立即读
        if (path === '/api/wuziqi/diag' && request.method === 'GET') {
            return await handleDiag(kv);
        }

        try {
            // POST /api/wuziqi/room - 创建房间
            if (path === '/api/wuziqi/room' && request.method === 'POST') {
                return await handleCreateRoom(kv, request);
            }

            // 路由: /api/wuziqi/room/:code/*
            const match = path.match(/^\/api\/wuziqi\/room\/([A-Z0-9]{6})(\/(join|move|resign))?$/);
            if (match) {
                const code = match[1];
                const action = match[3];

                if (!action && request.method === 'GET') {
                    return await handleGetRoom(kv, code);
                }
                if (action === 'join' && request.method === 'POST') {
                    return await handleJoinRoom(kv, code, request);
                }
                if (action === 'move' && request.method === 'POST') {
                    return await handleMove(kv, code, request);
                }
                if (action === 'resign' && request.method === 'POST') {
                    return await handleResign(kv, code, request);
                }
            }

            return json({ success: false, error: '接口不存在' }, 404);
        } catch (e) {
            return json({ success: false, error: '服务器错误: ' + e.message }, 500);
        }
    },
};

// ============ KV 诊断 ============

async function handleDiag(kv) {
    const testKey = 'diag-test';
    const testValue = JSON.stringify({ hello: 'world', time: Date.now() });
    const result = {};

    // 写入
    try {
        await kv.put(testKey, testValue);
        result.put = 'success';
    } catch (e) {
        result.put = 'error: ' + e.message;
    }

    // 立即读（text 模式）
    try {
        const val = await kv.get(testKey, { type: 'text' });
        result.getText = val === undefined ? 'undefined' : (val === testValue ? 'match' : 'mismatch: ' + (val ? val.slice(0, 50) : 'null'));
    } catch (e) {
        result.getText = 'error: ' + e.message;
    }

    // 立即读（json 模式）
    try {
        const val = await kv.get(testKey, { type: 'json' });
        result.getJson = val === undefined ? 'undefined' : 'parsed: ' + JSON.stringify(val).slice(0, 50);
    } catch (e) {
        result.getJson = 'error: ' + e.message;
    }

    // 读一个已知存在的旧 key（room-YC4ZP5）
    try {
        const oldVal = await kv.get('room-YC4ZP5', { type: 'text' });
        result.oldRoom = oldVal === undefined ? 'undefined' : 'found (len=' + oldVal.length + ')';
    } catch (e) {
        result.oldRoom = 'error: ' + e.message;
    }

    return json({ success: true, data: result });
}

// ============ 处理函数 ============

/**
 * 创建房间
 */
async function handleCreateRoom(kv, request) {
    const body = await request.json();
    const playerId = body.playerId;

    if (!playerId) {
        return json({ success: false, error: '缺少 playerId' }, 400);
    }

    // 生成唯一房间号（冲突重试3次）
    let code = '';
    let key = '';
    for (let i = 0; i < 3; i++) {
        code = generateRoomCode();
        key = 'room-' + code;
        const existing = await kvGetJSON(kv, key);
        if (!existing || Date.now() > existing.expiresAt) {
            break;
        }
    }

    const now = Date.now();
    const room = {
        board: generateEmptyBoard(),
        currentTurn: 1,        // 黑先
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

    await kv.put(key, JSON.stringify(room));

    return json({
        success: true,
        data: {
            roomCode: code,
            playerId,
            color: 1,  // 黑
            room,
        },
    });
}

/**
 * 获取房间状态（轮询用）
 */
async function handleGetRoom(kv, code) {
    const key = 'room-' + code;
    const room = await kvGetJSON(kv, key);

    if (!room) {
        return json({ success: false, error: '房间不存在' }, 404);
    }

    // 过期清理
    if (Date.now() > room.expiresAt) {
        await kv.delete(key);
        return json({ success: false, error: '房间已过期' }, 410);
    }

    return json({ success: true, data: { room } });
}

/**
 * 加入房间
 */
async function handleJoinRoom(kv, code, request) {
    const body = await request.json();
    const playerId = body.playerId;

    if (!playerId) {
        return json({ success: false, error: '缺少 playerId' }, 400);
    }

    const key = 'room-' + code;
    const room = await kvGetJSON(kv, key);

    if (!room) {
        return json({ success: false, error: '房间不存在' }, 404);
    }

    if (Date.now() > room.expiresAt) {
        await kv.delete(key);
        return json({ success: false, error: '房间已过期' }, 410);
    }

    // 重连：同 playerId 已在房间中
    if (room.blackPlayer === playerId) {
        return json({ success: true, data: { roomCode: code, playerId, color: 1, room } });
    }
    if (room.whitePlayer === playerId) {
        return json({ success: true, data: { roomCode: code, playerId, color: 2, room } });
    }

    // 新加入
    if (room.whitePlayer !== null) {
        return json({ success: false, error: '房间已满' }, 409);
    }

    room.whitePlayer = playerId;
    room.status = 'playing';
    room.lastMoveAt = Date.now();
    await kv.put(key, JSON.stringify(room));

    return json({
        success: true,
        data: { roomCode: code, playerId, color: 2, room },  // 白
    });
}

/**
 * 落子
 */
async function handleMove(kv, code, request) {
    const body = await request.json();
    const { playerId, x, y } = body;

    if (!playerId || x === undefined || y === undefined) {
        return json({ success: false, error: '缺少参数' }, 400);
    }

    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
        return json({ success: false, error: '坐标越界' }, 400);
    }

    const key = 'room-' + code;
    const room = await kvGetJSON(kv, key);

    if (!room) {
        return json({ success: false, error: '房间不存在' }, 404);
    }
    if (room.status !== 'playing') {
        return json({ success: false, error: '游戏未开始或已结束' }, 400);
    }
    if (room.board[y][x] !== 0) {
        return json({ success: false, error: '该位置已有棋子' }, 400);
    }

    // 确定玩家颜色
    let color = 0;
    if (room.blackPlayer === playerId) color = 1;
    else if (room.whitePlayer === playerId) color = 2;
    else return json({ success: false, error: '你不在该房间中' }, 403);

    // 轮到该玩家？
    if (room.currentTurn !== color) {
        return json({ success: false, error: '还没轮到你' }, 400);
    }

    // 落子
    room.board[y][x] = color;
    room.moves.push({ x, y, p: color, t: Date.now() });
    room.lastMoveAt = Date.now();

    // 胜负判定
    const winResult = checkWin(x, y, room.board);
    if (winResult) {
        room.status = 'finished';
        room.winner = winResult.winner;
        room.winLine = winResult.line;
    } else if (room.moves.length >= BOARD_SIZE * BOARD_SIZE) {
        // 和棋
        room.status = 'finished';
        room.winner = 'draw';
    } else {
        // 切换回合
        room.currentTurn = color === 1 ? 2 : 1;
    }

    await kv.put(key, JSON.stringify(room));

    return json({
        success: true,
        data: { room },
    });
}

/**
 * 认输
 */
async function handleResign(kv, code, request) {
    const body = await request.json();
    const { playerId } = body;

    if (!playerId) {
        return json({ success: false, error: '缺少 playerId' }, 400);
    }

    const key = 'room-' + code;
    const room = await kvGetJSON(kv, key);

    if (!room) {
        return json({ success: false, error: '房间不存在' }, 404);
    }
    if (room.status !== 'playing') {
        return json({ success: false, error: '游戏未在进行中' }, 400);
    }

    let loserColor = 0;
    if (room.blackPlayer === playerId) loserColor = 1;
    else if (room.whitePlayer === playerId) loserColor = 2;
    else return json({ success: false, error: '你不在该房间中' }, 403);

    room.status = 'finished';
    room.winner = loserColor === 1 ? 2 : 1;  // 对手赢
    room.lastMoveAt = Date.now();
    await kv.put(key, JSON.stringify(room));

    return json({ success: true, data: { room } });
}
