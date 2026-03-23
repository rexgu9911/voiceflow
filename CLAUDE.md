# VoiceFlow — 开发文档

> 最后更新：2026-03-21
> 当前状态：MVP 可用，核心功能完成，设置面板重做完毕，待打包

## 项目概述

VoiceFlow 是一款 macOS 菜单栏语音转文字工具，类似 Typeless / Wispr Flow。
按住全局快捷键说话，松开后自动将语音转为文字并粘贴到光标位置。

- **架构**：Whisper API（语音转文字）+ GPT-4o-mini（文本润色）
- **技术栈**：Electron + TypeScript + Vite + React
- **平台**：macOS（需要 Accessibility 和 Microphone 权限）
- **唯一依赖**：一个 OpenAI API Key（同时用于 Whisper 和 GPT）

## 当前进度

### 已完成
- [x] 核心语音转文字管道（录音→Whisper→GPT→粘贴）
- [x] 全局快捷键 ⌥ Option（长按说话 + 轻按切换两种模式）
- [x] 音频压缩（WAV→WebM/Opus，体积减小 10-20x）
- [x] 多语言语音识别（用户可选常用语言缩小检测范围，翻译误判自动重试，100+ 语言支持）
- [x] GPT 始终运行（精准标点、去填充词、code-switching 保护，无跳过逻辑）
- [x] 上下文感知语气（检测活跃应用，8 种上下文：email/chat/code/document/notes/social/browser/general）
- [x] 听写历史记录（本地存储 500 条，含统计 + 平均口述速度 WPM）
- [x] 声音反馈（开始/停止/成功/错误 四种音效，可在设置中开关）
- [x] macOS 原生风格设置面板（6 页侧边栏：Overview/General/Dictation/Shortcuts/History/About）
- [x] 设置面板可调整大小（resizable，min 520×480）
- [x] 开机自启动（设置面板开关，通过 `app.setLoginItemSettings()` 实现）
- [x] 浮动状态栏（休眠态自动隐藏、hover 展开、渐变背景、辉光阴影、弹性动画、渐变波形、shimmer 效果）
- [x] 浮动状态栏波形可视化修复（轮询等待 MediaStream 就绪，解决竞态条件）
- [x] 失败保护（API 出错时原始文本复制到剪贴板 + 系统通知，错误 5s 自动清除）
- [x] 并发处理保护（isProcessing 标志位防止重叠听写）
- [x] 最小音频检查（<1500 bytes 自动跳过，避免处理静音）
- [x] 活跃应用缓存（录音开始时捕获，防止焦点切换到 VoiceFlow 后误判）
- [x] 浏览器标题智能检测（6 条正则匹配 Gmail/Slack/GitHub 等网页应用的上下文）
- [x] 统一日志系统（动态路径，不再硬编码）
- [x] 清理所有死代码和未使用依赖
- [x] API Key 即时验证（Verify 按钮，GPT ping 测试，显示 Valid/Invalid 状态）
- [x] API Key 显示/隐藏切换（眼睛图标）
- [x] 版本号显示（About 页面，读取 package.json version）
- [x] Overview 统计实时刷新（每次打开页面从 IPC 重新加载最新数据）
- [x] 历史记录搜索（文本内容/应用名模糊搜索）
- [x] 历史记录分页（Load More 按钮，首次加载 50 条）
- [x] 历史记录复制反馈（点击条目闪绿 + "Copied!" 提示）
- [x] Preferred Languages 语言选择器（19 种常用语言芯片 UI，缩小 Whisper 检测范围）

### 待做
- [ ] 打包成 .app / .dmg（electron-builder 配置已有）
- [ ] 快捷键自定义 UI（目前固定为 ⌥ Option）

## 快捷键

| 操作 | 快捷键 | 说明 |
|------|--------|------|
| 长按说话 | ⌥ Option（按住） | 按住 >400ms 开始录音，松开转录粘贴 |
| 切换录音 | ⌥ Option（轻按） | 按一下开始，再按一下停止转录 |
| 打开设置 | 右键浮动条 | 右键点击浮动状态栏打开设置窗口 |

## 核心数据流

