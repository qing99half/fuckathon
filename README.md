# 预制黑客松模拟器（fuckathon）

> 每一届黑客松，都是一道预制菜。
> 纯前端网页游戏：文字事件选择 + 像素氛围场景 + 黑色幽默讽刺。
> 设计准绳：`../docs/游戏设计文档-v1.0.md`（其余旧版文档在 `../docs/archive/`）。

## 常用命令

```bash
npm install          # 装依赖（仅 vite / typescript / tsx，零运行时依赖）
npm run dev          # 开发服务器
npm run build        # 构建（自动先跑 validate）
npm run validate     # 内容校验：引用完整性 / 概率 0-1 / 字数 / 结局兜底
npm run simulate     # 机器人模拟（默认 1000 局 + 13 结局剧本可达性）
```

## 加梗 / 改文案的标准动线

1. 改 `src/data/*.json`（全部文案与数值都在这，代码里没有文案）
2. `npm run validate`
3. `npm run simulate 400`
4. 截图验证 → push

## 目录结构

```
src/
  engine/        # 纯逻辑，不碰 DOM：types / rng / effects / deck(组局) / judge / ending / index
  data/          # 全部内容 JSON：hypes/titles/patrons/sponsors/judges/cards.*/barrages/teams/endings
  ui/            # 全部碰 DOM 的组件：card / feedback / hud / barrage / pixelscene / endingcard / audio / assets
  main.ts        # 入口胶水层
scripts/
  validate.ts    # 构建期内容校验
  simulate.ts    # 机器人模拟 + 结局剧本
  assets/        # build_assets.py 美术后处理管线（裁水印/切帧/量化）
public/assets/   # 处理后的美术资源（进 git）
```

## 美术资源再生产

原图在仓库外 `../material/raw/`（AI 生成原图，不进 git）。修改原图后：

```bash
python scripts/assets/build_assets.py   # 输出到 public/assets/，核对图在 ../material/review/
```

## Debug

- `?debug=1`：右上角显示种子 / 当前卡 / 隐藏数值（怨气/翻车/良心/期待）
- `?auto=1`：机器人自动随机玩（配合无头浏览器截图冒烟测试）
- 种子复现：每局 HUD 右下角显示种子，引擎为种子随机，同种子同选择序列必现同局

## 上线

GitHub: https://github.com/qing99half/fuckathon.git → Vercel 导入仓库即可（Vite 自动识别，无需配置）。
