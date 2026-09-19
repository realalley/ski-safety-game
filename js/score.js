/**
 * 评分追踪器
 * 单局评分数据采集 + 星级判定
 *
 * 评分维度：
 * - 安全距离：每帧到最近 AI 的距离最小值
 * - 避碰：碰撞次数（含回放后继续的累加）
 * - 速度控制：超速时长占比
 * - 规则遵守：玩家全责次数
 *
 * 星级判定：
 * - 1 星：达到目标距离
 * - 2 星：完成 + 玩家全责 0 次
 * - 3 星：完成 + 0 碰撞 + 超速时长占比 < 20%
 * - 碰撞 >=3 次锁定 1 星
 */
class ScoreTracker {
    constructor(levelConfig) {
        this.levelConfig = levelConfig;
        this.targetDistancePx = levelConfig.targetDistance * CONFIG.distanceScale;
        this.overspeedThreshold = levelConfig.overspeedThreshold;

        this.reset();
    }

    reset() {
        this.elapsed = 0;                  // 累计时长（秒）
        this.minDistance = Infinity;       // 到最近 AI 的最小距离（px）
        this.collisionCount = 0;           // 碰撞次数
        this.playerFaultCount = 0;         // 玩家全责次数
        this.overspeedTime = 0;             // 超速累计时长（秒）
    }

    /**
     * 每帧采集：由 Game.update 调用
     */
    recordFrame(player, aiList, dt) {
        this.elapsed += dt;

        // 超速时长
        if (player.speed > this.overspeedThreshold) {
            this.overspeedTime += dt;
        }

        // 到最近 AI 的距离（仅统计 alive 的 AI）
        let minDist = Infinity;
        for (const ai of aiList) {
            if (!ai.alive) continue;
            const d = Utils.distance(player.x, player.worldY, ai.x, ai.worldY);
            if (d < minDist) minDist = d;
        }
        if (minDist < this.minDistance) this.minDistance = minDist;
    }

    /**
     * 碰撞发生时采集：由 Game._onCollision 调用
     */
    recordCollision(fault) {
        this.collisionCount++;
        if (fault === FAULT_TYPE.PLAYER) {
            this.playerFaultCount++;
        }
    }

    /**
     * 回放后继续滑行时采集：由 Game.continueAfterReplay 调用
     */
    recordContinue() {
        // collisionCount 已在 recordCollision 累加，此处保留接口用于未来扩展
    }

    /**
     * 计算星级：由 Game._finishLevel 调用
     * 返回 { stars, breakdown, locked }
     */
    calculateStars(player) {
        const scale = CONFIG.distanceScale;
        const distance_m = player.distance / scale;
        const target_m = this.levelConfig.targetDistance;

        const overspeedRatio = this.elapsed > 0 ? this.overspeedTime / this.elapsed : 0;
        const minDistance_m = this.minDistance === Infinity ? 0 : this.minDistance / scale;

        const breakdown = {
            distance_m: Math.round(distance_m),
            target_m,
            collisionCount: this.collisionCount,
            playerFaultCount: this.playerFaultCount,
            overspeedRatio: Math.round(overspeedRatio * 100) / 100,
            minDistance_m: Math.round(minDistance_m),
        };

        // 未达到目标距离：0 星（不应被调用，但兜底）
        if (distance_m < target_m) {
            return { stars: 0, breakdown, locked: false };
        }

        // 达标：1 星
        let stars = 1;
        let locked = false;

        // 碰撞 >=3 次锁定 1 星
        if (this.collisionCount >= 3) {
            return { stars: 1, breakdown, locked: true };
        }

        // 玩家全责 0 次：2 星
        if (this.playerFaultCount === 0) {
            stars = 2;
        }

        // 0 碰撞 + 超速占比 < 20%：3 星
        if (this.collisionCount === 0 && overspeedRatio < 0.2) {
            stars = 3;
        }

        return { stars, breakdown, locked };
    }

    /**
     * 返回当前统计快照（结算界面展示用）
     */
    getStats() {
        const scale = CONFIG.distanceScale;
        const overspeedRatio = this.elapsed > 0 ? this.overspeedTime / this.elapsed : 0;
        const minDistance_m = this.minDistance === Infinity ? 0 : this.minDistance / scale;
        return {
            collisionCount: this.collisionCount,
            playerFaultCount: this.playerFaultCount,
            overspeedRatio: Math.round(overspeedRatio * 100) / 100,
            minDistance_m: Math.round(minDistance_m),
        };
    }
}
