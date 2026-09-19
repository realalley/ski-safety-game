/**
 * 进度管理器
 * 负责关卡进度的 localStorage 持久化、解锁判定、星级更新（取历史最高）
 * 规则：2 星解锁下一关
 */
class ProgressManager {
    constructor() {
        this.STORAGE_KEY = 'skiProgress';
        this.data = this._load();
    }

    /**
     * 从 localStorage 读取进度，解析失败或不存在则返回默认
     */
    _load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                // 兼容性校验
                if (parsed && parsed.stars && parsed.unlocked) {
                    // 确保四关都有星数字段
                    for (const id of CONFIG.levelOrder) {
                        if (typeof parsed.stars[id] !== 'number') parsed.stars[id] = 0;
                    }
                    return parsed;
                }
            }
        } catch (e) {
            // 隐私模式或解析异常，静默降级
        }
        return this._default();
    }

    _default() {
        const stars = {};
        for (const id of CONFIG.levelOrder) stars[id] = 0;
        return { stars, unlocked: CONFIG.levelOrder[0] };
    }

    /**
     * 写入 localStorage，隐私模式失败时静默降级
     */
    _save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            // 静默降级：进度不持久但游戏可玩
        }
    }

    /**
     * 获取指定关卡历史最高星数（0-3）
     */
    getStars(levelId) {
        return this.data.stars[levelId] || 0;
    }

    /**
     * 更新星级（取历史最高）；>=2 星解锁下一关
     */
    setStars(levelId, stars) {
        if (stars > (this.data.stars[levelId] || 0)) {
            this.data.stars[levelId] = stars;
        }
        // 解锁下一关
        if (stars >= 2) {
            const nextId = this.getNextLevelId(levelId);
            if (nextId && !this.isUnlocked(nextId)) {
                this.data.unlocked = nextId;
            }
        }
        this._save();
    }

    /**
     * 关卡是否已解锁：按 levelOrder 顺序，排在 unlocked 之前或等于则解锁
     */
    isUnlocked(levelId) {
        const order = CONFIG.levelOrder;
        const unlockedIdx = order.indexOf(this.data.unlocked);
        const levelIdx = order.indexOf(levelId);
        return levelIdx >= 0 && levelIdx <= unlockedIdx;
    }

    /**
     * 返回最高已解锁关卡 id
     */
    getUnlockedLevelId() {
        return this.data.unlocked;
    }

    /**
     * 返回下一关 id，无则 null
     */
    getNextLevelId(levelId) {
        const order = CONFIG.levelOrder;
        const idx = order.indexOf(levelId);
        if (idx < 0 || idx >= order.length - 1) return null;
        return order[idx + 1];
    }

    /**
     * 清空进度（调试用）
     */
    reset() {
        this.data = this._default();
        try { localStorage.removeItem(this.STORAGE_KEY); } catch (e) {}
    }
}
