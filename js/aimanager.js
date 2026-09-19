/**
 * AI 管理器
 * 负责 AI 滑雪者的生成、更新、回收
 */
class AIManager {
    constructor(slopeWidth) {
        this.skierList = [];
        this.slopeWidth = slopeWidth;
        this.spawnTimer = 0;
    }

    setSlopeWidth(width) {
        this.slopeWidth = width;
    }

    /**
     * 游戏开始时预生成一批AI，分散在雪道上，让玩家一开始就能看到雪友
     */
    prepopulate(playerWorldY) {
        const halfWidth = this.slopeWidth / 2 - CONFIG.player.radius;
        const cfg = CONFIG.ai;

        // 预生成4个AI，其中至少1个刻滑型，分布在不同距离
        const presets = [
            { behavior: AI_BEHAVIOR.CARVE, dist: 400 },
            { behavior: AI_BEHAVIOR.CARVE, dist: 700 },
            { behavior: AI_BEHAVIOR.STRAIGHT, dist: 550 },
            { behavior: AI_BEHAVIOR.SAFE, dist: 300 },
        ];

        for (const p of presets) {
            const boardType = Math.random() < 0.5 ? BOARD_TYPE.SKI : BOARD_TYPE.SNOWBOARD;
            const x = Utils.randomFloat(-halfWidth * 0.7, halfWidth * 0.7);
            const worldY = playerWorldY + p.dist;
            const color = cfg.colors[Utils.randomInt(0, cfg.colors.length - 1)];
            const skier = new AISkier(p.behavior, boardType, x, worldY, color);
            skier._initialX = x;
            this.skierList.push(skier);
        }
    }

    update(dt, player) {
        const cfg = CONFIG.ai;
        const halfWidth = this.slopeWidth / 2 - CONFIG.player.radius;

        // ===== 生成新 AI =====
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0 && this.skierList.length < cfg.maxCount) {
            this._spawnSkier(player.worldY, halfWidth);
            this.spawnTimer = cfg.spawnInterval * Utils.randomFloat(0.7, 1.3);
        }

        // ===== 更新现有 AI =====
        for (const skier of this.skierList) {
            skier.update(dt, this.slopeWidth, player);
        }

        // ===== 回收远离玩家的 AI =====
        const despawnBehind = player.worldY - cfg.despawnBehindDistance;
        const despawnAhead = player.worldY + 800;
        this.skierList = this.skierList.filter(s => {
            if (s.behavior === AI_BEHAVIOR.TORPEDO) {
                // 鱼雷从后方来，超过玩家前方很远才回收
                return s.worldY < despawnAhead;
            } else {
                // 其他 AI 从前方来，被甩在身后很远才回收
                return s.worldY > despawnBehind;
            }
        });
    }

    _spawnSkier(playerWorldY, halfWidth) {
        const cfg = CONFIG.ai;

        // 根据权重随机选择行为模式
        const behavior = this._pickBehavior();

        // 单板双板比例 1:1
        const boardType = Math.random() < 0.5 ? BOARD_TYPE.SKI : BOARD_TYPE.SNOWBOARD;

        // 生成位置：鱼雷型在玩家后方，其余在前方
        let worldY;
        if (behavior === AI_BEHAVIOR.TORPEDO) {
            // 后方生成：worldY 小于玩家
            worldY = playerWorldY - cfg.torpedo.spawnBehindDistance * Utils.randomFloat(0.8, 1.2);
        } else if (behavior === AI_BEHAVIOR.CARVE) {
            // 刻滑型生成稍远（现在周期短，不需要太远）
            worldY = playerWorldY + cfg.spawnAheadDistance * Utils.randomFloat(1.0, 1.6);
        } else {
            worldY = playerWorldY + cfg.spawnAheadDistance * Utils.randomFloat(0.8, 1.2);
        }

        const x = Utils.randomFloat(-halfWidth * 0.8, halfWidth * 0.8);

        // 颜色（鱼雷在 AISkier 构造中会用专用色覆盖）
        const color = cfg.colors[Utils.randomInt(0, cfg.colors.length - 1)];

        const skier = new AISkier(behavior, boardType, x, worldY, color);
        // 记录横穿型的初始x
        skier._initialX = x;
        this.skierList.push(skier);
    }

    _pickBehavior() {
        const weights = CONFIG.ai.behaviorWeights;
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (const [behavior, weight] of Object.entries(weights)) {
            r -= weight;
            if (r <= 0) return behavior;
        }
        return AI_BEHAVIOR.SAFE;
    }

    /**
     * 绘制所有 AI 及其轨迹
     */
    draw(ctx, cameraWorldY, canvasW, canvasH) {
        const playerScreenY = canvasH * CONFIG.player.screenYRatio;
        const centerX = canvasW / 2;
        const margin = 80;

        // AI 轨迹已禁用（视觉太杂乱）
        // 先绘制所有 AI 本身
        for (const skier of this.skierList) {
            const screenY = playerScreenY - (skier.worldY - cameraWorldY);
            if (screenY < -margin || screenY > canvasH + margin) continue;

            const screenX = centerX + skier.x;
            skier.draw(ctx, screenX, screenY);
        }
    }

    /**
     * 将十六进制颜色转为带透明度的 rgba
     */
    _colorWithAlpha(hexColor, alpha) {
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    getSkierList() {
        return this.skierList;
    }

    clear() {
        this.skierList = [];
        this.spawnTimer = 0;
    }
}