```
⌥ Option 按下
  ↓ (>400ms = 长按模式 / <400ms = 轻按切换模式)
uiohook 检测 → IPC.RECORDING_START → renderer 开始录音
  ↓
renderer: MediaRecorder API 录音（WebM/Opus 压缩格式）
  ↓
松开 ⌥ 或再次轻按 ⌥ → IPC.RECORDING_STOP → renderer 停止录音
  ↓
renderer: 将 WebM Blob 转 ArrayBuffer + 录音时长 → IPC.AUDIO_COMPLETE → main 进程
  ↓
main: 使用录音开始时缓存的活跃应用信息（防止焦点切换误判）
  ↓
main: whisper-client.ts → multipart POST WebM 到 OpenAI Whisper API
  ↓
main: GPT 润色（始终运行 — 标点、格式、去填充词、code-switching 保护）
  ↓
main: text-injector.ts → 保存剪贴板 → 写入文字 → AppleScript Cmd+V → 恢复剪贴板
  ↓
浮动条：dormant → (hover) idle → recording（实时频率可视化+计时） → processing → injecting → idle → dormant
  休眠态：40×4px 小短线，几乎不可见，hover 后展开为完整胶囊
  预览：注入成功后显示前 40 字 2.5s，然后回到 dormant
  错误：显示错误信息 5s 后自动回到 dormant
```

## 文件结构

```
src/
├── main/
│   ├── index.ts              # 应用入口，初始化所有模块
│   ├── hotkey-manager.ts     # ⌥ Option 快捷键（长按/轻按检测，400ms 阈值）
│   ├── whisper-client.ts     # Whisper API（原生 HTTPS multipart，接受 WebM）
│   ├── llm-processor.ts      # GPT-4o-mini 润色（上下文感知语气 + 多语言动态处理）
│   ├── text-injector.ts      # 剪贴板 + AppleScript Cmd+V 注入
│   ├── ipc-handlers.ts       # 管道编排（录音→STT→GPT→注入→历史记录）
│   ├── windows.ts            # 浮动条窗口 + 设置窗口（6 页内联 HTML，侧边栏布局）
│   ├── tray.ts               # 系统托盘菜单
│   ├── settings-store.ts     # electron-store 持久化
│   ├── history.ts            # 听写历史（500 条本地存储 + 统计 + 平均 WPM）
│   ├── active-app.ts         # 检测活跃应用 + 语气映射
│   ├── logger.ts             # 统一日志（app.getPath('userData')/voiceflow.log）
│   └── permissions.ts        # macOS Accessibility/Microphone 权限检查
│
├── preload/
│   ├── index.ts              # contextBridge API
│   └── index.d.ts            # window.api 类型
│
├── renderer/
│   ├── App.tsx               # 根组件（只渲染 FloatingBar）
│   ├── main.tsx              # React 入口
│   ├── index.html            # HTML 入口
│   ├── components/FloatingBar/
│   │   ├── FloatingBar.tsx   # 状态栏（波形/弹跳点/勾号动画 + 文字预览）
│   │   └── FloatingBar.module.css  # 毛玻璃 + Apple 配色
│   ├── hooks/
│   │   ├── useAudioRecorder.ts    # MediaRecorder API（WebM/Opus）
│   │   ├── useRecordingState.ts   # 录音状态机（含录音时长传递）
│   │   └── useSoundFeedback.ts    # 音效（Web Audio API 合成音，受设置开关控制）
│   └── styles/global.css
│
└── shared/
    ├── types.ts              # VoiceFlowSettings, RecordingState
    ├── constants.ts          # 模型名、尺寸
    └── ipc-channels.ts       # IPC 频道名
```

## 设置项

```typescript
interface VoiceFlowSettings {
  openaiApiKey: string           // OpenAI API Key（Whisper + GPT）
  customDictionary: string[]     // 自定义词典
  language: string               // deprecated — 保留向后兼容
  preferredLanguages: string[]   // 用户选择的常用语言 ISO 639-1，如 ['en','zh','ja']，或 ['auto']
  autoStart: boolean             // 开机自启动（已实现，通过 app.setLoginItemSettings）
  soundFeedback: boolean         // 声音反馈开关（默认 true）
}
```

存储位置：`~/Library/Application Support/voiceflow-settings/`

## 统计数据

```typescript
interface HistoryStats {
  totalWords: number         // 累计总词数
  totalSessions: number      // 累计总听写次数
  timeSavedMs: number        // 累计节省时间（ms）
  totalRecordingMs: number   // 累计录音时长（ms），用于计算平均 WPM
  avgWpm: number             // 平均口述速度 = totalWords / totalRecordingMs × 60000
}
```

