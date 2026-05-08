# Electron-Vite 迁移说明

本文档记录了从 Webpack 迁移到 Electron-Vite 的更改。

## 主要更改

### 1. 新增文件

- `electron.vite.config.ts` - Electron-Vite 主配置文件
- `vite-plugin-dvh-to-vh.ts` - 自定义 Vite 插件，用于将 dvh 单位替换为 vh（替代 webpack 的 string-replace-loader）
- `src/renderer/index.html` - Vite 所需的 HTML 入口文件（替代原来的 index.ejs）

### 2. 修改的文件

#### package.json

- 更新了所有构建脚本，从 webpack 命令改为 electron-vite 命令
- 主要脚本变更：
  - `build`: 使用 `electron-vite build`
  - `start`: 使用 `electron-vite dev`
  - `build:main`: 使用 `electron-vite build --main`
  - `build:renderer`: 使用 `electron-vite build --renderer`
  - `build:web`: 使用 `electron-vite build --renderer`（带环境变量）

#### src/main/main.ts

- 更新了 preload 文件路径逻辑，以支持 electron-vite 的开发模式
- 开发模式下，preload 文件位于 `.vite/preload.js`

### 3. 配置文件说明

#### electron.vite.config.ts

配置文件分为三个部分：

- **main**: 主进程配置
- **preload**: Preload 脚本配置
- **renderer**: 渲染进程配置

主要特性：

- 支持环境变量（CHATBOX_BUILD_TARGET, CHATBOX_BUILD_PLATFORM 等）
- 配置了路径别名（@ 和 src/shared）
- 集成了 React、TanStack Router、SVGR 等插件
- 自定义插件处理 dvh 到 vh 的转换
- 生产模式启用 source map 和代码压缩

## 需要安装的依赖

运行以下命令安装 electron-vite 和相关依赖：

```bash
npm install --save-dev electron-vite vite @vitejs/plugin-react vite-plugin-svgr vite-tsconfig-paths
```

注意：项目要求 Node.js >= 20.0.0 < 23.0.0，npm >= 10.0.0

## 开发模式

运行 `npm start` 或 `npm run dev` 启动开发服务器。electron-vite 会自动：

- 启动渲染进程的开发服务器（Vite）
- 构建并监听 preload 脚本的变化
- 主进程需要使用 `npm run start:main` 单独启动（或使用 electron-vite 的自动启动功能）

## 构建

- `npm run build` - 构建所有进程（main、preload、renderer）
- `npm run build:main` - 仅构建主进程
- `npm run build:renderer` - 仅构建渲染进程
- `npm run build:web` - 构建 Web 版本

## 注意事项

1. **Preload 路径**: 开发模式下，preload 文件位于 `.vite/preload.js`，生产模式下位于 `release/app/dist/main/preload.js`

2. **环境变量**: 环境变量通过 `define` 配置注入，确保在代码中可以访问 `process.env.CHATBOX_BUILD_PLATFORM` 等变量

3. **HTML 入口**: Vite 需要标准的 HTML 文件作为入口，已创建 `src/renderer/index.html` 替代原来的 `index.ejs`

4. **CSS 模块**: CSS 模块的命名规则已配置为 `[name]__[local]___[hash:base64:5]`，与 webpack 保持一致

5. **资源路径**: 构建输出的资源文件结构与 webpack 保持一致，位于 `assets/` 目录下

6. **dvh 到 vh 转换**: 通过自定义 Vite 插件实现，替代了 webpack 的 string-replace-loader

## 迁移检查清单

- [x] 创建 electron-vite.config.ts
- [x] 创建 vite-plugin-dvh-to-vh.ts
- [x] 创建 src/renderer/index.html
- [x] 更新 package.json 脚本
- [x] 更新主进程 preload 路径
- [x] 配置环境变量
- [x] 配置路径别名
- [ ] 安装依赖包（需要 Node.js >= 20）
- [ ] 测试开发模式
- [ ] 测试生产构建
- [ ] 测试 Web 构建

## 后续工作

1. 安装依赖后，测试开发模式是否正常工作
2. 测试生产构建是否正常
3. 如有问题，检查并调整配置
4. 可以考虑移除不再需要的 webpack 相关依赖和配置文件
