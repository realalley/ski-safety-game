/**
 * 象棋走棋规则（前端本地校验，用于提示可走位置）
 * 与 FC 后端规则保持一致
 */
const Rules = (function () {
    const COLS = 9, ROWS = 10;

    function inBoard(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

    function inPalace(x, y, color) {
        if (x < 3 || x > 5) return false;
        return color === 'red' ? (y >= 7 && y <= 9) : (y >= 0 && y <= 2);
    }

    function hasCrossedRiver(y, color) {
        return color === 'red' ? y <= 4 : y >= 5;
    }

    function countBetween(board, fx, fy, tx, ty) {
        let count = 0;
        if (fx === tx) {
            const minY = Math.min(fy, ty), maxY = Math.max(fy, ty);
            for (let y = minY + 1; y < maxY; y++) if (board[y][fx]) count++;
        } else {
            const minX = Math.min(fx, tx), maxX = Math.max(fx, tx);
            for (let x = minX + 1; x < maxX; x++) if (board[fy][x]) count++;
        }
        return count;
    }

    /**
     * 判断走棋是否合法（不检查将帅照面，简化版用于提示）
     */
    function isValidMove(board, fx, fy, tx, ty) {
        if (!inBoard(fx, fy) || !inBoard(tx, ty)) return false;
        if (fx === tx && fy === ty) return false;

        const piece = board[fy][fx];
        if (!piece) return false;
        const target = board[ty][tx];
        if (target && target.color === piece.color) return false;

        const { type, color } = piece;
        const dx = tx - fx, dy = ty - fy;
        const adx = Math.abs(dx), ady = Math.abs(dy);

        switch (type) {
            case 'general':
                if (!inPalace(tx, ty, color)) return false;
                return (adx === 1 && ady === 0) || (adx === 0 && ady === 1);

            case 'advisor':
                if (!inPalace(tx, ty, color)) return false;
                return adx === 1 && ady === 1;

            case 'elephant':
                if (color === 'red' && ty < 5) return false;
                if (color === 'black' && ty > 4) return false;
                if (adx !== 2 || ady !== 2) return false;
                return !board[fy + dy / 2][fx + dx / 2];

            case 'horse':
                if (!((adx === 1 && ady === 2) || (adx === 2 && ady === 1))) return false;
                let legX, legY;
                if (adx === 2) { legX = fx + dx / 2; legY = fy; }
                else { legX = fx; legY = fy + dy / 2; }
                return !board[legY][legX];

            case 'chariot':
                if (adx !== 0 && ady !== 0) return false;
                return countBetween(board, fx, fy, tx, ty) === 0;

            case 'cannon':
                if (adx !== 0 && ady !== 0) return false;
                const count = countBetween(board, fx, fy, tx, ty);
                return target ? count === 1 : count === 0;

            case 'soldier':
                if (adx + ady !== 1) return false;
                if (color === 'red') {
                    if (dy > 0) return false;
                    if (!hasCrossedRiver(fy, color) && dx !== 0) return false;
                } else {
                    if (dy < 0) return false;
                    if (!hasCrossedRiver(fy, color) && dx !== 0) return false;
                }
                return true;
        }
        return false;
    }

    /**
     * 获取某棋子所有合法走法
     */
    function getValidMoves(board, fx, fy) {
        const moves = [];
        const piece = board[fy][fx];
        if (!piece) return moves;
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                if (isValidMove(board, fx, fy, x, y)) moves.push({ x, y });
            }
        }
        return moves;
    }

    return { isValidMove, getValidMoves };
})();
