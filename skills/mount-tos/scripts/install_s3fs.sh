#!/bin/bash

set -euo pipefail

# ─── 参数检查 ─────────────────────────────────────────────
usage() {
    echo "Usage: $0"
    exit 1
}

while getopts "h" opt; do
    case $opt in
        h) usage ;;
        *) usage ;;
    esac
done

# ─── 引入共享函数 ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/s3fs_common.sh"

# ─── 安装 s3fs ────────────────────────────────────────────
echo "[1/1] 检查并安装 s3fs..."
ensure_s3fs_installed
echo "✅ s3fs 安装完成"
