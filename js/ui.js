/**
 * UI 管理器
 * 负责界面切换、按钮事件、HUD 更新
 */
class UIManager {
    constructor() {
        this.selectedBoard = BOARD_TYPE.SKI;

        this.startScreen = document.getElementById('startScreen');
        this.pauseScreen = document.getElementById('pauseScreen');
        this.replayScreen = document.getElementById('replayScreen');
        this.hud = document.getElementById('hud');

        this.speedValueEl = document.getElementById('speedValue');
        this.distanceValueEl = document.getElementById('distanceValue');

        this.replayFaultEl = document.getElementById('replayFault');
        this.replayRuleEl = document.getElementById('replayRule');
        this.replayAdviceEl = document.getElementById('replayAdvice');

        this._bindEvents();
    }

    _bindEvents() {
        // 滑雪板选择
        document.querySelectorAll('.board-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.board-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedBoard = btn.dataset.board;
            });
        });

        // 开始按钮
        document.getElementById('startBtn').addEventListener('click', () => {
            if (this.onStart) this.onStart(this.selectedBoard);
        });

        // 暂停/继续/重开
        document.getElementById('pauseBtn').addEventListener('click', () => {
            if (this.onPause) this.onPause();
        });
        document.getElementById('resumeBtn').addEventListener('click', () => {
            if (this.onResume) this.onResume();
        });
        document.getElementById('restartBtn').addEventListener('click', () => {
            if (this.onRestart) this.onRestart();
        });

        // 回放结果界面
        document.getElementById('continueBtn').addEventListener('click', () => {
            if (this.onContinue) this.onContinue();
        });
        document.getElementById('replayRestartBtn').addEventListener('click', () => {
            if (this.onRestart) this.onRestart();
        });
    }

    showStart() {
        this.startScreen.classList.remove('hidden');
        this.pauseScreen.classList.add('hidden');
        this.replayScreen.classList.add('hidden');
        this.hud.classList.add('hidden');
    }

    showGame() {
        this.startScreen.classList.add('hidden');
        this.pauseScreen.classList.add('hidden');
        this.replayScreen.classList.add('hidden');
        this.hud.classList.remove('hidden');
    }

    showPause() {
        this.pauseScreen.classList.remove('hidden');
    }

    hidePause() {
        this.pauseScreen.classList.add('hidden');
    }

    /**
     * 显示事故回放结果
     */
    showReplayResult(collisionResult) {
        const { fault, violation, message } = collisionResult;

        // 责任标签
        let faultText, faultClass;
        switch (fault) {
            case FAULT_TYPE.PLAYER:
                faultText = '⚠️ 你的责任';
                faultClass = 'player';
                break;
            case FAULT_TYPE.AI:
                faultText = '✅ 对方责任';
                faultClass = 'ai';
                break;
            case FAULT_TYPE.BOTH:
                faultText = '⚖️ 双方责任';
                faultClass = 'both';
                break;
        }
        this.replayFaultEl.textContent = faultText;
        this.replayFaultEl.className = 'fault-badge ' + faultClass;

        // 规则说明
        this.replayRuleEl.innerHTML = `<p>${violation}</p><p style="margin-top:8px;opacity:0.85">${message}</p>`;

        // 避免建议
        const advice = this._getAdvice(fault, violation);
        this.replayAdviceEl.innerHTML = `<p>${advice}</p>`;

        this.replayScreen.classList.remove('hidden');
    }

    hideReplay() {
        this.replayScreen.classList.add('hidden');
    }

    /**
     * 根据责任和违规类型给出避免建议
     */
    _getAdvice(fault, violation) {
        if (fault === FAULT_TYPE.AI) {
            return '虽然对方全责，但滑雪时仍需时刻观察前方和周围情况，提前预判他人轨迹，保持安全距离。';
        }

        if (violation === RULE_VIOLATION.REAR_END) {
            return '前方滑雪者拥有雪道优先权。滑行时务必与前方保持安全距离，控制速度确保能随时停下避让。';
        }
        if (violation === RULE_VIOLATION.SPEED) {
            return '速度过快会导致反应时间不足。请根据雪道人流和自身水平控制速度，避免高速冲向人群。';
        }
        if (violation === RULE_VIOLATION.CROSSING) {
            return '横穿或变道前务必观察后方，确保不影响下坡者。突然横穿是相撞事故的高发原因。';
        }
        if (violation === RULE_VIOLATION.STATIONARY) {
            return '不要停留在雪道中间。如需休息或调整装备，请移到雪道边缘。';
        }
        if (violation === RULE_VIOLATION.OVERTAKE) {
            return '超越他人时必须从侧面安全超越，并为被超越者预留足够空间，不得切入其滑行线路。';
        }
        return '请遵守滑雪安全规则，时刻保持警惕。';
    }

    /**
     * 更新 HUD 数值
     */
    updateHUD(speed, distance) {
        const kmh = Math.round(speed * CONFIG.speedDisplay.factor);
        this.speedValueEl.textContent = kmh;
        this.distanceValueEl.textContent = Math.round(distance) + 'm';
    }
}
