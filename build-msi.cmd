@echo off
chcp 65001 >nul
setlocal
rem ============================================================
rem  卫戍协议直播 UI · 构建 Windows x64 MSI 安装包
rem  用法：双击本文件，或在项目根目录执行 build-msi.cmd
rem  前置：Node.js 20+，首次运行需联网下载 electron / wix 工具
rem ============================================================

cd /d "%~dp0"

echo [1/3] 构建前端与服务端...
call npm run build || goto :fail

echo [2/3] 打包并生成 MSI（首次会下载依赖，约数分钟）...
call npx electron-builder --win msi --x64 || goto :fallback

echo [3/3] 完成，产物在 release\ 目录。
dir /b release\*.msi
goto :end

:fallback
echo.
echo [!] WiX 链接失败。常见原因：
echo     - 本机 VBScript / Windows Script Host 被策略禁用（Win11 24H2 之后常见），
echo       WiX 的 ICE 校验因此无法执行。
echo     - 杀软拦截 wix 工具写临时文件。
echo     可尝试：以管理员身份重新运行本脚本，或临时启用 Windows Script Host。

:fail
:end
pause