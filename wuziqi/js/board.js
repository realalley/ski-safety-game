/**
 * 棋盘渲染模块
 * 负责 Canvas 绘制、触摸输入、坐标转换、胜负判定
 */
const Board = (function () {
    const SIZE = 15;
    const STAR_POINTS = [[3,3],[3,11],[11,3],[11,11],[7,7]];

    let canvas, ctx;
    let cellSize = 0;
    let padding = 0;
    let dpr = 1;
    let onTapCallback = null;

    /**
     * 初始化 Canvas
     */
    function init(canvasEl, onTap) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        onTapCallback = onTap;
        resize();
        // 防抖 resize
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(resize, 150);
        });

        // 触摸/点击事件
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('touchend', handleTouch, { passive: false });
    }

    function resize() {
        dpr = window.devicePixelRatio || 1;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // 棋盘为正方形，取宽高较小者的 92%
        const boardSize = Math.min(vw, vh) * 0.92;
        canvas.style.width = boardSize + 'px';
        canvas.style.height = boardSize + 'px';
        canvas.width = boardSize * dpr;
        canvas.height = boardSize * dpr;

        // 居中
        canvas.style.left = ((vw - boardSize) / 2) + 'px';
        canvas.style.top = ((vh - boardSize) / 2) + 'px';

        padding = (boardSize * dpr) * 0.04;       // 边距约 4%
        cellSize = ((boardSize * dpr) - padding * 2) / (SIZE - 1);
    }

    function handleClick(e) {
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) * dpr;
        const py = (e.clientY - rect.top) * dpr;
        const pos = pixelToBoard(px, py);
        if (pos && onTapCallback) onTapCallback(pos.x, pos.y);
    }

    function handleTouch(e) {
        e.preventDefault();
        if (e.changedTouches.length === 0) return;
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        const px = (touch.clientX - rect.left) * dpr;
        const py = (touch.clientY - rect.top) * dpr;
        const pos = pixelToBoard(px, py);
        if (pos && onTapCallback) onTapCallback(pos.x, pos.y);
    }

    /**
     * 像素坐标转棋盘坐标
     */
    function pixelToBoard(px, py) {
        const x = Math.round((px - padding) / cellSize);
        const y = Math.round((py - padding) / cellSize);
        if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return null;
        // 容差检查：离交叉点太远不算
        const dx = Math.abs(px - (padding + x * cellSize));
        const dy = Math.abs(py - (padding + y * cellSize));
        if (dx > cellSize * 0.4 || dy > cellSize * 0.4) return null;
        return { x, y };
    }

    /**
     * 绘制棋盘
     * @param {number[][]} board - 15x15 数组
     * @param {{x,y}|null} lastMove - 最后落子
     * @param {number[][]|null} winLine - 获胜连珠 [[x,y]...]
     */
    function draw(board, lastMove, winLine) {
        if (!ctx) return;
        const w = canvas.width;
        const h = canvas.height;

        // 木色背景
        ctx.fillStyle = '#dcb35c';
        ctx.fillRect(0, 0, w, h);

        // 木纹效果（简单渐变）
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, 'rgba(220, 179, 92, 1)');
        grad.addColorStop(0.5, 'rgba(210, 165, 80, 1)');
        grad.addColorStop(1, 'rgba(200, 155, 70, 1)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // 网格线
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = Math.max(1, cellSize * 0.03);
        for (let i = 0; i < SIZE; i++) {
            const p = padding + i * cellSize;
            // 横线
            ctx.beginPath();
            ctx.moveTo(padding, p);
            ctx.lineTo(padding + (SIZE - 1) * cellSize, p);
            ctx.stroke();
            // 竖线
            ctx.beginPath();
            ctx.moveTo(p, padding);
            ctx.lineTo(p, padding + (SIZE - 1) * cellSize);
            ctx.stroke();
        }

        // 星位
        ctx.fillStyle = '#3a2a10';
        for (const [sx, sy] of STAR_POINTS) {
            ctx.beginPath();
            ctx.arc(padding + sx * cellSize, padding + sy * cellSize, cellSize * 0.08, 0, Math.PI * 2);
            ctx.fill();
        }

        // 棋子
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                if (board[y][x] !== 0) {
                    drawStone(x, y, board[y][x]);
                }
            }
        }

        // 最后落子标记
        if (lastMove) {
            const cx = padding + lastMove.x * cellSize;
            const cy = padding + lastMove.y * cellSize;
            ctx.strokeStyle = '#e74c3c';
            ctx.lineWidth = Math.max(2, cellSize * 0.06);
            ctx.beginPath();
            ctx.arc(cx, cy, cellSize * 0.42, 0, Math.PI * 2);
            ctx.stroke();
        }

        // 获胜连珠高亮
        if (winLine && winLine.length > 0) {
            ctx.strokeStyle = 'rgba(231, 76, 60, 0.8)';
            ctx.lineWidth = Math.max(3, cellSize * 0.12);
            ctx.lineCap = 'round';
            ctx.beginPath();
            const [sx, sy] = winLine[0];
            ctx.moveTo(padding + sx * cellSize, padding + sy * cellSize);
            for (let i = 1; i < winLine.length; i++) {
                const [ex, ey] = winLine[i];
                ctx.lineTo(padding + ex * cellSize, padding + ey * cellSize);
            }
            ctx.stroke();
        }
    }

    /**
     * 画单个棋子
     */
    function drawStone(x, y, color) {
        const cx = padding + x * cellSize;
        const cy = padding + y * cellSize;
        const r = cellSize * 0.42;

        // 阴影
        ctx.beginPath();
        ctx.arc(cx + r * 0.08, cy + r * 0.08, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.fill();

        // 棋子
        const grad = ctx.createRadialGradient(
            cx - r * 0.3, cy - r * 0.3, r * 0.1,
            cx, cy, r
        );

        if (color === 1) {
            // 黑棋
            grad.addColorStop(0, '#4a4a4a');
            grad.addColorStop(0.5, '#2a2a2a');
            grad.addColorStop(1, '#0a0a0a');
        } else {
            // 白棋
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.7, '#f0f0f0');
            grad.addColorStop(1, '#c8c8c8');
        }

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // 边缘
        ctx.strokeStyle = color === 1 ? '#000' : '#bbb';
        ctx.lineWidth = Math.max(0.5, cellSize * 0.015);
        ctx.stroke();
    }

    /**
     * 胜负判定（客户端侧，用于即时反馈）
     */
    function checkWin(x, y, board) {
        const color = board[y][x];
        if (color === 0) return null;

        const dirs = [[1,0],[0,1],[1,1],[1,-1]];
        for (const [dx, dy] of dirs) {
            let count = 1;
            const line = [[x, y]];

            for (let i = 1; i < 5; i++) {
                const nx = x + dx * i, ny = y + dy * i;
                if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
                if (board[ny][nx] !== color) break;
                count++;
                line.push([nx, ny]);
            }
            for (let i = 1; i < 5; i++) {
                const nx = x - dx * i, ny = y - dy * i;
                if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
                if (board[ny][nx] !== color) break;
                count++;
                line.unshift([nx, ny]);
            }

            if (count >= 5) return { winner: color, line };
        }
        return null;
    }

    return {
        init,
        draw,
        checkWin,
        SIZE,
    };
})();
