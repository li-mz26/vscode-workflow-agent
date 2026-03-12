#!/bin/bash

set -euo pipefail

# ─── 参数检查 ─────────────────────────────────────────────
usage() {
    echo "Usage: $0 -m <mount_point>"
    echo ""
    echo "  -m  挂载点路径"
    exit 1
}

while getopts "m:h" opt; do
    case $opt in
        m) MOUNT_POINT="$OPTARG" ;;
        h) usage ;;
        *) usage ;;
    esac
done

if [[ -z "${MOUNT_POINT:-}" ]]; then
    echo "[ERROR] 缺少挂载点参数"
    usage
fi

# ─── 常量配置 ─────────────────────────────────────────────
BACKUP_DIR="/tmp/open_claw_bak"
MOUNT_DIRNAME=$(basename "$MOUNT_POINT")

# ─── 4. 还原备份文件 ──────────────────────────────────────
echo "[4/4] 将备份文件还原到 ${MOUNT_POINT}..."
if [[ -d "${BACKUP_DIR}/${MOUNT_DIRNAME}" ]]; then
    cp -r "${BACKUP_DIR}/${MOUNT_DIRNAME}/." "$MOUNT_POINT/"
    echo "[4/4] 还原完成"
else
    echo "[4/4] 无备份内容，跳过还原"
fi

echo "✅ 备份还原完成"