/**
 * 网络模块 - 与 FC 函数通信
 */
const Network = (function () {
    const API_BASE = 'https://gdy-wuziqi-hwjlctsltb.cn-hangzhou.fcapp.run/api/gdy';
    let pollTimer = null;
    let pollCode = null;
    let pollCallback = null;
    let lastVersion = -1;

    function getPlayerId() {
        let id = localStorage.getItem('gdy_playerId');
        if (!id) {
            id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('gdy_playerId', id);
        }
        return id;
    }

    function getPlayerName() {
        return localStorage.getItem('gdy_playerName') || '玩家';
    }

    function setPlayerName(name) {
        localStorage.setItem('gdy_playerName', name);
    }

    async function api(path, method = 'GET', body = null) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        try {
            const resp = await fetch(API_BASE + path, opts);
            const data = await resp.json();
            if (!data.success) throw new Error(data.error || '请求失败');
            return data.data;
        } catch (e) { throw e; }
    }

    async function createRoom() {
        return api('/room', 'POST', { playerId: getPlayerId(), playerName: getPlayerName() });
    }

    async function joinRoom(code) {
        return api('/room/' + code + '/join', 'POST', { playerId: getPlayerId(), playerName: getPlayerName() });
    }

    async function getRoomState(code) {
        return api('/room/' + code, 'GET');
    }

    async function startGame(code) {
        return api('/room/' + code + '/start', 'POST', { playerId: getPlayerId() });
    }

    async function playCards(code, cards) {
        return api('/room/' + code + '/play', 'POST', { playerId: getPlayerId(), cards });
    }

    async function pass(code) {
        return api('/room/' + code + '/pass', 'POST', { playerId: getPlayerId() });
    }

    async function getHint(code) {
        return api('/room/' + code + '/hint', 'POST', { playerId: getPlayerId() });
    }

    async function leaveRoom(code) {
        return api('/room/' + code + '/leave', 'POST', { playerId: getPlayerId() });
    }

    function startPoll(code, onUpdate) {
        stopPoll();
        pollCode = code;
        pollCallback = onUpdate;
        lastVersion = -1;
        const poll = async () => {
            if (!pollCode) return;
            try {
                const data = await getRoomState(pollCode);
                if (data.version !== lastVersion) {
                    lastVersion = data.version;
                    pollCallback(data.room);
                }
            } catch (e) {
                pollCallback(null, e.message);
            }
            schedulePoll(1500);
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

    return { getPlayerId, getPlayerName, setPlayerName, createRoom, joinRoom, getRoomState, startGame, playCards, pass, getHint, leaveRoom, startPoll, stopPoll };
})();
