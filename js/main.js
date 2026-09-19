/**
 * 游戏入口
 */
window.addEventListener('load', () => {
    const game = new Game();
    window.__game = game;  // 暴露到全局，便于调试
    // 启动主循环
    requestAnimationFrame((t) => game.loop(t));
});
