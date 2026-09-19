/**
 * 游戏全局配置
 */
const CONFIG = {
    // 画布逻辑尺寸（竖屏设计基准）
    designWidth: 375,
    designHeight: 812,

    // 雪道配置
    slope: {
        // 雪道宽度（占屏幕宽度比例）
        widthRatio: 0.82,
        // 雪道边界颜色
        boundaryColor: '#1565c0',
        boundaryGlow: '#42a5f5',
        // 雪地颜色
        snowColor: '#f0f5f9',
        snowShade: '#dce6ef',
    },

    // 玩家配置
    player: {
        // 屏幕中玩家固定的纵向位置（相对屏幕高度 0~1）
        screenYRatio: 0.72,
        // 玩家半径
        radius: 14,

        // 双板配置
        ski: {
            maxSpeed: 520,          // 最大速度（像素/秒）
            acceleration: 90,       // 加速度
            turnSpeed: 320,         // 转向速度
            turnResponsiveness: 1.0,// 转向灵敏度
            friction: 0.5,          // 自然减速
            brakePower: 260,        // 制动力度
            // 双板可以直线滑行，转向轨迹较大
            minTurnRadius: 80,
            color: '#1e88e5',
            accentColor: '#0d47a1',
        },

        // 单板配置
        snowboard: {
            maxSpeed: 460,
            acceleration: 110,
            turnSpeed: 380,
            turnResponsiveness: 1.35, // 单板转向更灵敏
            friction: 0.35,
            brakePower: 180,          // 单板制动弱一些
            // 单板天然走S型，最小转弯半径小
            minTurnRadius: 45,
            color: '#ef5350',
            accentColor: '#b71c1c',
        },
    },

    // 轨迹配置
    trail: {
        maxPoints: 120,         // 最大轨迹点数
        lineWidth: 3,           // 轨迹线宽
        fadeTime: 2.0,          // 轨迹淡出时间（秒）
        skiColor: 'rgba(30, 136, 229, 0.55)',
        snowboardColor: 'rgba(239, 83, 80, 0.55)',
    },

    // 速度显示（映射到 km/h）
    speedDisplay: {
        // 游戏速度(px/s) 到显示速度(km/h) 的换算系数
        // 仅供展示，让数值更有真实感
        factor: 0.12,
    },

    // 背景雪花
    snowflakes: {
        count: 40,
        sizeMin: 1,
        sizeMax: 3,
        speedMin: 30,
        speedMax: 90,
    },

    // AI 滑雪者配置
    ai: {
        maxCount: 6,              // 同时存在的最大AI数量
        spawnInterval: 1.8,       // 生成间隔（秒）
        spawnAheadDistance: 600,  // 在玩家前方多远生成（世界坐标）
        despawnBehindDistance: 200, // 玩家身后多远回收

        // 鱼雷型（后方高速冲撞）配置
        torpedo: {
            spawnBehindDistance: 350, // 在玩家后方多远生成
            speedMin: 560,            // 鱼雷最低速度（高于玩家最大速度520）
            speedMax: 680,            // 鱼雷最高速度
            color: '#e53935',         // 鱼雷专用色（醒目的红色）
        },

        // 各行为模式出现概率（总和应为1）
        behaviorWeights: {
            straight: 0.24,       // 直线冲坡型
            carve: 0.26,          // S型刻滑型
            cross: 0.16,          // 突然横穿型
            safe: 0.14,           // 安全滑行型
            stationary: 0.06,     // 雪道停留型
            torpedo: 0.14,        // 后方鱼雷型（高速追尾）
        },

        // 颜色池
        colors: ['#43a047', '#fb8c00', '#8e24aa', '#00acc1', '#f4511e', '#3949ab'],
    },

    // 碰撞配置
    collision: {
        radius: 16,               // 碰撞半径（略大于视觉半径）
    },

    // 事故回放配置
    replay: {
        recordDuration: 3.0,      // 回放记录时长（秒）
        playbackSpeed: 0.35,      // 回放速度倍率
    },
};

// AI 行为模式枚举
const AI_BEHAVIOR = {
    STRAIGHT: 'straight',         // 直线冲坡
    CARVE: 'carve',               // S型刻滑
    CROSS: 'cross',               // 突然横穿
    SAFE: 'safe',                 // 安全滑行
    STATIONARY: 'stationary',     // 雪道停留
    TORPEDO: 'torpedo',           // 后方鱼雷（高速追尾）
};

// 责任判定结果
const FAULT_TYPE = {
    PLAYER: 'player',             // 玩家全责
    AI: 'ai',                     // AI全责
    BOTH: 'both',                 // 双方都有责任
};

// 违规规则类型
const RULE_VIOLATION = {
    REAR_END: '前方滑雪者有优先权，后方追尾应避让',          // 追尾
    CROSSING: '横穿雪道时下坡者优先，不得突然横穿',           // 横穿
    OVERTAKE: '超越时不得危及被超越者，应保持安全距离',       // 超越
    STATIONARY: '不得在雪道中间无故停留',                     // 停留
    SPEED: '应控制速度，确保能随时停下避让',                   // 速度
};

// 滑雪板类型枚举
const BOARD_TYPE = {
    SKI: 'ski',
    SNOWBOARD: 'snowboard',
};

// 游戏状态枚举
const GAME_STATE = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'gameover',
};
