/**
 * 轨迹系统
 * 记录玩家世界坐标，绘制渐隐的滑行轨迹线
 * 单板：S型曲线；双板：直线/大弧线
 */
class TrailSystem {
    constructor(boardType) {
        this.boardType = boardType;
        this.points = []; // {x, worldY, time}
        this.maxPoints = CONFIG.trail.maxPoints;
        this.fadeTime = CONFIG.trail.fadeTime;
        this.color = boardType === BOARD_TYPE.SKI
            ? CONFIG.trail.skiColor
            : CONFIG.trail.snowboardColor;

        // 采样间隔（世界距离），避免点过密
        this.sampleDistance = 4;
        this.lastSampleX = 0;
        this.lastSampleY = 0;
        this._lastSet = false;
    }

    /**
     * 添加轨迹点
     */
    addPoint(x, worldY, currentTime) {
        const dx = x - this.lastSampleX;
        const dy = worldY - this.lastSampleY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (!this._lastSet || dist >= this.sampleDistance) {
            this.points.push({ x, worldY, time: currentTime });
            this.lastSampleX = x;
            this.lastSampleY = worldY;
            this._lastSet = true;

            // 限制最大点数
            if (this.points.length > this.maxPoints) {
                this.points.shift();
            }
        }
    }

    /**
     * 清理过期点
     */
    update(currentTime) {
        const expireTime = currentTime - this.fadeTime;
        while (this.points.length > 0 && this.points[0].time < expireTime) {
            this.points.shift();
        }
    }

    /**
     * 绘制轨迹
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} cameraWorldY - 相机的世界Y坐标（玩家当前worldY）
     * @param {number} canvasW
     * @param {number} canvasH
     */
    draw(ctx, cameraWorldY, canvasW, canvasH) {
        if (this.points.length < 2) return;

        const playerScreenY = canvasH * CONFIG.player.screenYRatio;
        const centerX = canvasW / 2;
        const now = performance.now() / 1000;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = CONFIG.trail.lineWidth;

        // 分段绘制，每段根据时间设置透明度
        for (let i = 1; i < this.points.length; i++) {
            const p0 = this.points[i - 1];
            const p1 = this.points[i];

            // 计算透明度（越旧越透明）
            const age0 = now - p0.time;
            const age1 = now - p1.time;
            const alpha0 = Utils.clamp(1 - age0 / this.fadeTime, 0, 1);
            const alpha1 = Utils.clamp(1 - age1 / this.fadeTime, 0, 1);

            if (alpha0 <= 0 && alpha1 <= 0) continue;

            // 世界坐标转屏幕坐标
            // 注意：玩家向前（worldY增大）对应屏幕向上（y减小）
            // 所以已滑行的轨迹（worldY较小）应绘制在玩家身后（屏幕下方）
            const sx0 = centerX + p0.x;
            const sy0 = playerScreenY - (p0.worldY - cameraWorldY);
            const sx1 = centerX + p1.x;
            const sy1 = playerScreenY - (p1.worldY - cameraWorldY);

            // 跳过屏幕外的线段
            const margin = 100;
            if ((sy0 < -margin && sy1 < -margin) || (sy0 > canvasH + margin && sy1 > canvasH + margin)) {
                continue;
            }

            // 使用渐变模拟透明度变化
            const avgAlpha = (alpha0 + alpha1) / 2;
            ctx.strokeStyle = this._colorWithAlpha(avgAlpha);
            ctx.beginPath();
            ctx.moveTo(sx0, sy0);
            ctx.lineTo(sx1, sy1);
            ctx.stroke();
        }
    }

    _colorWithAlpha(alpha) {
        // 从配置的颜色中提取 rgb，替换 alpha
        const base = this.color;
        const match = base.match(/rgba?\(([^)]+)\)/);
        if (match) {
            const parts = match[1].split(',').map(s => s.trim());
            const r = parts[0], g = parts[1], b = parts[2];
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        return base;
    }

    clear() {
        this.points = [];
        this._lastSet = false;
    }
}
