/**
 * AI 滑雪者类
 * 支持5种行为模式：直冲、S型刻滑、突然横穿、安全滑行、雪道停留
 */
class AISkier {
    constructor(behavior, boardType, x, worldY, color) {
        this.behavior = behavior;
        this.boardType = boardType;
        this.x = x;
        this.worldY = worldY;
        this.color = color;

        this.speed = 0;
        this.heading = 0;
        this.alive = true;

        // 行为内部状态
        this.phase = Math.random() * Math.PI * 2;  // S型摆动相位
        this.crossTimer = Utils.randomFloat(1.5, 3.5); // 横穿触发计时
        this.crossing = false;
        this.crossDir = 1;

        // 轨迹记录（让玩家看清AI的滑行轨迹）
        this.trailPoints = [];
        this.trailSampleDist = 12;  // 采样间隔
        this._lastTrailX = x;
        this._lastTrailY = worldY;

        // 根据行为模式设置初始属性
        this._initBehavior();

        // 刻滑型：预填充历史轨迹，一出现就有完整S弯
        if (this.behavior === AI_BEHAVIOR.CARVE) {
            this._prepopulateCarveTrail();
        }
    }

    /**
     * 预填充刻滑轨迹：模拟AI已滑行一段时间，让轨迹一出现就是完整S型
     */
    _prepopulateCarveTrail() {
        const speed = this.speed;
        const freq = 2.0;
        const amplitude = 0.65;
        const scale = 2.0;
        const dt = 0.016;
        const backSeconds = 6;  // 往回模拟6秒（约2个S弯周期）
        const steps = Math.floor(backSeconds / dt);

        let phase = this.phase;
        let x = this.x;
        let worldY = this.worldY;
        const temp = [];

        for (let i = 0; i < steps; i++) {
            phase -= dt * freq;
            const raw = Math.sin(phase) * scale;
            const heading = Math.max(-amplitude, Math.min(amplitude, raw));
            x -= Math.sin(heading) * speed * dt;
            worldY -= Math.cos(heading) * speed * dt;
            // 简单边界约束
            x = Math.max(-155, Math.min(155, x));
            if (i % 3 === 0) temp.push({ x, worldY });
        }

        temp.reverse();
        this.trailPoints = temp;
        this._lastTrailX = this.x;
        this._lastTrailY = this.worldY;
    }

    _initBehavior() {
        switch (this.behavior) {
            case AI_BEHAVIOR.STRAIGHT:
                this.speed = Utils.randomFloat(280, 380);
                this.heading = Utils.randomFloat(-0.08, 0.08);
                break;
            case AI_BEHAVIOR.CARVE:
                // 单板刻滑大回转：heading大导致纵向速度降低，需提高基础速度补偿
                this.speed = Utils.randomFloat(360, 440);
                break;
            case AI_BEHAVIOR.CROSS:
                this.speed = Utils.randomFloat(200, 280);
                this.crossDir = Math.random() < 0.5 ? 1 : -1;
                break;
            case AI_BEHAVIOR.SAFE:
                this.speed = Utils.randomFloat(180, 240);
                this.heading = Utils.randomFloat(-0.1, 0.1);
                break;
            case AI_BEHAVIOR.STATIONARY:
                this.speed = 0;
                this.heading = Utils.randomFloat(-0.3, 0.3);
                break;
            case AI_BEHAVIOR.TORPEDO:
                // 鱼雷：极高速，直冲，不避让
                const tcfg = CONFIG.ai.torpedo;
                this.speed = Utils.randomFloat(tcfg.speedMin, tcfg.speedMax);
                this.heading = Utils.randomFloat(-0.05, 0.05);
                this.color = tcfg.color;
                break;
        }
    }

