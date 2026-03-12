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

# ─── 2. 备份挂载点目录 ────────────────────────────────────
echo "[2/4] 备份 ${MOUNT_POINT} 到 ${BACKUP_DIR}..."
mkdir -p "$BACKUP_DIR"
if [[ -d "$MOUNT_POINT" ]]; then
    cp -r "$MOUNT_POINT" "$BACKUP_DIR/"
    echo "[2/4] 备份完成，结构保存在 ${BACKUP_DIR}/${MOUNT_DIRNAME}/"
else
    echo "[WARN] 挂载点 ${MOUNT_POINT} 不存在，跳过备份"
fi

echo "✅ 备份完成"