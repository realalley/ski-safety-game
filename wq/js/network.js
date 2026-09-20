/**
 * 围棋网络模块
 */
const Network = (function () {
    const API_BASE = 'https://api-wq-vjbdnpjdmg.cn-hangzhou.fcapp.run/api/wq';
    let pollTimer = null;
    let pollCode = null;
    let pollCallback = null;
    let lastMoveAt = 0;

    function getPlayerId() {
        let id = localStorage.getItem('wq_playerId');
        if (!id) {
            id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('wq_playerId', id);
        }
        return id;
    }

    function saveSession(roomCode) {
        localStorage.setItem('wq_roomCode', roomCode);
    }

    function getSavedRoomCode() {
        return localStorage.getItem('wq_roomCode');
    }

    function clearSession() {
        localStorage.removeItem('wq_roomCode');
    }

    async function api(path, method = 'GET', body = null) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const resp = await fetch(API_BASE + path, opts);
        const data = await resp.json();
        if (!data.success) throw new Error(data.error || '请求失败');
        return data.data;
    }

    async function createRoom(boardSize, color) {
        return api('/room', 'POST', { playerId: getPlayerId(), boardSize, color });
    }

    async function joinRoom(code) {
        return api('/room/' + code + '/join', 'POST', { playerId: getPlayerId() });
    }

    async function getRoomState(code) {
        return api('/room/' + code, 'GET');
    }

    async function makeMove(code, x, y) {
        return api('/room/' + code + '/move', 'POST', { playerId: getPlayerId(), x, y });
    }

    async function pass(code) {
        return api('/room/' + code + '/pass', 'POST', { playerId: getPlayerId() });
    }

    async function resign(code) {
        return api('/room/' + code + '/resign', 'POST', { playerId: getPlayerId() });
    }

    function startPoll(code, onUpdate) {
        stopPoll();
        pollCode = code;
        pollCallback = onUpdate;
        const poll = async () => {
            if (!pollCode) return;
            try {
                const data = await getRoomState(pollCode);
                if (data.room.lastMoveAt !== lastMoveAt || data.room.status !== 'playing') {
                    lastMoveAt = data.room.lastMoveAt;
                    pollCallback(data.room);
                }
                schedulePoll(1500);
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
    }

    return {
        getPlayerId, saveSession, getSavedRoomCode, clearSession,
        createRoom, joinRoom, getRoomState, makeMove, pass, resign,
        startPoll, stopPoll,
    };
})();
