/**
 * 输入处理：触屏 + 键盘
 *
 * 触屏操作：
 * - 左半屏触摸 → 左转
 * - 右半屏触摸 → 右转
 * - 触摸点位于屏幕下半部分 → 减速
 *
 * 键盘操作：
 * - ArrowLeft / A → 左转
 * - ArrowRight / D → 右转
 * - ArrowDown / S → 减速
 */
class InputManager {
    constructor() {
        // 转向输入：-1（左）~ 1（右）
        this.turnInput = 0;
        // 是否减速
        this.brake = false;

        // 触屏追踪
        this.activeTouch = null;
        this.touchStartY = 0;
        this.touchCurrentY = 0;

        this._bindEvents();
    }

    _bindEvents() {
        // 键盘事件
        window.addEventListener('keydown', (e) => this._onKeyDown(e));
        window.addEventListener('keyup', (e) => this._onKeyUp(e));

        // 触屏事件
        const canvas = document.getElementById('gameCanvas');
        canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
        canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
        canvas.addEventListener('touchend', (e) => this._onTouchEnd(e), { passive: false });
        canvas.addEventListener('touchcancel', (e) => this._onTouchEnd(e), { passive: false });
    }

    _onKeyDown(e) {
        switch (e.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                this.turnInput = -1;
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                this.turnInput = 1;
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                this.brake = true;
                break;
        }
    }

    _onKeyUp(e) {
        switch (e.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                if (this.turnInput < 0) this.turnInput = 0;
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                if (this.turnInput > 0) this.turnInput = 0;
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                this.brake = false;
                break;
        }
    }

    _onTouchStart(e) {
        e.preventDefault();
        if (this.activeTouch !== null) return;

        const touch = e.touches[0];
        this.activeTouch = touch.identifier;
        this.touchStartY = touch.clientY;
        this.touchCurrentY = touch.clientY;

        this._updateTouchInput(touch);
    }

    _onTouchMove(e) {
        e.preventDefault();
        if (this.activeTouch === null) return;

        const touch = this._findTouch(e.touches, this.activeTouch);
        if (!touch) return;

        this.touchCurrentY = touch.clientY;
        this._updateTouchInput(touch);
    }

    _onTouchEnd(e) {
        e.preventDefault();
        if (this.activeTouch === null) return;

        // 检查活跃触点是否还在
        const touch = this._findTouch(e.touches, this.activeTouch);
        if (!touch) {
            this.activeTouch = null;
            this.turnInput = 0;
            this.brake = false;
        }
    }

    _updateTouchInput(touch) {
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        const centerX = screenW / 2;

        // 转向：根据触摸点 x 相对屏幕中心的偏移
        const offsetX = touch.clientX - centerX;
        // 归一化到 -1 ~ 1，考虑半屏宽度
        this.turnInput = Utils.clamp(offsetX / (screenW * 0.4), -1, 1);

        // 减速：触摸点在屏幕下半部分，或者手指向下滑动超过阈值
        const inBottomHalf = touch.clientY > screenH * 0.55;
        const dragDown = (this.touchCurrentY - this.touchStartY) > 30;
        this.brake = inBottomHalf || dragDown;
    }

    _findTouch(touches, identifier) {
        for (let i = 0; i < touches.length; i++) {
            if (touches[i].identifier === identifier) return touches[i];
        }
        return null;
    }

    /**
     * 每帧重置瞬态输入（持续型输入由事件维护，这里无需额外处理）
     */
    update() {
        // turnInput 和 brake 由事件持续维护
    }

    /**
     * 重置输入状态
     */
    reset() {
        this.turnInput = 0;
        this.brake = false;
        this.activeTouch = null;
    }
}
