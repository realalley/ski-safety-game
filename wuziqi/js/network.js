/**
 * 网络模块
 * 负责与边缘函数 API 通信、玩家身份管理、轮询对手状态
 */
const Network = (function () {
    const API_BASE = 'https://api-wuziqi-hwjfijsltb.cn-hangzhou.fcapp.run/api/wuziqi';
    let pollTimer = null;
    let pollCode = null;
    let pollCallback = null;
    let lastMoveAt = 0;
    let unchangedCount = 0;

    /**
     * 获取或生成 playerId
     */
    function getPlayerId() {
        let id = localStorage.getItem('wuziqi_playerId');
        if (!id) {
            id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('wuziqi_playerId', id);
        }
        return id;
    }

    /**
     * 通用 API 请求
     */
    async function api(path, method = 'GET', body = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) opts.body = JSON.stringify(body);

        try {
            const resp = await fetch(API_BASE + path, opts);
            const data = await resp.json();
            if (!data.success) {
                throw new Error(data.error || '请求失败');
            }
            return data.data;
        } catch (e) {
            throw e;
        }
    }

    /**
     * 创建房间
     */
    async function createRoom() {
        return api('/room', 'POST', { playerId: getPlayerId() });
    }

    /**
     * 加入房间
     */
    async function joinRoom(code) {
        return api('/room/' + code + '/join', 'POST', { playerId: getPlayerId() });
    }

    /**
     * 获取房间状态
     */
    async function getRoomState(code) {
        return api('/room/' + code, 'GET');
    }

    /**
     * 落子
     */
    async function makeMove(code, x, y) {
        return api('/room/' + code + '/move', 'POST', {
            playerId: getPlayerId(),
            x, y,
        });
    }

    /**
     * 认输
     */
    async function resign(code) {
        return api('/room/' + code + '/resign', 'POST', {
            playerId: getPlayerId(),
        });
    }

    /**
     * 开始轮询房间状态
     */
    function startPoll(code, onUpdate) {
        stopPoll();
        pollCode = code;
        pollCallback = onUpdate;
        unchangedCount = 0;

        const poll = async () => {
            if (!pollCode) return;
            try {
                const data = await getRoomState(pollCode);
                if (data.room.lastMoveAt !== lastMoveAt || data.room.status !== 'playing') {
                    lastMoveAt = data.room.lastMoveAt;
                    unchangedCount = 0;  // 有变化，重置计数
                    schedulePoll(1500);
                    pollCallback(data.room);
                } else {
                    unchangedCount++;
                    // 连续 10 次无变化后降频到 3s，减少空轮询
                    const interval = unchangedCount > 10 ? 3000 : 1500;
                    schedulePoll(interval);
                }
            } catch (e) {
                pollCallback(null, e.message);
            }
        };

        const schedulePoll = (delay) => {
            if (pollTimer) clearTimeout(pollTimer);
            pollTimer = setTimeout(poll, delay);
        };

        // 立即执行一次
        poll();
    }

    /**
     * 停止轮询
     */
    function stopPoll() {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }
        pollCode = null;
        pollCallback = null;
        unchangedCount = 0;
    }

    return {
        getPlayerId,
        createRoom,
        joinRoom,
        getRoomState,
        makeMove,
        resign,
        startPoll,
        stopPoll,
    };
})();
