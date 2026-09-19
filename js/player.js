/**
 * 玩家类
 * 支持双板(ski)和单板(snowboard)，具有不同的物理特性与滑行轨迹
 */
class Player {
    constructor(boardType, slopeWidth) {
        this.boardType = boardType;
        this.config = boardType === BOARD_TYPE.SKI
            ? CONFIG.player.ski
            : CONFIG.player.snowboard;

        // 雪道宽度（用于边界限制）
        this.slopeWidth = slopeWidth;

        // 世界坐标（y 增大表示向前滑行）
        this.x = 0;
        this.worldY = 0;

        // 速度（沿滑行方向的总速度，px/s）
        this.speed = 120;

        // 朝向角度（弧度，0 = 正下方，正 = 向右偏）
        this.heading = 0;

        // 转向角速度
        this.angularVelocity = 0;

        // 横向速度（由 heading 决定）
        this.vx = 0;
        this.vy = 0;

        // 单板摆动相位（用于模拟天然 S 型轨迹）
        this.carvePhase = 0;

        // 滑行距离
        this.distance = 0;

        // 是否存活
        this.alive = true;
    }

    update(dt, input, slopeWidth) {
        if (!this.alive) return;

        this.slopeWidth = slopeWidth;

        // ===== 速度控制 =====
        const cfg = this.config;

        if (input.brake) {
            // 触屏强制刹车（最高优先级）
            this.speed = Math.max(40, this.speed - cfg.brakePower * dt);
        } else if (typeof input.speedInput === 'number' && Math.abs(input.speedInput) > 0.05) {
            // 重力感应速度控制
            if (input.speedInput > 0) {
                // 前倾加速：加速度随前倾程度增强（最多 3 倍加速度）
                const accel = cfg.acceleration * (1 + input.speedInput * 2);
                this.speed = Math.min(cfg.maxSpeed, this.speed + accel * dt);
            } else {
                // 后仰减速：减速力度随后仰程度增强（最高 brakePower）
                this.speed = Math.max(40, this.speed + input.speedInput * cfg.brakePower * dt);
            }
        } else {
            // 中性持机：自然加速到最大速度
            if (this.speed < cfg.maxSpeed) {
                this.speed = Math.min(cfg.maxSpeed, this.speed + cfg.acceleration * dt);
            }
        }

        // ===== 转向控制 =====
        // 目标角速度
        const targetAngularVel = input.turnInput * cfg.turnSpeed * (Math.PI / 180);

        // 平滑过渡到目标角速度
        const responsiveness = cfg.turnResponsiveness;
        this.angularVelocity = Utils.lerp(
            this.angularVelocity,
            targetAngularVel,
            Math.min(1, responsiveness * dt * 6)
        );

        // 单板特性：天然有左右摆动倾向，模拟 S 型刻滑大回转
        if (this.boardType === BOARD_TYPE.SNOWBOARD) {
            this.carvePhase += dt * 0.55; // 低频：大回转周期长
            // 大幅摆动：刻滑回转半径大，轨迹横向跨度大
            const carveSway = Math.sin(this.carvePhase) * 0.95;
            this.heading += (this.angularVelocity + carveSway) * dt;
        } else {
            // 双板：朝向往 0 回归（更倾向直线）
            this.heading += this.angularVelocity * dt;
            if (Math.abs(input.turnInput) < 0.1) {
                this.heading = Utils.lerp(this.heading, 0, Math.min(1, dt * 2));
            }
        }

        // 限制 heading 范围（避免完全横向）
        this.heading = Utils.clamp(this.heading, -Math.PI / 3, Math.PI / 3);

        // ===== 位置更新 =====
        // 速度分量
        this.vx = Math.sin(this.heading) * this.speed;
        this.vy = Math.cos(this.heading) * this.speed;

        this.x += this.vx * dt;
        this.worldY += this.vy * dt;
        this.distance += this.vy * dt;

        // ===== 雪道边界限制 =====
        const halfWidth = this.slopeWidth / 2 - CONFIG.player.radius;
        if (this.x < -halfWidth) {
            this.x = -halfWidth;
            // 撞墙反弹，减速
            this.heading = Math.abs(this.heading) * 0.3;
            this.speed *= 0.7;
        } else if (this.x > halfWidth) {
            this.x = halfWidth;
            this.heading = -Math.abs(this.heading) * 0.3;
            this.speed *= 0.7;
        }
    }

    /**
     * 获取屏幕绘制坐标（相对画布中心）
     * 玩家的屏幕 y 固定，x 跟随世界 x
     */
    getScreenPosition(canvasW, canvasH) {
        return {
            x: canvasW / 2 + this.x,
            y: canvasH * CONFIG.player.screenYRatio,
        };
    }

    /**
     * 绘制玩家（半写实俯视风格）
     */
    draw(ctx, screenX, screenY) {
        ctx.save();
        ctx.translate(screenX, screenY);
        // 旋转到朝向角度（注意：heading 是相对竖直向下的角度）
        ctx.rotate(this.heading);

        if (this.boardType === BOARD_TYPE.SKI) {
            this._drawSki(ctx);
        } else {
            this._drawSnowboard(ctx);
        }

        ctx.restore();
    }

    /**
     * 绘制双板滑雪者
     */
    _drawSki(ctx) {
        const cfg = this.config;
        const r = CONFIG.player.radius;

        // 阴影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.beginPath();
        ctx.ellipse(2, r + 4, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // 两块滑雪板（平行）
        ctx.fillStyle = cfg.accentColor;
        ctx.strokeStyle = '#0a2a4a';
        ctx.lineWidth = 1.5;

        // 左板
        ctx.beginPath();
        ctx.roundRect(-r * 0.55, -r * 1.4, r * 0.4, r * 2.8, r * 0.15);
        ctx.fill();
        ctx.stroke();

        // 右板
        ctx.beginPath();
        ctx.roundRect(r * 0.15, -r * 1.4, r * 0.4, r * 2.8, r * 0.15);
        ctx.fill();
        ctx.stroke();

        // 身体（滑雪服）
        ctx.fillStyle = cfg.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.55, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // 头盔
        ctx.fillStyle = '#37474f';
        ctx.beginPath();
        ctx.arc(0, -r * 0.5, r * 0.42, 0, Math.PI * 2);
        ctx.fill();

        // 头盔高光
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(-r * 0.12, -r * 0.62, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * 绘制单板滑雪者（侧身姿态）
     */
    _drawSnowboard(ctx) {
        const cfg = this.config;
        const r = CONFIG.player.radius;

        // 阴影
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.beginPath();
        ctx.ellipse(2, r + 4, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // 单板（宽板）
        ctx.fillStyle = cfg.accentColor;
        ctx.strokeStyle = '#4a0a0a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-r * 0.35, -r * 1.5, r * 0.7, r * 3.0, r * 0.3);
        ctx.fill();
        ctx.stroke();

        // 单板图案条纹
        ctx.fillStyle = cfg.color;
        ctx.fillRect(-r * 0.35, -r * 0.1, r * 0.7, r * 0.2);

        // 身体（侧身，更宽）
        ctx.fillStyle = cfg.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.7, r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();

        // 头盔
        ctx.fillStyle = '#37474f';
        ctx.beginPath();
        ctx.arc(0, -r * 0.45, r * 0.42, 0, Math.PI * 2);
        ctx.fill();

        // 头盔高光
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(-r * 0.12, -r * 0.57, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
    }
}
