/**
 * 围棋棋盘渲染与交互
 */
const Board = (function () {
    const canvas = document.getElementById('board');
    const ctx = canvas.getContext('2d');

    let boardSize = 19;
    let cellSize = 0;
    let padding = 0;
    let canvasSize = 0;

    let lastMove = null;
    let onClickCallback = null;
    let myColor = 1; // 1=黑, 2=白

    function resize() {
        const maxW = Math.min(window.innerWidth - 24, 560);
        const maxH = window.innerHeight * 0.62;
        const size = Math.min(maxW, maxH);
        canvasSize = size;
        cellSize = (size - padding * 2) / (boardSize - 1);

        const dpr = window.devicePixelRatio || 1;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function setBoardSize(size) {
        boardSize = size;
        padding = size <= 9 ? 20 : 24;
        resize();
    }

    function toPixel(x, y) {
        if (myColor === 2) {
            x = boardSize - 1 - x;
            y = boardSize - 1 - y;
        }
        return { px: padding + x * cellSize, py: padding + y * cellSize };
    }

    function toBoard(px, py) {
        let x = Math.round((px - padding) / cellSize);
        let y = Math.round((py - padding) / cellSize);
        if (myColor === 2) {
            x = boardSize - 1 - x;
            y = boardSize - 1 - y;
        }
        if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) return null;
        return { x, y };
    }

    function draw(board) {
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        // 棋盘背景（木纹色）
        const grad = ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
        grad.addColorStop(0, '#e8c887');
        grad.addColorStop(1, '#d4a855');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvasSize, canvasSize);

        drawGrid();
        drawStars();
        drawStones(board);
        drawLastMove();
    }

    function drawGrid() {
        ctx.strokeStyle = '#5a3a1a';
        ctx.lineWidth = 1;
        const end = padding + (boardSize - 1) * cellSize;

        for (let i = 0; i < boardSize; i++) {
            const p = padding + i * cellSize;
            // 横线
            ctx.beginPath();
            ctx.moveTo(padding, p);
            ctx.lineTo(end, p);
            ctx.stroke();
            // 竖线
            ctx.beginPath();
            ctx.moveTo(p, padding);
            ctx.lineTo(p, end);
            ctx.stroke();
        }

        // 边框加粗
        ctx.lineWidth = 1.5;
        ctx.strokeRect(padding, padding, (boardSize - 1) * cellSize, (boardSize - 1) * cellSize);
    }

    function drawStars() {
        ctx.fillStyle = '#5a3a1a';
        const starSize = cellSize * 0.12;
        let stars = [];
        if (boardSize === 19) {
            stars = [[3,3],[9,3],[15,3],[3,9],[9,9],[15,9],[3,15],[9,15],[15,15]];
        } else if (boardSize === 13) {
            stars = [[3,3],[6,6],[9,3],[3,9],[9,9],[6,3],[3,6],[9,6],[6,9]];
        } else if (boardSize === 9) {
            stars = [[2,2],[6,2],[2,6],[6,6],[4,4]];
        }
        for (const [x, y] of stars) {
            const { px, py } = toPixel(x, y);
            ctx.beginPath();
            ctx.arc(px, py, starSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function drawStones(board) {
        const r = cellSize * 0.46;
        for (let y = 0; y < boardSize; y++) {
            for (let x = 0; x < boardSize; x++) {
                const s = board[y][x];
                if (s === 0) continue;
                drawStone(x, y, s, r);
            }
        }
    }

    function drawStone(x, y, color, r) {
        const { px, py } = toPixel(x, y);
        // 阴影
        ctx.beginPath();
        ctx.arc(px + 1, py + 2, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();

        // 棋子
        const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, r * 0.1, px, py, r);
        if (color === 1) {
            g.addColorStop(0, '#666');
            g.addColorStop(1, '#000');
        } else {
            g.addColorStop(0, '#fff');
            g.addColorStop(1, '#bbb');
        }
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        if (color === 2) {
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }

    function drawLastMove() {
        if (!lastMove) return;
        const { px, py } = toPixel(lastMove.x, lastMove.y);
        const r = cellSize * 0.2;
        ctx.strokeStyle = lastMove.p === 1 ? '#fff' : '#c0392b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px - r, py);
        ctx.lineTo(px + r, py);
        ctx.moveTo(px, py - r);
        ctx.lineTo(px, py + r);
        ctx.stroke();
    }

    function handleClick(e) {
        if (!onClickCallback) return;
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX)) - rect.left;
        const py = (e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY)) - rect.top;
        const pos = toBoard(px, py);
        if (pos) onClickCallback(pos.x, pos.y);
    }

    function setLastMove(move) { lastMove = move; }
    function setMyColor(color) { myColor = color; }

    function init(size, board, color, onClick) {
        boardSize = size;
        padding = size <= 9 ? 20 : 24;
        myColor = color;
        onClickCallback = onClick;
        resize();
        draw(board);
    }

    window.addEventListener('resize', () => { if (onClickCallback) { resize(); } });
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleClick(e); }, { passive: false });

    return { init, draw, setLastMove, setMyColor, resize, setBoardSize };
})();
