/**
 * 游戏主类
 * 整合玩家、轨迹、雪道、AI、碰撞、回放、输入、UI，驱动游戏循环
 */
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // 状态
        this.state = GAME_STATE.MENU;
        this.boardType = BOARD_TYPE.SKI;

        // 系统
        this.input = new InputManager();
        this.ui = new UIManager();
        this.player = null;
        this.trail = null;
        this.slope = null;
        this.aiManager = null;
        this.collisionSystem = new CollisionSystem();
        this.replaySystem = new ReplaySystem();

        // 关卡与进度
        this.currentLevelId = null;
        this.currentLevelConfig = null;
        this.scoreTracker = null;
        this.progressManager = new ProgressManager();

        // 回放控制
        this.inReplay = false;
        this.replayDone = false;

        // 时间
        this.lastTime = 0;
        this.currentTime = 0;
        this.elapsed = 0;

        // 画布尺寸
        this.canvasW = 0;
        this.canvasH = 0;
        this.dpr = 1;

        this._setupCanvas();
        this._bindUI();
        this._bindResize();
        // 初始化关卡卡片显示（星数/解锁状态）
        this.ui.refreshLevelCards(this.progressManager);
    }

    _setupCanvas() {
        this.dpr = window.devicePixelRatio || 1;
        this._resizeCanvas();
    }

    _resizeCanvas() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        this.canvasW = w;
        this.canvasH = h;

        this.canvas.width = w * this.dpr;
        this.canvas.height = h * this.dpr;
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';

        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        if (this.slope) {
            this.slope.resize(w, h, this.currentLevelConfig?.slopeWidthRatio);
        }
    }

    _bindResize() {
        window.addEventListener('resize', () => this._resizeCanvas());
    }

    _bindUI() {
        this.ui.onStart = (boardType, controlMode, levelId) => this.startGame(boardType, controlMode, levelId);
        this.ui.onPause = () => this.pause();
        this.ui.onResume = () => this.resume();
        this.ui.onRestart = () => this.restart();
        this.ui.onContinue = () => this.continueAfterReplay();
        this.ui.onSkipReplay = () => this.skipReplay();
        this.ui.onSettlementNext = () => this._goToNextLevel();
        this.ui.onSettlementReplay = () => this.restart();
        this.ui.onSettlementMenu = () => this._backToMenu();
    }

    async startGame(boardType, controlMode = 'touch', levelId = LEVEL_ID.GREEN) {
        this.boardType = boardType;
        this.input.setControlMode(controlMode);

        // 查找关卡配置
        const levelConfig = CONFIG.levels.find(l => l.id === levelId) || CONFIG.levels[0];
        this.currentLevelId = levelConfig.id;
        this.currentLevelConfig = levelConfig;

        // 重力感应模式：请求权限并校准
        if (controlMode === 'tilt') {
            const granted = await this.input.requestTiltPermission();
            if (!granted) {
                // 权限被拒，回退到触屏模式
                this.input.setControlMode('touch');
                alert('重力感应权限未开启，已切换为触屏模式');
            } else {
                // 延迟校准，等待传感器数据稳定
                setTimeout(() => this.input.calibrateTilt(), 300);
            }
        }

        this.slope = new Slope(this.canvasW, this.canvasH, levelConfig.slopeWidthRatio);
        this.player = new Player(boardType, this.slope.getWidth());
        this.trail = new TrailSystem(boardType);
        this.aiManager = new AIManager(this.slope.getWidth(), levelConfig.ai);
        this.aiManager.prepopulate(this.player.worldY);  // 开局就在雪道上放几个AI
        this.replaySystem.reset();
        this.scoreTracker = new ScoreTracker(levelConfig);
        this.inReplay = false;
        this.replayDone = false;
        this.input.reset();
        this.elapsed = 0;

        this.state = GAME_STATE.PLAYING;
        this.ui.showGame();
        this.ui.hideReplay();
        this.ui.hideSettlement();
    }

    pause() {
        if (this.state !== GAME_STATE.PLAYING) return;
        this.state = GAME_STATE.PAUSED;
        this.ui.showPause();
    }

    resume() {
        if (this.state !== GAME_STATE.PAUSED) return;
        this.state = GAME_STATE.PLAYING;
        this.ui.hidePause();
        this.lastTime = performance.now();
    }

    restart() {
        this.startGame(this.boardType, this.input.controlMode, this.currentLevelId);
    }

    /**
     * 碰撞后继续滑行
     */
    continueAfterReplay() {
        this.scoreTracker.recordContinue();  // 碰撞计数累加（已在 recordCollision 计，此接口预留扩展）
        this.inReplay = false;
        this.replayDone = false;
        this.replaySystem.reset();
        this.ui.hideReplay();
        this.ui.hideSkipReplayBtn();
        // 重置玩家位置到安全处，清除附近AI
        this.player.alive = true;
        this.player.speed = Math.min(this.player.speed, 200);
        // 清除前方一定范围内的AI，避免立即再次碰撞
        if (this.aiManager) {
            this.aiManager.skierList = this.aiManager.skierList.filter(
                ai => Math.abs(ai.worldY - this.player.worldY) > 200
            );
        }
        this.state = GAME_STATE.PLAYING;
    }

    loop(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        let dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        dt = Math.min(dt, 0.05);
        this.currentTime = timestamp / 1000;

        if (this.state === GAME_STATE.PLAYING) {
            this.elapsed += dt;
            if (this.inReplay) {
                this._updateReplay(dt);
            } else {
                this.update(dt);
            }
        }

        this.render();

        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        // 输入
        this.input.update();

        // 玩家
        this.player.update(dt, this.input, this.slope.getWidth());

        // AI
        this.aiManager.setSlopeWidth(this.slope.getWidth());
        this.aiManager.update(dt, this.player);

        // 评分采集：每帧记录距离/超速
        this.scoreTracker.recordFrame(this.player, this.aiManager.getSkierList(), dt);

        // 目标距离判断：达到即结算
        if (this.player.distance >= this.scoreTracker.targetDistancePx) {
            this._finishLevel();
            return;
        }

        // 轨迹采样
        this.trail.addPoint(this.player.x, this.player.worldY, this.currentTime);
        this.trail.update(this.currentTime);

        // 雪道背景
        this.slope.update(dt, this.player.speed);

        // 记录回放快照
        this.replaySystem.record(this.player, this.aiManager.getSkierList());

        // 碰撞检测
        const collision = this.collisionSystem.checkCollision(
            this.player, this.aiManager.getSkierList()
        );
        if (collision) {
            this._onCollision(collision);
        }

        // HUD：传目标距离和关卡名
        this.ui.updateHUD(
            this.player.speed,
            this.player.distance,
            this.currentLevelConfig.targetDistance,
            this.currentLevelConfig.name
        );
    }

    /**
     * 碰撞处理
     */
    _onCollision(collisionResult) {
        this.scoreTracker.recordCollision(collisionResult.fault);  // 采集责任
        this.player.alive = false;
        this.inReplay = true;
        this.replayDone = false;
        this.replaySystem.startReplay(collisionResult);
        this.ui.showSkipReplayBtn();
    }

    /**
     * 跳过回放，直接显示结果
     */
    skipReplay() {
        if (!this.inReplay || this.replayDone) return;
        this.replayDone = true;
        this.ui.hideSkipReplayBtn();
        this.ui.showReplayResult(this.replaySystem.collisionResult);
    }

    /**
     * 关卡完成：计算星级、更新进度、显示结算界面
     */
    _finishLevel() {
        this.state = GAME_STATE.SETTLEMENT;
        const result = this.scoreTracker.calculateStars(this.player);
        this.progressManager.setStars(this.currentLevelId, result.stars);
        const nextId = this.progressManager.getNextLevelId(this.currentLevelId);
        const nextLevel = nextId ? CONFIG.levels.find(l => l.id === nextId) : null;
        this.ui.showSettlement({
            levelName: this.currentLevelConfig.name,
            levelColor: this.currentLevelConfig.color,
            stars: result.stars,
            breakdown: result.breakdown,
            stats: this.scoreTracker.getStats(),
            locked: result.locked,
            hasNext: nextLevel !== null && result.stars >= 2,
            nextLevelName: nextLevel ? nextLevel.name : null,
        });
    }

    /**
     * 挑战下一关
     */
    _goToNextLevel() {
        const nextId = this.progressManager.getNextLevelId(this.currentLevelId);
        if (nextId) {
            this.ui.hideSettlement();
            this.startGame(this.boardType, this.input.controlMode, nextId);
        }
    }

    /**
     * 返回选关菜单
     */
    _backToMenu() {
        this.state = GAME_STATE.MENU;
        this.ui.hideSettlement();
        this.ui.refreshLevelCards(this.progressManager);
        this.ui.showStart();
    }

    /**
     * 更新回放
     */
    _updateReplay(dt) {
        const finished = this.replaySystem.update(dt);
        if (finished && !this.replayDone) {
            this.replayDone = true;
            this.ui.hideSkipReplayBtn();
            // 延迟显示结果界面，让玩家看到碰撞画面
            setTimeout(() => {
                this.ui.showReplayResult(this.replaySystem.collisionResult);
            }, 600);
        }
    }

    render() {
        const ctx = this.ctx;
        const w = this.canvasW;
        const h = this.canvasH;

        ctx.clearRect(0, 0, w, h);

        if (this.state === GAME_STATE.MENU) {
            if (this.slope) {
                this.slope.draw(ctx);
            } else {
                this._drawMenuBackground(ctx, w, h);
            }
            return;
        }

        if (!this.slope || !this.player) return;

        if (this.inReplay) {
            this._renderReplay(ctx, w, h);
        } else {
            this._renderGame(ctx, w, h);
        }
    }

    /**
     * 正常游戏渲染
     */
    _renderGame(ctx, w, h) {
        // 1. 雪道背景
        this.slope.draw(ctx);

        // 2. 轨迹
        this.trail.draw(ctx, this.player.worldY, w, h);

        // 3. AI 滑雪者
        this.aiManager.draw(ctx, this.player.worldY, w, h);

        // 4. 玩家
        const screenPos = this.player.getScreenPosition(w, h);
        this.player.draw(ctx, screenPos.x, screenPos.y);

        // 5. 速度线
        if (this.player.speed > 300) {
            this._drawSpeedLines(ctx, w, h);
        }
    }

    /**
     * 回放渲染：使用快照数据绘制
     */
    _renderReplay(ctx, w, h) {
        const snapshot = this.replaySystem.getCurrentSnapshot();
        if (!snapshot) {
            this._renderGame(ctx, w, h);
            return;
        }

        // 用快照的玩家位置作为相机
        const cameraWorldY = snapshot.playerY;
        const playerScreenY = h * CONFIG.player.screenYRatio;
        const centerX = w / 2;

        // 1. 雪道背景（用快照速度）
        this.slope.draw(ctx);

        // 2. 绘制快照中的 AI
        for (const aiState of snapshot.aiStates) {
            const screenY = playerScreenY - (aiState.worldY - cameraWorldY);
            const screenX = centerX + aiState.x;
            if (screenY < -50 || screenY > h + 50) continue;

            // 临时绘制 AI
            this._drawAISnapshot(ctx, screenX, screenY, aiState);
        }

        // 3. 绘制快照中的玩家
        const playerScreenX = centerX + snapshot.playerX;
        this._drawPlayerSnapshot(ctx, playerScreenX, playerScreenY, snapshot);

        // 4. 回放进度指示
        const collisionIdx = this.replaySystem.getCollisionIndex();
        const currentIdx = this.replaySystem.replayIndex;
        if (currentIdx >= collisionIdx && collisionIdx >= 0) {
            // 碰撞帧高亮
            ctx.save();
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(playerScreenX, playerScreenY, 30, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        // 5. 回放提示文字
        this._drawReplayIndicator(ctx, w, h);
    }

    _drawAISnapshot(ctx, screenX, screenY, aiState) {
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(aiState.heading);

        const r = CONFIG.player.radius;
        const isSnowboard = aiState.boardType === BOARD_TYPE.SNOWBOARD;

        // 阴影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.beginPath();
        ctx.ellipse(2, r + 4, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        if (isSnowboard) {
            ctx.fillStyle = aiState.color;
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(-r * 0.35, -r * 1.5, r * 0.7, r * 3.0, r * 0.3);
            ctx.fill();
            ctx.stroke();
        } else {
            ctx.fillStyle = aiState.color;
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(-r * 0.55, -r * 1.4, r * 0.4, r * 2.8, r * 0.15);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.roundRect(r * 0.15, -r * 1.4, r * 0.4, r * 2.8, r * 0.15);
            ctx.fill();
            ctx.stroke();
        }

        ctx.fillStyle = aiState.color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.55, r * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.fillStyle = '#37474f';
        ctx.beginPath();
        ctx.arc(0, -r * 0.5, r * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _drawPlayerSnapshot(ctx, screenX, screenY, snapshot) {
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(snapshot.playerHeading);

        const r = CONFIG.player.radius;
        const isSnowboard = snapshot.boardType === BOARD_TYPE.SNOWBOARD;
        const cfg = isSnowboard ? CONFIG.player.snowboard : CONFIG.player.ski;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.beginPath();
        ctx.ellipse(2, r + 4, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        if (isSnowboard) {
            ctx.fillStyle = cfg.accentColor;
            ctx.strokeStyle = '#4a0a0a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(-r * 0.35, -r * 1.5, r * 0.7, r * 3.0, r * 0.3);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = cfg.color;
            ctx.fillRect(-r * 0.35, -r * 0.1, r * 0.7, r * 0.2);
        } else {
            ctx.fillStyle = cfg.accentColor;
            ctx.strokeStyle = '#0a2a4a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(-r * 0.55, -r * 1.4, r * 0.4, r * 2.8, r * 0.15);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.roundRect(r * 0.15, -r * 1.4, r * 0.4, r * 2.8, r * 0.15);
            ctx.fill();
            ctx.stroke();
        }

        ctx.fillStyle = cfg.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.55, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#37474f';
        ctx.beginPath();
        ctx.arc(0, -r * 0.5, r * 0.42, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _drawReplayIndicator(ctx, w, h) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        const text = '事故回放中...';
        ctx.font = 'bold 16px sans-serif';
        const textW = ctx.measureText(text).width;
        const x = (w - textW) / 2;
        const y = 80;
        ctx.fillRect(x - 16, y - 24, textW + 32, 36);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    _drawMenuBackground(ctx, w, h) {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#a8c5db');
        bgGrad.addColorStop(0.5, '#c8dce8');
        bgGrad.addColorStop(1, '#e0ebf2');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        const slopeW = w * CONFIG.slope.widthRatio;
        const left = (w - slopeW) / 2;
        ctx.fillStyle = CONFIG.slope.snowColor;
        ctx.fillRect(left, 0, slopeW, h);

        ctx.strokeStyle = CONFIG.slope.boundaryColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(left, 0); ctx.lineTo(left, h);
        ctx.moveTo(left + slopeW, 0); ctx.lineTo(left + slopeW, h);
        ctx.stroke();
    }

    _drawSpeedLines(ctx, w, h) {
        const intensity = Utils.clamp((this.player.speed - 300) / 220, 0, 1);
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 * intensity})`;
        ctx.lineWidth = 2;
        const count = Math.floor(8 * intensity);
        for (let i = 0; i < count; i++) {
            const x = Math.random() * w;
            const y = Math.random() * h;
            const len = 20 + Math.random() * 40;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + len);
            ctx.stroke();
        }
    }
}
