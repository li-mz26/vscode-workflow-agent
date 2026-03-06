#!/bin/bash
# VSCode Workflow Agent 快速安装脚本

echo "🚀 VSCode Workflow Agent 安装器"
echo "================================"

# 检查 VSCode
if ! command -v code &> /dev/null; then
    echo "❌ 未找到 VSCode，请先安装 VSCode"
    exit 1
fi

# 检查 vsce
if ! command -v vsce &> /dev/null; then
    echo "📦 安装 vsce..."
    npm install -g vsce
fi

# 进入项目目录
cd "$(dirname "$0")"

echo "📦 打包扩展..."
vsce package --no-dependencies 2>/dev/null || {
    echo "⚠️ 打包失败，尝试直接安装..."
}

# 查找 vsix 文件
VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -1)

if [ -n "$VSIX_FILE" ]; then
    echo "📥 安装 $VSIX_FILE..."
    code --install-extension "$VSIX_FILE"
    echo "✅ 安装完成！"
else
    echo "⚠️ 未找到 .vsix 文件，尝试开发模式..."
    echo "💡 请按 F5 在 VSCode 中启动调试"
fi

echo ""
echo "📝 使用方法:"
echo "  1. 按 Ctrl+Shift+P"
echo "  2. 运行 'Workflow Agent: Create New Workflow'"
echo "  3. 开始创建工作流！"