**计算逻辑：**
- **Dictations**：每次成功转录 +1，准确
- **Words**：`processedText.split(/[\s\u3000]+/)` 按空格和全角空格分词，CJK 和 Latin 混合文本会有误差但足够实用
- **Time Saved**：`max(0, (wordCount / 45WPM × 60000) - durationMs)`，45 WPM 是中等打字速度基线
- **Avg Speed (WPM)**：`totalWords / totalRecordingMs × 60000`，录音时长从 renderer 传入（`elapsedSeconds × 1000`），不消耗额外 token

## 关键常量

| 常量 | 值 | 说明 |
|------|-----|------|
| WHISPER_MODEL | whisper-1 | OpenAI Whisper |
| GPT_MODEL | gpt-4o-mini | 文本润色（temperature 0.1） |
| HOLD_THRESHOLD | 400ms | 长按 vs 轻按的判定阈值 |
| OPT_KEYCODE | 56 | Left Option/Alt 键码（uiohook-napi） |
| CLIPBOARD_RESTORE_DELAY_MS | 200 | 粘贴后恢复剪贴板延迟 |
| MIN_AUDIO_SIZE | 1500 bytes | 最小音频大小，低于此值跳过处理 |
| PREVIEW_MAX_CHARS | 40 | 浮动条预览文字截断长度 |
| ERROR_AUTO_CLEAR | 5000ms | 错误状态自动清除延迟 |
| MAX_ENTRIES | 500 | 历史记录上限 |
| TYPING_WPM | 45 | 节省时间计算基线（打字速度） |

## 技术决策记录

### 为什么不用 OpenAI SDK
Electron 主进程中 SDK 的 `fetch` 实现有兼容性问题，会报 "Connection error"。
改用 Node.js 原生 `https` 模块，手动构建 multipart/form-data 和 JSON POST。

### 为什么用 WebM/Opus 而非 WAV
录音从 ScriptProcessorNode（Float32Array → WAV）改为 MediaRecorder（直接输出 WebM/Opus）。
3 秒录音从 ~114KB 降到 ~8KB，上传时间减少 200-500ms。
Whisper API 原生支持 WebM 格式。

### 为什么设置窗口用内联 HTML
Vite dev server 的 hash/query 路由在 Electron 中不可靠。
React 版设置面板曾尝试过但渲染不出来。
当前方案：在 `windows.ts` 中拼接 HTML 字符串，写入临时文件，`nodeIntegration: true` 直接用 `ipcRenderer`。

### GPT 始终运行
之前有"短句跳过 GPT"的逻辑，但这导致标点缺失、空格异常。
现在 GPT 对每条转录都运行，确保：标点精准、去填充词、修 STT 错误、code-switching 保护。
代价是每次多 ~0.5-1s 延迟和 ~$0.001 成本，但质量提升明显。

### 多语言语音识别（参考 Wispr Flow 方案）
- **preferredLanguages 设置**：用户可选 1-N 种常用语言，缩小 Whisper 检测范围
  - 1 种语言 → 直接传 `language` 参数给 Whisper，100% 准确不会误判
  - 2+ 种语言 → auto-detect + 验证结果是否在用户列表内，不在则重试
  - `['auto']`（默认）→ 纯 auto-detect，100+ 语言
- **翻译误判重试**：Whisper 有已知 bug 会把非英语音频"翻译"成英文。通过检测文本脚本与检测语言不匹配（如 lang=es 但输出全是英文），自动用显式 `language` 参数重试
- Whisper prompt 只包含自定义词典，不含 demo 句子（demo 句子会偏置语言检测）
- GPT prompt 基于文本中实际出现的脚本（CJK/Latin/Cyrillic）动态决定标点和空格规则
- 标点规则按文本内容使用对应的标点符号（中文用全角，英文用半角等）
- 空格规则：CJK 文字与 Latin 之间不加空格
- Code-switching 混合规则仅在文本中同时出现多种脚本时触发（不再基于 detectedLang 硬编码）

### 浮动状态栏波形可视化
之前用固定 50ms setTimeout 等待 MediaStream，但 getUserMedia 有时需要 100-500ms。
改为每 30ms 轮询 getStream()，直到 stream 就绪才初始化 AudioContext 和波形动画。

## 上下文感知 GPT Prompt

GPT 对 8 种上下文使用不同的 system prompt：

