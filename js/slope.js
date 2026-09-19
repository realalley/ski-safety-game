/**
 * 雪道背景系统
 * 绘制雪道、边界、雪地纹理、飘落雪花
 */
class Slope {
    constructor(canvasW, canvasH, widthRatio) {
        this.canvasW = canvasW;
        this.canvasH = canvasH;
        this.widthRatio = widthRatio ?? CONFIG.slope.widthRatio;
        this.width = canvasW * this.widthRatio;

        // 雪地纹理偏移（用于滚动）
        this.textureOffset = 0;

        // 雪花粒子
        this.snowflakes = [];
        this._initSnowflakes();
    }

    resize(canvasW, canvasH, widthRatio) {
        this.canvasW = canvasW;
        this.canvasH = canvasH;
        if (widthRatio !== undefined) this.widthRatio = widthRatio;
        this.width = canvasW * this.widthRatio;
    }

    _initSnowflakes() {
        const cfg = CONFIG.snowflakes;
        this.snowflakes = [];
        for (let i = 0; i < cfg.count; i++) {
            this.snowflakes.push({
                x: Math.random() * this.canvasW,
                y: Math.random() * this.canvasH,
                size: Utils.randomFloat(cfg.sizeMin, cfg.sizeMax),
                speed: Utils.randomFloat(cfg.speedMin, cfg.speedMax),
                drift: Utils.randomFloat(-15, 15),
                opacity: Utils.randomFloat(0.3, 0.8),
            });
        }
    }

    /**
     * 更新背景
     * @param {number} dt - 帧间隔
     * @param {number} playerSpeed - 玩家速度（影响滚动速度）
     */
    update(dt, playerSpeed) {
        // 纹理滚动
        this.textureOffset = (this.textureOffset + playerSpeed * dt) % 80;

        // 雪花更新
        const cfg = CONFIG.snowflakes;
        for (const flake of this.snowflakes) {
            // 雪花下落速度 = 基础速度 + 玩家前进速度的一部分（视差）
            flake.y += (flake.speed + playerSpeed * 0.15) * dt;
            flake.x += flake.drift * dt;

            // 循环
            if (flake.y > this.canvasH + 10) {
                flake.y = -10;
                flake.x = Math.random() * this.canvasW;
            }
            if (flake.x < -10) flake.x = this.canvasW + 10;
            if (flake.x > this.canvasW + 10) flake.x = -10;
        }
    }

    /**
     * 绘制雪道
     */
    draw(ctx) {
        const w = this.canvasW;
        const h = this.canvasH;
        const slopeW = this.width;
        const left = (w - slopeW) / 2;
        const right = left + slopeW;

        // ===== 天空/远山背景 =====
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#a8c5db');
        bgGrad.addColorStop(0.25, '#c8dce8');
        bgGrad.addColorStop(0.5, '#e0ebf2');
        bgGrad.addColorStop(1, '#eef4f8');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // ===== 雪道外的雪地（两侧）=====
        ctx.fillStyle = '#d8e3ec';
        ctx.fillRect(0, 0, left, h);
        ctx.fillRect(right, 0, w - right, h);

        // 两侧装饰：简单的松树轮廓
        this._drawSideTrees(ctx, left, right, h);

        // ===== 雪道主体 =====
        const snowGrad = ctx.createLinearGradient(left, 0, right, 0);
        snowGrad.addColorStop(0, CONFIG.slope.snowShade);
        snowGrad.addColorStop(0.15, CONFIG.slope.snowColor);
        snowGrad.addColorStop(0.85, CONFIG.slope.snowColor);
        snowGrad.addColorStop(1, CONFIG.slope.snowShade);
        ctx.fillStyle = snowGrad;
        ctx.fillRect(left, 0, slopeW, h);

        // ===== 雪地纹理（滚动的横向条纹，模拟压雪痕迹）=====
        ctx.strokeStyle = 'rgba(180, 200, 215, 0.25)';
        ctx.lineWidth = 1;
        const stripeGap = 80;
        for (let y = -stripeGap + this.textureOffset; y < h; y += stripeGap) {
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(right, y);
            ctx.stroke();
        }

        // ===== 雪道边界线 =====
        // 发光边界
        ctx.shadowColor = CONFIG.slope.boundaryGlow;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = CONFIG.slope.boundaryColor;
        ctx.lineWidth = 4;

        ctx.beginPath();
        ctx.moveTo(left, 0);
        ctx.lineTo(left, h);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(right, 0);
        ctx.lineTo(right, h);
        ctx.stroke();

        ctx.shadowBlur = 0;

        // 边界内侧浅色线
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(left + 4, 0);
        ctx.lineTo(left + 4, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(right - 4, 0);
        ctx.lineTo(right - 4, h);
        ctx.stroke();

        // ===== 飘落雪花 =====
        for (const flake of this.snowflakes) {
            ctx.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
            ctx.beginPath();
            ctx.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * 绘制两侧的松树（简约剪影）
     */
    _drawSideTrees(ctx, left, right, h) {
        const treePositions = [
            { x: left * 0.3, scale: 1.0 },
            { x: left * 0.6, scale: 0.8 },
            { x: left * 0.15, scale: 1.2 },
            { x: right + (this.canvasW - right) * 0.4, scale: 1.0 },
            { x: right + (this.canvasW - right) * 0.7, scale: 0.85 },
            { x: right + (this.canvasW - right) * 0.2, scale: 1.1 },
        ];

        const scrollOffset = this.textureOffset;
        const treeSpacing = 200;

        for (const tree of treePositions) {
            for (let i = -1; i < 6; i++) {
                const baseY = i * treeSpacing + (scrollOffset % treeSpacing);
                this._drawTree(ctx, tree.x, baseY, tree.scale);
            }
        }
    }

    _drawTree(ctx, x, y, scale) {
        const s = 18 * scale;
        // 树干
        ctx.fillStyle = '#5d4037';
        ctx.fillRect(x - s * 0.1, y, s * 0.2, s * 0.5);
        // 树冠（三角形叠加）
        ctx.fillStyle = '#2e7d32';
        ctx.beginPath();
        ctx.moveTo(x, y - s * 1.2);
        ctx.lineTo(x - s * 0.6, y);
        ctx.lineTo(x + s * 0.6, y);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#388e3c';
        ctx.beginPath();
        ctx.moveTo(x, y - s * 0.8);
        ctx.lineTo(x - s * 0.45, y - s * 0.1);
        ctx.lineTo(x + s * 0.45, y - s * 0.1);
        ctx.closePath();
        ctx.fill();
    }

    getWidth() {
        return this.width;
    }
}
