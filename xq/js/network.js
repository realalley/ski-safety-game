/**
 * 象棋网络模块
 */
const Network = (function () {
    const API_BASE = 'https://api-xq-vjbdnpsdmg.cn-hangzhou.fcapp.run/api/xq';
    let pollTimer = null;
    let pollCode = null;
    let pollCallback = null;
    let lastMoveAt = 0;
    let unchangedCount = 0;

    function getPlayerId() {
        let id = localStorage.getItem('xq_playerId');
        if (!id) {
            id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('xq_playerId', id);
        }
        return id;
    }

    function setPlayerId(id) {
        localStorage.setItem('xq_playerId', id);
    }

    async function api(path, method = 'GET', body = null) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const resp = await fetch(API_BASE + path, opts);
        const data = await resp.json();
        if (!data.success) throw new Error(data.error || '请求失败');
        return data.data;
    }

    async function createRoom(playerName) {
        return api('/room', 'POST', { playerId: getPlayerId(), playerName });
    }

    async function joinRoom(code, playerName) {
        return api('/room/' + code + '/join', 'POST', { playerId: getPlayerId(), playerName });
    }

    async function getRoomState(code) {
        return api('/room/' + code, 'GET');
    }

    async function makeMove(code, from, to) {
        return api('/room/' + code + '/move', 'POST', { playerId: getPlayerId(), from, to });
    }

    async function resign(code) {
        return api('/room/' + code + '/resign', 'POST', { playerId: getPlayerId() });
    }

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
                    unchangedCount = 0;
                    schedulePoll(1500);
                    pollCallback(data.room);
                } else {
                    unchangedCount++;
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

        poll();
    }

    function stopPoll() {
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        pollCode = null;
        pollCallback = null;
        unchangedCount = 0;
    }

    return { getPlayerId, setPlayerId, createRoom, joinRoom, getRoomState, makeMove, resign, startPoll, stopPoll };
})();
