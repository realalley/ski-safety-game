/**
 * UI 管理器
 * 负责界面切换、按钮事件、HUD 更新
 */
class UIManager {
    constructor() {
        this.selectedBoard = BOARD_TYPE.SKI;
        this.selectedControl = 'touch';
        this.selectedLevel = LEVEL_ID.GREEN;

        this.startScreen = document.getElementById('startScreen');
        this.pauseScreen = document.getElementById('pauseScreen');
        this.replayScreen = document.getElementById('replayScreen');
        this.settlementScreen = document.getElementById('settlementScreen');
        this.hud = document.getElementById('hud');

        this.speedValueEl = document.getElementById('speedValue');
        this.distanceValueEl = document.getElementById('distanceValue');
        this.distanceBarEl = document.getElementById('distanceBar');
        this.levelNameEl = document.getElementById('levelNameValue');

        this.replayFaultEl = document.getElementById('replayFault');
        this.replayRuleEl = document.getElementById('replayRule');
        this.replayAdviceEl = document.getElementById('replayAdvice');

        this.skipReplayBtn = document.getElementById('skipReplayBtn');

        // 结算界面元素
        this.settlementTitleEl = document.getElementById('settlementTitle');
        this.settlementStarsEl = document.getElementById('settlementStars');
        this.settlementStatsEl = document.getElementById('settlementStats');
        this.settlementNextBtn = document.getElementById('settlementNextBtn');

        this._bindEvents();
    }

    _bindEvents() {
        // 滑雪板选择
        document.querySelectorAll('.board-btn[data-board]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.board-btn[data-board]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedBoard = btn.dataset.board;
            });
        });

        // 控制模式选择
        document.querySelectorAll('.board-btn[data-control]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.board-btn[data-control]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedControl = btn.dataset.control;
            });
        });

        // 关卡选择（仅未锁定的可点）
        document.querySelectorAll('.level-card[data-level]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('locked')) return;
                document.querySelectorAll('.level-card[data-level]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedLevel = btn.dataset.level;
            });
        });

        // 开始按钮：传 selectedLevel
        document.getElementById('startBtn').addEventListener('click', () => {
            if (this.onStart) this.onStart(this.selectedBoard, this.selectedControl, this.selectedLevel);
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
        // 跳过回放按钮
        this.skipReplayBtn.addEventListener('click', () => {
            if (this.onSkipReplay) this.onSkipReplay();
        });

        // 结算界面按钮
        this.settlementNextBtn.addEventListener('click', () => {
            if (this.onSettlementNext) this.onSettlementNext();
        });
        document.getElementById('settlementReplayBtn').addEventListener('click', () => {
            if (this.onSettlementReplay) this.onSettlementReplay();
        });
        document.getElementById('settlementMenuBtn').addEventListener('click', () => {
            if (this.onSettlementMenu) this.onSettlementMenu();
        });
    }

    showSkipReplayBtn() {
        this.skipReplayBtn.classList.remove('hidden');
    }

    hideSkipReplayBtn() {
        this.skipReplayBtn.classList.add('hidden');
    }

    showStart() {
        this.startScreen.classList.remove('hidden');
        this.pauseScreen.classList.add('hidden');
        this.replayScreen.classList.add('hidden');
        this.settlementScreen.classList.add('hidden');
        this.hud.classList.add('hidden');
    }

    showGame() {
        this.startScreen.classList.add('hidden');
        this.pauseScreen.classList.add('hidden');
        this.replayScreen.classList.add('hidden');
        this.settlementScreen.classList.add('hidden');
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
     * 刷新关卡卡片：星数、解锁状态、默认选中最高解锁关
     * 由 Game 在 showStart 前调用
     */
    refreshLevelCards(progressManager) {
        const unlockedId = progressManager.getUnlockedLevelId();
        const cards = document.querySelectorAll('.level-card[data-level]');
        cards.forEach(card => {
            const levelId = card.dataset.level;
            const unlocked = progressManager.isUnlocked(levelId);
            const stars = progressManager.getStars(levelId);

            // 锁定状态
            card.classList.toggle('locked', !unlocked);
            const lockEl = card.querySelector('.level-lock');
            if (lockEl) lockEl.classList.toggle('hidden', unlocked);

            // 星级显示
            const starsEl = card.querySelector('.level-stars');
            if (starsEl) {
                const filled = '⭐'.repeat(stars);
                const empty = '☆'.repeat(3 - stars);
                starsEl.textContent = filled + empty;
            }

            // 默认选中最高解锁关
            card.classList.toggle('active', levelId === unlockedId);
            if (levelId === unlockedId) this.selectedLevel = levelId;
        });
    }

    /**
     * 显示关卡结算界面
     * result: { levelName, levelColor, stars, breakdown, stats, locked, hasNext, nextLevelName }
     */
    showSettlement(result) {
        const { levelName, levelColor, stars, breakdown, stats, hasNext, nextLevelName } = result;

        // 标题
        this.settlementTitleEl.textContent = `${levelName}完成！`;
        this.settlementTitleEl.style.color = levelColor;

        // 星级（3 颗，未达灰显）
        let starsHtml = '';
        for (let i = 0; i < 3; i++) {
            if (i < stars) starsHtml += '<span>⭐</span>';
            else starsHtml += '<span class="star-dim">⭐</span>';
        }
        this.settlementStarsEl.innerHTML = starsHtml;

        // 统计网格
        const overspeedPct = Math.round(stats.overspeedRatio * 100);
        this.settlementStatsEl.innerHTML = `
            <div class="stat-item">
                <span class="stat-label">滑行距离</span>
                <span class="stat-value">${breakdown.distance_m}m</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">碰撞次数</span>
                <span class="stat-value">${stats.collisionCount}次</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">玩家全责</span>
                <span class="stat-value">${stats.playerFaultCount}次</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">超速占比</span>
                <span class="stat-value">${overspeedPct}%</span>
            </div>
        `;

        // 下一关按钮
        if (hasNext && nextLevelName) {
            this.settlementNextBtn.textContent = `挑战${nextLevelName}`;
            this.settlementNextBtn.classList.remove('hidden');
        } else {
            this.settlementNextBtn.classList.add('hidden');
        }

        this.settlementScreen.classList.remove('hidden');
    }

    hideSettlement() {
        this.settlementScreen.classList.add('hidden');
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
     * speed: 玩家速度(px/s)；distance: 像素累计距离；targetDistance: 目标距离(米)；levelName: 关卡名
     */
    updateHUD(speed, distance, targetDistance, levelName) {
        const kmh = Math.round(speed * CONFIG.speedDisplay.factor);
        const distance_m = Math.round(distance / CONFIG.distanceScale);
        this.speedValueEl.textContent = kmh;
        if (targetDistance) {
            this.distanceValueEl.textContent = `${distance_m}/${targetDistance}m`;
            const progress = Math.min(1, distance_m / targetDistance);
            if (this.distanceBarEl) this.distanceBarEl.style.width = (progress * 100) + '%';
        } else {
            this.distanceValueEl.textContent = distance_m + 'm';
        }
        if (this.levelNameEl && levelName) this.levelNameEl.textContent = levelName;
    }
}
