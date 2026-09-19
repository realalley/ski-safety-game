/**
 * 输入处理：触屏 + 键盘 + 重力感应
 *
 * 触屏操作：
 * - 左半屏触摸 → 左转
 * - 右半屏触摸 → 右转
 * - 触摸点位于屏幕下半部分 → 减速
 *
 * 重力感应：
 * - 手机左右倾斜（gamma） → 控制方向
 * - 手机前倾（beta 减小） → 加速
 * - 手机后仰（beta 增大） → 减速
 * - 点击屏幕 → 强制刹车
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
        // 速度输入：-1（减速）~ 1（加速），仅重力感应模式生效
        this.speedInput = 0;
        // 是否强制减速（触屏）
        this.brake = false;

        // 控制模式：'touch' 或 'tilt'
        this.controlMode = 'touch';

        // 陀螺仪相关
        this.tiltEnabled = false;
        this.tiltCalibrated = false;
        this.tiltZero = 0;        // 校准的零点 gamma
        this.tiltGamma = 0;       // 当前 gamma 值
        this.tiltMaxAngle = 25;   // 满转向倾斜角（度）
        this.tiltBeta = 0;        // 当前 beta 值（前后倾斜）
        this.tiltBetaZero = 0;    // 校准的零点 beta
        this.tiltMaxAngleSpeed = 18; // 满加速/减速倾斜角（度）

        // 触屏追踪
        this.activeTouch = null;
        this.touchStartY = 0;
        this.touchCurrentY = 0;

        this._bindEvents();
    }

    /**
     * 请求陀螺仪权限（iOS 13+ 需要）
     */
    async requestTiltPermission() {
        if (typeof DeviceOrientationEvent === 'undefined') {
            return false;
        }
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    this._enableTilt();
                    return true;
                }
                return false;
            } catch (e) {
                return false;
            }
        } else {
            // 非 iOS 设备直接启用
            this._enableTilt();
            return true;
        }
    }

    _enableTilt() {
        this.tiltEnabled = true;
        window.addEventListener('deviceorientation', (e) => this._onDeviceOrientation(e));
    }

    _onDeviceOrientation(e) {
        // gamma: 左右倾斜，范围 -90 ~ 90
        if (e.gamma !== null) {
            this.tiltGamma = e.gamma;
        }
        // beta: 前后倾斜，范围 -180 ~ 180
        // 竖直持机时约 90；前倾（屏幕下沿朝向自己）beta 减小；后仰 beta 增大
        if (e.beta !== null) {
            this.tiltBeta = e.beta;
        }
    }

    /**
     * 校准陀螺仪零点（以当前持机角度为正中）
     */
    calibrateTilt() {
        this.tiltZero = this.tiltGamma;
        this.tiltBetaZero = this.tiltBeta;
        this.tiltCalibrated = true;
    }

    setControlMode(mode) {
        this.controlMode = mode;
        if (mode === 'tilt') {
            this.turnInput = 0;
            this.speedInput = 0;
        }
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

        if (this.controlMode === 'tilt') {
            // 重力感应模式：触屏只用于减速
            this.brake = true;
        } else {
            this._updateTouchInput(touch);
        }
    }

    _onTouchMove(e) {
        e.preventDefault();
        if (this.activeTouch === null) return;

        const touch = this._findTouch(e.touches, this.activeTouch);
        if (!touch) return;

        this.touchCurrentY = touch.clientY;
        if (this.controlMode !== 'tilt') {
            this._updateTouchInput(touch);
        }
    }

    _onTouchEnd(e) {
        e.preventDefault();
        if (this.activeTouch === null) return;

        // 检查活跃触点是否还在
        const touch = this._findTouch(e.touches, this.activeTouch);
        if (!touch) {
            this.activeTouch = null;
            if (this.controlMode !== 'tilt') {
                this.turnInput = 0;
            }
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
     * 每帧更新输入
     */
    update() {
        if (this.controlMode === 'tilt' && this.tiltEnabled && this.tiltCalibrated) {
            // 根据左右倾斜角度计算转向输入
            const offset = this.tiltGamma - this.tiltZero;
            this.turnInput = Utils.clamp(offset / this.tiltMaxAngle, -1, 1);

            // 根据前后倾斜计算速度输入
            // betaOffset < 0（前倾） → 加速；betaOffset > 0（后仰） → 减速
            const betaOffset = this.tiltBeta - this.tiltBetaZero;
            this.speedInput = Utils.clamp(-betaOffset / this.tiltMaxAngleSpeed, -1, 1);
        }
    }

    /**
     * 重置输入状态
     */
    reset() {
        this.turnInput = 0;
        this.speedInput = 0;
        this.brake = false;
        this.activeTouch = null;
    }
}