| 上下文 | 风格 | 示例应用 |
|--------|------|----------|
| email | 专业、完整句子、问候/正文/落款格式 | Mail, Gmail, Outlook, Superhuman |
| chat | 随意、简短、无问候 | Slack, Teams, WhatsApp, Telegram, Discord |
| code | 保留技术术语和大小写、简洁 | VS Code, Zed, Sublime, iTerm, Terminal |
| document | 正式、结构化、段落 | Pages, Word |
| notes | 清晰要点、可扫读 | Notes, Notion, Obsidian, Evernote, Craft |
| social | 活泼、简洁、自然 | Twitter |
| browser | 根据标题智能判断（Gmail→email, GitHub→code 等） | Safari, Chrome, Firefox, Arc |
| general | 自然、匹配说话者语气 | 其他所有应用 |

所有 prompt 共享的规则：去除填充词（任何语言）、保留最终版本（自我修正）、精准标点（按语言使用全角/半角）、修复识别错误、**保持多语言混合不翻译**。

## 设置窗口 UI（windows.ts）

布局参考 macOS 系统设置 / Typeless：
- 可调整大小（默认 620×700px，最小 520×480px）
- `titleBarStyle: 'hiddenInset'` — 原生红绿灯按钮，trafficLightPosition: (16, 16)
- 左侧边栏导航，分组标题（Settings / Data），带 SVG 图标
- 右侧内容区，卡片式分组（`group-content` + `group-row`）
- 实色深色主题（#1a1a1a），不用透明/vibrancy
- macOS 风格 toggle switch（CSS 纯实现）
- 彩色 badge（绿色/紫色/橙色）
- 保存反馈用底部 pill toast
- 自定义 scrollbar
- 内联 HTML 写入 `$TMPDIR/voiceflow/settings.html`，`nodeIntegration: true`

### Overview 页
- 4 张统计卡片（2×2 grid）：Dictations、Words、Time Saved、Avg Speed (WPM)
- 统计卡片实时刷新（每次切换到 Overview 页通过 IPC 重新加载最新数据）
- Status 指示灯（API key 是否已配置）
- Quick Start 步骤指引

### General 页
- OpenAI API Key（密码输入框 + 眼睛图标显示/隐藏 + Verify 按钮即时验证）
- Launch at Login 开关（toggle switch，接通 `app.setLoginItemSettings()`）
- Sound Feedback 开关（toggle switch，接通 renderer `useSoundFeedback`）

### Dictation 页
- Preferred Languages 多选语言芯片（19 种常用语言 + Auto，可多选，选择后缩小 Whisper 检测范围）
- Custom Dictionary（多行文本框）
- AI Processing 信息：Context-Aware Formatting / Auto-Editing / Model（badge 显示）

### Shortcuts 页
- Hold to Talk / Toggle Recording 两种模式说明
- Open Settings（右键浮动条）

### History 页
- 加载最近 500 条记录，首次显示 50 条 + Load More 分页
- 搜索框（按文本内容/应用名模糊搜索）
- 每条显示：时间戳、应用名、语言、耗时、词数、处理后文字、原始文字（如不同）
- 点击复制到剪贴板（闪绿 + "Copied!" 反馈）
- Clear All 按钮（有确认对话框）

### About 页
- 产品名称、描述、版本号（读取 package.json）
- 架构信息（Whisper + GPT-4o-mini）
- 功能亮点列表（含智能语言检测、自动重试）
- 费用估算（~$0.001/次，~$7/月 @100次/天）

## 浮动状态栏（FloatingBar）

休眠态自动隐藏，hover 展开，使用时自动弹出：

| 状态 | 胶囊尺寸 | 窗口尺寸（含 padding 24px×2） | 内容 |
|------|---------|------|------|
| dormant（休眠） | 40×4px | 104×68 | 半透明短线，几乎不可见 |
| idle（hover 展开） | 152×44px | 200×92 | 紫色菱形图标 + "VoiceFlow"，渐变紫背景 + 辉光 |
| recording | 224×44px | 272×92 | 红色脉冲圆点 + 10 条渐变色频率柱 + 计时 + 停止按钮，暗红渐变 + 红色脉冲辉光 |
| processing | 180×44px | 228×92 | 环形 spinner + "Processing..." 动画点，深蓝渐变 + shimmer 流光效果 |
| success（预览） | 180×44px | 228×92 | 绿色勾号（弹跳动画）+ 前 40 字预览，暗绿渐变 + 绿色辉光 |
| error | 180×44px | 228×92 | ✕ 图标 + 错误文字，暗红渐变 + 抖动动画，5s 后回到 dormant |

