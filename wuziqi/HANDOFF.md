# 五子棋在线对战游戏 - 交接文档

> **2026-09-19 更新（阿雪）**：Bug 已定性，修复方案已定，FC 版代码已写好，部署未完成（任务暂停）。见文末「2026-09-19 诊断结论与修复计划」。

## 项目概述

在现有"滑雪避障"游戏项目（GitHub: `realalley/ski-safety-game`）中新增五子棋在线对战游戏。两位玩家在不同设备上通过网络对战，使用阿里云 ESA 边缘函数 + Edge KV 存储房间和棋盘状态。

- **访问地址**: `game.xysski.com/wuziqi/`
- **GitHub 仓库**: `realalley/ski-safety-game`（master 分支）
- **ESA Pages 项目名**: `ski-safety-game`
- **KV 存储空间名**: `wuziqi`（空间 ID: `1039828232557408256`）

## 技术架构

```
仓库根目录/
├── esa.jsonc               # ESA Pages 配置（静态资源 + 边缘函数入口）
├── index.html              # 滑雪避障游戏（原有，不受影响）
├── js/, css/               # 滑雪避障游戏（原有）
├── wuziqi/                 # 五子棋游戏
│   ├── index.html          # 游戏页面
│   ├── css/style.css       # 样式
│   ├── js/
│   │   ├── board.js        # Canvas 棋盘渲染 + 触摸输入 + 胜负判定
│   │   ├── game.js         # 游戏状态机 + 乐观更新
│   │   ├── network.js      # API 调用封装 + 自适应轮询
│   │   └── main.js         # 入口：屏幕切换 + 事件绑定 + 重连
│   └── api/
│       └── index.js        # 边缘函数：房间管理 + 落子校验 + 胜负判定
```

### esa.jsonc 配置

```jsonc
{
  "name": "ski-safety-game",
  "entry": "./wuziqi/api/index.js",
  "installCommand": "",
  "buildCommand": "",
  "assets": { "directory": "./" }
}
```

- 静态资源目录为仓库根（`./`），滑雪避障和五子棋静态文件都直接服务
- 边缘函数入口 `wuziqi/api/index.js` 处理所有 `/api/wuziqi/*` 请求
- 路由：静态资源优先匹配 → 无匹配则执行边缘函数 → 无函数则 404

### API 接口

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/wuziqi/version` | 版本检测（返回 `text-mode-v2`） |
| GET | /api/wuziqi/diag` | KV 诊断（同一请求内写后读） |
| POST | `/api/wuziqi/room` | 创建房间，返回 roomCode + playerId + color=黑 |
| GET | `/api/wuziqi/room/:code` | 获取房间状态（轮询用） |
| POST | `/api/wuziqi/room/:code/join` | 加入房间，返回 playerId + color=白 |
| POST | `/api/wuziqi/room/:code/move` | 落子 `{x, y, playerId}` |
| POST | `/api/wuziqi/room/:code/resign` | 认输 |

### KV 数据模型

- **Key**: `room-{6位字母数字}`（如 `room-AB3X9K`）
- **Value**（JSON 字符串）:
```json
{
  "board": [[0,...15],...15],   // 0=空, 1=黑, 2=白
  "currentTurn": 1,              // 1=黑, 2=白
  "blackPlayer": "uuid",
  "whitePlayer": null,           // 加入前为 null
  "status": "waiting",           // waiting|playing|finished
  "winner": null,                // null|1|2|"draw"
  "winLine": null,               // 获胜连珠坐标
  "moves": [{"x":7,"y":7,"p":1,"t":1695600000}],
  "createdAt": 1695600000,
  "lastMoveAt": 1695600000,
  "expiresAt": 1695607200        // 创建后 2 小时过期
}
```

### 前端游戏流程

1. 玩家 A 点"创建房间" → POST /room → 获得房间号 + 黑方
2. 分享房间号给玩家 B
3. 玩家 B 输入房间号 → POST /room/:code/join → 获得白方
4. 黑方先手，交替落子，轮询获取对手落子（1.5s 间隔，连续 10 次无变化后降频到 3s）
5. 五连珠判定胜负，或一方认输

## 当前 Bug：Edge KV 跨请求同步延迟

### 问题描述

边缘函数写入 KV 后，**另一个请求**读取该数据时返回"房间不存在"（404），需要等待 60 秒以上才能读到。这导致在线对战无法正常工作——对手落子后，另一方要等 1 分钟以上才能看到。

