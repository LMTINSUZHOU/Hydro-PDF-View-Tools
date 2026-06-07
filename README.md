# hydro-pdf-viewer

Hydro v5 PDF 题面渲染插件。插件把 Hydro 题目附件渲染为题面内的 PDF.js 预览器，并兼容旧插件的 `@[hpdf](...)` 写法。

## 支持语法

```md
@[pdf](file://statement.pdf)
@[hpdf](file://statement.pdf)
@[pdfjs](file://statement.pdf)
```

推荐使用 `file://` 引用题目附件。插件会按 Hydro 当前题目附件路径解析，并自动追加 `noDisposition=1`，避免附件响应头触发下载。

## 安装

在插件目录安装依赖：

```bash
npm install
```

安装过程会把 PDF.js 静态文件复制到 `public/hydro-pdf-viewer/pdfjs/`。

把插件加入 Hydro：

```bash
hydrooj addon add /path/to/hydro-pdf-viewer
hydrooj addon list
```

重启 Hydro 后，在题目附件中上传 PDF，并在题面中写：

```md
@[pdf](file://statement.pdf)
```

## 说明

- 目标版本：Hydro v5.0.1。
- 插件注册 `pdf`、`hpdf`、`pdfjs` 三个 richmedia 服务。
- 默认只内嵌 Hydro 本地附件、站内相对路径和根相对路径。
- 外部 `http/https` PDF 默认不会内嵌，避免跨域、鉴权和安全问题。
- 如果 PDF.js 静态文件缺失或渲染失败，前端会回退到 iframe 和打开链接。

## 开发检查

```bash
npm run check
```
