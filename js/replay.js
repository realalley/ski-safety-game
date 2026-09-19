/**
 * 事故回放模块
 * 持续记录游戏状态快照，碰撞后慢动作回放最近几秒
 */
class ReplaySystem {
    constructor() {
        this.snapshots = []; // 状态快照环形缓冲
        this.maxSnapshots = 180; // 约3秒（60fps * 3）

        this.isReplaying = false;
        this.replayIndex = 0;
        this.replayTimer = 0;
        this.collisionResult = null;
        this.collisionSnapshotIndex = -1;
    }

    /**
     * 记录一帧状态
     */
    record(player, aiList) {
        if (this.isReplaying) return;

        // 深拷贝AI状态
        const aiStates = aiList.map(ai => ({
            x: ai.x,
            worldY: ai.worldY,
            heading: ai.heading,
            behavior: ai.behavior,
            boardType: ai.boardType,
            color: ai.color,
            crossing: ai.crossing,
        }));

        this.snapshots.push({
            playerX: player.x,
            playerY: player.worldY,
            playerHeading: player.heading,
            playerSpeed: player.speed,
            boardType: player.boardType,
            aiStates,
            time: performance.now() / 1000,
        });

        // 限制缓冲区大小
        if (this.snapshots.length > this.maxSnapshots) {
            this.snapshots.shift();
        }
    }

    /**
     * 碰撞发生时启动回放
     */
    startReplay(collisionResult) {
        this.isReplaying = true;
        this.collisionResult = collisionResult;
        this.collisionSnapshotIndex = this.snapshots.length - 1;
        // 从碰撞前约2秒开始回放
        this.replayIndex = Math.max(0, this.snapshots.length - 120);
        this.replayTimer = 0;
    }

    /**
     * 更新回放进度
     * @returns {boolean} 是否回放结束
     */
    update(dt) {
        if (!this.isReplaying) return false;

        this.replayTimer += dt;
        const frameInterval = 1 / 60 * (1 / CONFIG.replay.playbackSpeed);

        if (this.replayTimer >= frameInterval) {
            this.replayTimer = 0;
            this.replayIndex++;

            if (this.replayIndex >= this.snapshots.length - 1) {
                // 回放结束，停留在最后一帧
                this.replayIndex = this.snapshots.length - 1;
                return true; // 回放结束
            }
        }
        return false;
    }

    /**
     * 获取当前回放帧的快照
     */
    getCurrentSnapshot() {
        if (this.snapshots.length === 0) return null;
        const idx = Math.min(this.replayIndex, this.snapshots.length - 1);
        return this.snapshots[idx];
    }

    /**
     * 获取碰撞帧索引
     */
    getCollisionIndex() {
        return this.collisionSnapshotIndex;
    }

    /**
     * 重置回放系统
     */
    reset() {
        this.snapshots = [];
        this.isReplaying = false;
        this.replayIndex = 0;
        this.replayTimer = 0;
        this.collisionResult = null;
        this.collisionSnapshotIndex = -1;
    }

    /**
     * 退出回放
     */
    exitReplay() {
        this.isReplaying = false;
    }
}