### 诊断结果

| 测试项 | 结果 | 说明 |
|--------|------|------|
| 边缘函数部署状态 | ✅ 正常 | `/api/wuziqi/version` 返回 `text-mode-v2` |
| KV 写入 | ✅ 正常 | ESA 控制台可见写入的 key |
| **同一请求内**写后读 | ✅ 正常 | text 和 json 模式都能立即读到 |
| 读取旧数据（10+ 分钟前写入） | ✅ 正常 | |
| **跨请求**读新数据（5-60 秒内） | ❌ 失败 | 返回 404 "房间不存在" |
| 跨请求读新数据（60 秒后） | ❌ 仍失败 | |
| 跨请求读新数据（10+ 分钟后） | ✅ 正常 | |

### 关键发现

**KV 本身工作正常**——同一请求内的写后读完全没问题。问题出在**跨 POP（边缘节点）同步**：

- 请求 A（创建房间）写入 KV → 数据写入 POP A 的本地存储
- 请求 B（读取房间）可能命中 POP B → POP B 还没同步到 POP A 的数据 → 返回 404
- ESA 官方文档说"一般在几秒到十几秒时间内同步"，但实测 60 秒以上仍未同步

### 复现步骤

```bash
# 1. 创建房间（写入 KV）
curl -s -X POST https://game.xysski.com/api/wuziqi/room \
  -H "Content-Type: application/json" \
  -d '{"playerId":"test"}'
# 返回: {"success":true,"data":{"roomCode":"XXXXXX",...}}

# 2. 立即读取（跨请求）
curl -s https://game.xysski.com/api/wuziqi/room/XXXXXX
# 返回: {"success":false,"error":"房间不存在"} (404)

# 3. 等 60 秒后再读
sleep 60
curl -s https://game.xysski.com/api/wuziqi/room/XXXXXX
# 仍然返回 404

# 4. 验证 KV 内确实有数据
# 去 ESA 控制台 → KV存储 → wuziqi → 管理，可以看到 room-XXXXXX key 存在

# 5. 诊断端点（同一请求内写后读，验证 KV 本身没问题）
curl -s https://game.xysski.com/api/wuziqi/diag
# 返回: {"success":true,"data":{"put":"success","getText":"match","getJson":"parsed:...","oldRoom":"found"}}
```

### 排查方向

1. **KV 存储空间与边缘函数的绑定关系**
   - KV 空间 `wuziqi` 是在 ESA 控制台手动创建的
   - 边缘函数通过 `new EdgeKV({ namespace: 'wuziqi' })` 访问
   - 检查：KV 空间是否需要与 ESA 站点（xysski.com）或 Functions and Pages 项目（ski-safety-game）显式绑定？
   - 检查：ESA 控制台 → KV存储 → wuziqi → 是否有"关联函数/站点"的配置？

2. **KV 同步区域配置**
   - 检查 KV 空间是否有地域配置（如仅在中国内地同步，还是全球同步）
   - 用户所在区域和边缘节点是否匹配

3. **ESA 套餐影响**
   - 不同 ESA 套餐（基础版/标准版/高级版）可能影响 KV 同步优先级
   - 检查当前套餐是否支持低延迟 KV 同步

4. **DCDN vs ESA 差异**
   - 用户反馈"之前用 KV 没有这么大延迟"
   - 可能之前用的是 DCDN（经典版）的边缘存储，同步机制与 ESA（全新一代）不同
   - 对比：DCDN EdgeKV 和 ESA EdgeKV 的同步行为是否一致

5. **边缘函数 POP 路由**
   - 从响应头 `via: ens-vcache2.cn4460, ens-cache14.cn4460, ens-cache12.cn8524` 可见请求经过多个节点
   - 写入可能发生在 cn4460，读取可能命中 cn8524
   - 检查是否可以配置会话保持（session affinity）让同一用户的请求命中同一 POP

### 已排除的原因

- ❌ 不是代码 bug：同一请求内写后读正常
- ❌ 不是边缘函数未部署：版本端点返回正确版本号
- ❌ 不是 KV 空间未创建：控制台可见数据和空间
- ❌ 不是 KV API 用法错误：text 和 json 模式都验证过

## 已知小问题（非阻塞）

1. **边缘函数源码可被直接访问**: `/wuziqi/api/index.js` 作为静态文件可被下载（不影响功能，但暴露源码）
2. **无版本并发控制**: 同一玩家多标签页可能双击落子（实际场景概率低）
3. **无房间密码**: 知道房间号即可加入（先到先得机制已限制最多 2 人）

