/**
 * 碰撞检测与责任判定系统
 *
 * 责任判定规则（基于《中国滑雪运动安全规范》）：
 * 1. 追尾：后方滑雪者全责（前方有优先权）
 * 2. 横穿：横穿雪道者主责（下坡者优先）
 * 3. 超越：超越者责任（不得危及被超越者）
 * 4. 停留：雪道停留者主责（不得无故停留）
 * 5. 速度：超速方承担相应责任
 */
class CollisionSystem {
    /**
     * 检测玩家与 AI 列表的碰撞
     * @returns {Object|null} 碰撞结果 {ai, fault, violation, message} 或 null
     */
    checkCollision(player, aiList) {
        const radius = CONFIG.collision.radius;

        for (const ai of aiList) {
            if (!ai.alive) continue;

            const dx = player.x - ai.x;
            const dy = player.worldY - ai.worldY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < radius * 2) {
                return this._determineFault(player, ai, dist);
            }
        }
        return null;
    }

    /**
     * 判定责任
     */
    _determineFault(player, ai, dist) {
        const playerBehind = player.worldY < ai.worldY; // 玩家在后方
        const playerSpeed = player.speed;
        const aiSpeed = ai.speed;

        // 规则1：雪道停留 —— 停留者主责
        if (ai.behavior === AI_BEHAVIOR.STATIONARY) {
            return {
                ai,
                fault: FAULT_TYPE.AI,
                violation: RULE_VIOLATION.STATIONARY,
                message: '对方停留在雪道中间，违反"不得无故停留"规则',
                playerSpeed,
                aiSpeed,
            };
        }

        // 规则2：突然横穿 —— 横穿者主责
        if (ai.behavior === AI_BEHAVIOR.CROSS && ai.crossing) {
            return {
                ai,
                fault: FAULT_TYPE.AI,
                violation: RULE_VIOLATION.CROSSING,
                message: '对方突然横穿雪道，违反"横穿时下坡者优先"规则',
                playerSpeed,
                aiSpeed,
            };
        }

        // 规则3：追尾 —— 后方全责
        // 世界坐标中 worldY 较小的在后方
        if (playerBehind) {
            // 玩家追尾 AI
            // 如果玩家速度过快，加重责任
            const speeding = playerSpeed > 400;
            return {
                ai,
                fault: FAULT_TYPE.PLAYER,
                violation: speeding ? RULE_VIOLATION.SPEED : RULE_VIOLATION.REAR_END,
                message: speeding
                    ? '你从后方追尾且速度过快，违反"控制速度+前方优先"规则'
                    : '你从后方追尾，前方滑雪者有优先权',
                playerSpeed,
                aiSpeed,
            };
        } else {
            // AI 追尾玩家
            const aiSpeeding = aiSpeed > 400;
            return {
                ai,
                fault: FAULT_TYPE.AI,
                violation: aiSpeeding ? RULE_VIOLATION.SPEED : RULE_VIOLATION.REAR_END,
                message: aiSpeeding
                    ? '对方从后方追尾且速度过快，对方全责'
                    : '对方从后方追尾，对方全责',
                playerSpeed,
                aiSpeed,
            };
        }
    }
}
