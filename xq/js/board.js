/**
 * 象棋棋盘渲染与交互
 * 使用 Canvas 绘制棋盘和棋子
 */
const Board = (function () {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');

    const COLS = 9;
    const ROWS = 10;
    let cellSize = 0;
    let paddingX = 0;
    let paddingY = 0;
    let boardWidth = 0;
    let boardHeight = 0;

    // 棋子中文名称
    const PIECE_NAMES = {
        red: { general: '帅', advisor: '仕', elephant: '相', horse: '马', chariot: '车', cannon: '炮', soldier: '兵' },
        black: { general: '将', advisor: '士', elephant: '象', horse: '马', chariot: '车', cannon: '炮', soldier: '卒' },
    };

    let selected = null;        // {x, y}
    let validMoves = [];        // [{x, y}]
    let lastMove = null;        // {from, to}
    let onClickCallback = null;
    let myColor = 'red';

    /**
     * 调整画布尺寸，适配屏幕
     */
    function resize() {
        const maxWidth = Math.min(window.innerWidth, 500) - 16;
        const maxHeight = window.innerHeight * 0.62;
        const aspect = (COLS - 1) / (ROWS - 1); // 宽高比
        let w = maxWidth;
        let h = w / aspect;
        if (h > maxHeight) { h = maxHeight; w = h * aspect; }

        const dpr = window.devicePixelRatio || 1;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        cellSize = w / (COLS - 1);
        paddingX = cellSize / 2;
        paddingY = cellSize / 2;
        boardWidth = w;
        boardHeight = h;
    }

    /**
     * 坐标转换：棋盘坐标 -> 画布像素
     */
    function toPixel(x, y) {
        return { px: paddingX + x * cellSize, py: paddingY + y * cellSize };
    }

    /**
     * 坐标转换：画布像素 -> 棋盘坐标
     */
    function toBoard(px, py) {
        const x = Math.round((px - paddingX) / cellSize);
        const y = Math.round((py - paddingY) / cellSize);
        if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return null;
        return { x, y };
    }

    /**
     * 绘制整个棋盘
     */
    function draw(board) {
        ctx.clearRect(0, 0, boardWidth, boardHeight);

        // 背景（木纹色）
        const grad = ctx.createLinearGradient(0, 0, 0, boardHeight);
        grad.addColorStop(0, '#f0d9a8');
        grad.addColorStop(1, '#e8c887');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, boardWidth, boardHeight);

        drawGrid();
        drawPieces(board);
        drawHighlights();
    }

    function drawGrid() {
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = 1.2;

        // 横线（10条）
        for (let y = 0; y < ROWS; y++) {
            const { py } = toPixel(0, y);
            ctx.beginPath();
            ctx.moveTo(paddingX, py);
            ctx.lineTo(paddingX + (COLS - 1) * cellSize, py);
            ctx.stroke();
        }

        // 竖线（9条）- 楚河汉界处断开
        for (let x = 0; x < COLS; x++) {
            const { px } = toPixel(x, 0);
            if (x === 0 || x === COLS - 1) {
                // 左右边框不断开
                const { py: pyTop } = toPixel(0, 0);
                const { py: pyBottom } = toPixel(0, ROWS - 1);
                ctx.beginPath();
                ctx.moveTo(px, pyTop);
                ctx.lineTo(px, pyBottom);
                ctx.stroke();
            } else {
                // 中间竖线在河界处断开
                const { py: pyTop } = toPixel(0, 0);
                const { py: pyRiverTop } = toPixel(0, 4);
                const { py: pyRiverBottom } = toPixel(0, 5);
                const { py: pyBottom } = toPixel(0, ROWS - 1);
                ctx.beginPath();
                ctx.moveTo(px, pyTop);
                ctx.lineTo(px, pyRiverTop);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(px, pyRiverBottom);
                ctx.lineTo(px, pyBottom);
                ctx.stroke();
            }
        }

        // 九宫格斜线
        drawPalaceLines();

        // 楚河汉界文字
        ctx.fillStyle = '#5a3a1a';
        ctx.font = `bold ${cellSize * 0.5}px "STKaiti", "KaiTi", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const riverY = (toPixel(0, 4).py + toPixel(0, 5).py) / 2;
        ctx.fillText('楚 河', boardWidth * 0.3, riverY);
        ctx.fillText('汉 界', boardWidth * 0.7, riverY);

        // 兵炮位标记（十字小标记）
        drawPositionMarks();
    }

    function drawPalaceLines() {
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = 1.2;
        // 上方九宫（黑方）
        let { px: x3, py: y0 } = toPixel(3, 0);
        let { px: x5, py: y2 } = toPixel(5, 2);
        ctx.beginPath();
        ctx.moveTo(x3, y0); ctx.lineTo(x5, y2);
        ctx.moveTo(x5, y0); ctx.lineTo(x3, y2);
        ctx.stroke();
        // 下方九宫（红方）
        let { px: x3b, py: y7 } = toPixel(3, 7);
        let { px: x5b, py: y9 } = toPixel(5, 9);
        ctx.beginPath();
        ctx.moveTo(x3b, y7); ctx.lineTo(x5b, y9);
        ctx.moveTo(x5b, y7); ctx.lineTo(x3b, y9);
        ctx.stroke();
    }

    function drawPositionMarks() {
        const marks = [
            [1, 2], [7, 2], [1, 7], [7, 7],
            [0, 3], [2, 3], [4, 3], [6, 3], [8, 3],
            [0, 6], [2, 6], [4, 6], [6, 6], [8, 6],
        ];
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = 1;
        const len = cellSize * 0.12;
        const gap = cellSize * 0.08;
        for (const [x, y] of marks) {
            const { px, py } = toPixel(x, y);
            // 四个角的 L 形标记
            const corners = [
                [-1, -1], [1, -1], [-1, 1], [1, 1],
            ];
            for (const [dx, dy] of corners) {
                // 边界处只画内侧
                if ((x === 0 && dx < 0) || (x === 8 && dx > 0)) continue;
                ctx.beginPath();
                ctx.moveTo(px + dx * gap, py + dy * gap);
                ctx.lineTo(px + dx * gap + dx * len, py + dy * gap);
                ctx.moveTo(px + dx * gap, py + dy * gap);
                ctx.lineTo(px + dx * gap, py + dy * gap + dy * len);
                ctx.stroke();
            }
        }
    }

    function drawPieces(board) {
        const r = cellSize * 0.44;
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const piece = board[y][x];
                if (!piece) continue;
                drawPiece(x, y, piece, r);
            }
        }
    }

    function drawPiece(x, y, piece, r) {
        const { px, py } = toPixel(x, y);
        const isRed = piece.color === 'red';
        const name = PIECE_NAMES[piece.color][piece.type];

        // 阴影
        ctx.beginPath();
        ctx.arc(px + 1, py + 2, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fill();

        // 棋子底色
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
        g.addColorStop(0, '#fff8e7');
        g.addColorStop(1, '#e8d5a8');
        ctx.fillStyle = g;
        ctx.fill();

        // 内圈
        ctx.beginPath();
        ctx.arc(px, py, r * 0.82, 0, Math.PI * 2);
        ctx.strokeStyle = isRed ? '#c0392b' : '#2c3e50';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // 文字
        ctx.fillStyle = isRed ? '#c0392b' : '#2c3e50';
        ctx.font = `bold ${r * 0.95}px "STKaiti", "KaiTi", "SimSun", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, px, py + 1);
    }

    function drawHighlights() {
        const r = cellSize * 0.44;

        // 上一步走棋标记
        if (lastMove) {
            for (const pos of [lastMove.from, lastMove.to]) {
                const { px, py } = toPixel(pos.x, pos.y);
                ctx.beginPath();
                ctx.arc(px, py, r + 3, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(52, 152, 219, 0.7)';
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
        }

        // 选中标记
        if (selected) {
            const { px, py } = toPixel(selected.x, selected.y);
            ctx.beginPath();
            ctx.arc(px, py, r + 3, 0, Math.PI * 2);
            ctx.strokeStyle = '#27ae60';
            ctx.lineWidth = 3;
            ctx.stroke();
        }

        // 可走位置标记
        for (const move of validMoves) {
            const { px, py } = toPixel(move.x, move.y);
            ctx.beginPath();
            ctx.arc(px, py, cellSize * 0.15, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(39, 174, 96, 0.5)';
            ctx.fill();
        }
    }

    /**
     * 处理点击
     */
    function handleClick(e) {
        if (!onClickCallback) return;
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
        const py = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
        const pos = toBoard(px, py);
        if (pos) onClickCallback(pos.x, pos.y);
    }

    function setSelected(pos, moves) {
        selected = pos;
        validMoves = moves || [];
    }

    function clearSelection() {
        selected = null;
        validMoves = [];
    }

    function setLastMove(move) {
        lastMove = move;
    }

    function setMyColor(color) {
        myColor = color;
        // 黑方玩家需要翻转棋盘，让自己的棋子在下方
        canvas.style.transform = color === 'black' ? 'rotate(180deg)' : '';
    }

    function init(board, onClick) {
        resize();
        onClickCallback = onClick;
        draw(board);
    }

    window.addEventListener('resize', () => { resize(); });
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleClick(e); }, { passive: false });

    return { init, draw, setSelected, clearSelection, setLastMove, setMyColor, resize };
})();