## 已提交的 Git 历史

```
6d73087 fix: 修复diag端点kv变量未初始化bug
2c60fbe debug: 添加KV诊断端点 /api/wuziqi/diag
30a73fd debug: 添加版本检测端点 /api/wuziqi/version
3eae3a0 fix: KV读取改用text模式手动解析JSON，修复房间读取失败
de9b80a optimize: 自适应轮询间隔，对手长时间未落子时降频到3s
bd93a8f feat: 新增五子棋在线对战游戏
```

## 备选方案（如果 KV 同步问题无法解决）

1. **改用阿里云函数计算（FC）+ Redis**: 强一致性，实时同步，需额外开通
2. **改为本地双人模式**: 同设备轮流落子，无网络延迟
3. **使用阿里云 Tablestore/RDS**: 边缘函数通过 fetch() 调用，强一致性

## 2026-09-19 诊断结论与修复计划（任务暂停，待续）

### 诊断结论：EdgeKV 最终一致性，无法修复，必须换存储

实测（curl 直打线上）：
- 创建房间后立即读（带随机参数绕 CDN 缓存）→ 404；同 POP 2/4/6s 后读 → 仍 404；连续探测 120s → 全部 404；10 分钟后可读
- 官方文档确认：EdgeKV 写入先落中心节点，再异步同步边缘（最迟 300 秒）；`get()` 无强一致读取选项；官方明确"不适合实时更新场景"
- HANDOFF 原猜测"跨 POP 同步慢"不够准确——同 POP 跨请求也读不到，本质是 EdgeKV 读写模型（写本地/中心异步刷 + 读本地命中）决定的

### 已定方案：阿里云 FC + Tablestore（用户已确认）

- 把 api/index.js 全部逻辑搬到 FC（Node 18 + HTTP 触发器），存储用 Tablestore CU 模式（强一致、按量几分钱/月）
- ⚠️ 建实例必须选 **CU 模式**，不要 VCU 模式（最低 72 元/月）
- 前端 network.js 只改 API_BASE 指向 FC HTTP 触发器地址
- 评估过的备选：腾讯 CloudBase（免费额度对轮询型应用偏紧）、腾讯轻量服务器（38~99元/年，体验上限高但多一台机器）、LeanCloud、FC+Redis（贵）

### 已完成

- ✅ `fc/index.js` 已写好（本目录 fc/ 下）：接口与原边缘函数完全兼容（7 个端点一致），环境变量 OTS_ENDPOINT/OTS_INSTANCE/OTS_TABLE_NAME/OTS_AK_ID/OTS_AK_SECRET
- ⚠️ fc/index.js 未经过真机测试（Tablestore SDK 依赖需打包时 npm install tablestore）

### 待办（下次继续）

1. 阿里云控制台：开通 Tablestore，建 CU 模式实例 + room 表（主键 roomCode STRING）
2. 开通 FC 3.0，Node 18 函数 + HTTP 触发器（CORS 允许所有来源）
3. RAM 子账号（仅 Tablestore 权限）→ AK 配到 FC 环境变量（AK 不经过 AI，用户自己在控制台配）
4. fc/index.js + package.json（依赖 tablestore）打包 zip 上传 FC
5. curl 端到端验证：创建→立即读（必须 200）→join→move
6. network.js 的 API_BASE 改为 FC 地址（或经 ESA 边缘函数转发），HANDOFF 收尾
7. 原 ESA 边缘函数可保留 /version 但 /room 系列走 FC 转发，或直接前端直连 FC

### 教训记录（浏览器自动化）

- 本机沙箱环境有 HTTP_PROXY=127.0.0.1:56255，curl localhost 必须加 --noproxy '*'
- 无头浏览器（agent-browser 默认模式）稳定；--headed / 桌面 Chrome 调试端口模式因 GPU 进程被沙箱策略杀死而反复崩溃
- ⚠️ 不要用用户的真实 Chrome profile 跑自动化（曾导致用户 Chrome 打不开，已修复：pkill 残留进程后 open -a 重启即恢复）
- 用户登录采用"无头浏览器截图 + open 弹预览窗口扫码"流程（本次未走完，用户主动终止）

## 联系信息

- 项目开发者: victorjiang
- GitHub 仓库: realalley/ski-safety-game
- 部署域名: game.xysski.com
- 阿里云账号: hi358*****@aliyun.com
```
