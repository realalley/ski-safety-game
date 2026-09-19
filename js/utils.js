/**
 * 工具函数与 Canvas 兼容性补丁
 */

// roundRect 兼容性补丁（部分旧浏览器不支持）
if (typeof CanvasRenderingContext2D !== 'undefined' &&
    typeof CanvasRenderingContext2D.prototype.roundRect !== 'function') {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        if (typeof r === 'number') r = [r, r, r, r];
        const [tl, tr, br, bl] = r;
        this.beginPath();
        this.moveTo(x + tl, y);
        this.lineTo(x + w - tr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + tr);
        this.lineTo(x + w, y + h - br);
        this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
        this.lineTo(x + bl, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - bl);
        this.lineTo(x, y + tl);
        this.quadraticCurveTo(x, y, x + tl, y);
        this.closePath();
        return this;
    };
}

const Utils = {
    /**
     * 限制数值范围
     */
    clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },

    /**
     * 线性插值
     */
    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    /**
     * 角度转弧度
     */
    degToRad(deg) {
        return deg * Math.PI / 180;
    },

    /**
     * 随机整数
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    /**
     * 随机浮点数
     */
    randomFloat(min, max) {
        return Math.random() * (max - min) + min;
    },

    /**
     * 两点间距离
     */
    distance(x1, y1, x2, y2) {
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    },

    /**
     * 绘制圆角矩形
     */
    drawRoundRect(ctx, x, y, w, h, r, fill, stroke) {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.stroke();
        }
    },
};