- **休眠态**：鼠标 hover 后 0.3s 展开，离开后 0.6s 延迟缩回
- **活跃状态**：自动展开不需要 hover，完成后直接回到休眠态
- **视觉效果**：渐变背景（每个状态不同色调）、毛玻璃 blur(40px) saturate(180%)、状态辉光阴影、spring 弹性动画
- **波形条**：紫→粉渐变色（#7c6ef0 → #e040fb），替代纯白
- **品牌图标**：紫色旋转菱形 ◆，带呼吸辉光动画
- 位置：屏幕底部居中，休眠态距底 12px，展开态距底 20px
- 右键菜单：打开设置窗口

## macOS 权限

1. **Accessibility**：uiohook 全局快捷键 + AppleScript 文本注入
   - 开发模式：给 `node_modules/electron/dist/Electron.app` 授权
2. **Microphone**：录音

## 调试

日志位置：`~/Library/Application Support/voiceflow/voiceflow.log`（由 `logger.ts` 管理）

日志格式：
```
[timestamp] Audio: 8234 bytes
[timestamp] Captured app: Slack (com.tinyspeck.slackmacgap) → chat
[timestamp] Whisper (1205ms, lang=zh, noSpeech=false): 我觉得这个feature很好
[timestamp] GPT (892ms): 我觉得这个feature很好。
[timestamp] Done: 2341ms
```

开发调试命令：
```bash
rm -rf out && npm run dev       # 清理缓存启动
cat ~/Library/Application\ Support/voiceflow/voiceflow.log  # 查看日志
```

## IPC 频道

| 频道 | 方向 | 说明 |
|------|------|------|
| RECORDING_START | main → renderer | 开始录音 |
| RECORDING_STOP | main → renderer | 停止录音 |
| AUDIO_COMPLETE | renderer → main | 音频数据传输（ArrayBuffer + recordingMs） |
| STATE_CHANGE | main → renderer | 状态切换（idle/recording/processing/injecting/error） |
| ERROR | main → renderer | 错误信息 |
| TRANSCRIPTION_PREVIEW | main → renderer | 转录预览文字（前 40 字） |
| SETTINGS_GET / SETTINGS_SET | renderer ↔ main | 读写设置 |
| HISTORY_GET / HISTORY_STATS / HISTORY_CLEAR | renderer ↔ main | 历史记录操作 |
| OPEN_SETTINGS | renderer → main | 打开设置窗口 |
| RESIZE_BAR | renderer → main | 动态调整浮动条窗口大小 |

## 已尝试但放弃的方案

| 方案 | 原因 |
|------|------|
| Deepgram Nova-3 流式 STT | 中文识别极差（字间空格、混淆日韩文） |
| Anthropic Claude Haiku | 简化为只用 OpenAI，减少 API Key |
| OpenAI SDK | Electron 主进程 fetch 不兼容 |
| Fn 键做快捷键 | macOS 拦截 Fn 用于 emoji 选择器，无法可靠检测 |
| Ask 提问模式（⌥+Space） | 使用场景模糊，增加复杂度和快捷键冲突，已删除 |
| Vite dev server 渲染设置页 | hash 路由在 Electron 窗口中不可靠，改用内联 HTML |
| vibrancy 透明窗口 | 内容完全看不清，改用实色背景 |
| 短句跳过 GPT | 导致标点缺失和空格异常，改为始终运行 GPT |
| 硬编码语言列表（isCJK） | 只覆盖中日韩，改为基于文本内容动态检测多语言混合 |
| Whisper prompt 中放 demo 句子 | 中文/英文 demo 句子会偏置 Whisper 语言检测，导致误判和翻译。改为只放自定义词典 |
| 纯 auto-detect 不限定语言 | Whisper 在 100 种语言中盲猜容易出错，参考 Wispr Flow 改为用户选择常用语言缩小范围 |

## 费用估算

| API | 单次成本 | 每天 100 次 | 每月 |
|-----|---------|------------|------|
| Whisper | ~$0.006/分钟（~5-10s 录音≈$0.001） | ~$0.10 | ~$3 |
| GPT-4o-mini | ~$0.0003/次（始终运行） | ~$0.03 | ~$1 |
| **合计** | **~$0.001/次** | **~$0.13** | **~$4/月** |

实际测试：中等使用强度（~200 次/天）约 $0.25/天 ≈ $7.5/月，与 Typeless/Wispr Flow 订阅价持平。

## 下一步建议

按优先级排序：
1. **打包成 .app** — `npm run package` 即可，但需测试签名和权限
2. **API Key 验证** — 输入后立即发一个小请求测试是否有效
3. **快捷键自定义 UI** — 允许用户修改 ⌥ Option 为其他按键
4. **版本号管理** — package.json version + About 页显示