    update(dt, slopeWidth, player) {
        if (!this.alive) return;

        const halfWidth = slopeWidth / 2 - CONFIG.player.radius;

        switch (this.behavior) {
            case AI_BEHAVIOR.STRAIGHT:
                this._updateStraight(dt);
                break;
            case AI_BEHAVIOR.CARVE:
                this._updateCarve(dt);
                break;
            case AI_BEHAVIOR.CROSS:
                this._updateCross(dt);
                break;
            case AI_BEHAVIOR.SAFE:
                this._updateSafe(dt, player);
                break;
            case AI_BEHAVIOR.STATIONARY:
                // 不动
                break;
            case AI_BEHAVIOR.TORPEDO:
                this._updateTorpedo(dt);
                break;
        }

        // 通用位置更新
        const vx = Math.sin(this.heading) * this.speed;
        const vy = Math.cos(this.heading) * this.speed;
        this.x += vx * dt;
        this.worldY += vy * dt;

        // 边界处理
        if (this.x < -halfWidth) {
            this.x = -halfWidth;
            if (this.behavior === AI_BEHAVIOR.CARVE) {
                // 刻滑型：反转相位，让heading反向，平滑转弯
                this.phase = -this.phase;
            } else {
                this.heading = Math.abs(this.heading) * 0.5;
            }
        } else if (this.x > halfWidth) {
            this.x = halfWidth;
            if (this.behavior === AI_BEHAVIOR.CARVE) {
                this.phase = -this.phase;
            } else {
                this.heading = -Math.abs(this.heading) * 0.5;
            }
        }

        // 记录轨迹点
        const dx = this.x - this._lastTrailX;
        const dy = this.worldY - this._lastTrailY;
        if (Math.sqrt(dx * dx + dy * dy) >= this.trailSampleDist) {
            this.trailPoints.push({ x: this.x, worldY: this.worldY });
            this._lastTrailX = this.x;
            this._lastTrailY = this.worldY;
            // 限制轨迹点数（刻滑型需要足够长以显示完整S弯）
            if (this.trailPoints.length > 500) {
                this.trailPoints.shift();
            }
        }
    }

    // 直线冲坡：几乎不转弯，保持高速
    _updateStraight(dt) {
        this.heading = Utils.lerp(this.heading, 0, dt * 1.5);
    }

    // 鱼雷：极高速直冲，不转弯不避让
    _updateTorpedo(dt) {
        // 保持 heading 几乎为 0，直冲下去
        this.heading = Utils.lerp(this.heading, 0, dt * 3);
    }

    // 单板刻滑大回转：clipped sine 模型，弯中段为纯圆弧（heading恒定），过渡段快速换刃
    _updateCarve(dt) {
        this.phase += dt * 2.0;            // 周期约3.1秒，一个屏幕可显示完整S弯
        const raw = Math.sin(this.phase) * 2.0;  // scale=2，大部分时间被削顶
        this.heading = Math.max(-0.65, Math.min(0.65, raw));  // heading±37°，真实刻滑角度
    }

    // 突然横穿：滑行一段时间后突然横向移动
    _updateCross(dt) {
        if (!this.crossing) {
            this.crossTimer -= dt;
            // 正常小幅度摆动
            this.phase += dt * 0.6;
            this.heading = Math.sin(this.phase) * 0.15;

            if (this.crossTimer <= 0) {
                this.crossing = true;
                this.heading = this.crossDir * 1.2; // 大角度横穿
            }
        } else {
            // 横穿中，保持大角度
            this.heading = this.crossDir * 1.2;
            // 横穿一段距离后恢复正常滑行
            if (Math.abs(this.x - this._initialX) > 80) {
                this.crossing = false;
                this.crossTimer = Utils.randomFloat(2, 4);
                this.crossDir *= -1;
                this._initialX = this.x; // 更新基准位置
            }
        }
    }

    // 安全滑行：保持适中速度，小幅度转弯
    _updateSafe(dt, player) {
        this.phase += dt * 0.5;
        this.heading = Math.sin(this.phase) * 0.12;
        // 如果玩家靠近，稍微让开
        if (player && Math.abs(player.x - this.x) < 60) {
            const away = player.x > this.x ? -1 : 1;
            this.heading = away * 0.25;
        }
    }

    getScreenPosition(cameraWorldY, canvasW, canvasH) {
        const playerScreenY = canvasH * CONFIG.player.screenYRatio;
        return {
            x: canvasW / 2 + this.x,
            y: playerScreenY - (this.worldY - cameraWorldY),
        };
    }

    /**
     * 绘制 AI 滑雪者
     */
    draw(ctx, screenX, screenY) {
        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.rotate(this.heading);

        const r = CONFIG.player.radius;
        const isSnowboard = this.boardType === BOARD_TYPE.SNOWBOARD;

        // 阴影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.beginPath();
        ctx.ellipse(2, r + 4, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        if (isSnowboard) {
            // 单板
            ctx.fillStyle = this.color;
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(-r * 0.35, -r * 1.5, r * 0.7, r * 3.0, r * 0.3);
            ctx.fill();
            ctx.stroke();
        } else {
            // 双板
            ctx.fillStyle = this.color;
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

        // 身体
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.55, r * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // 头盔
        ctx.fillStyle = '#37474f';
        ctx.beginPath();
        ctx.arc(0, -r * 0.5, r * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }
}
