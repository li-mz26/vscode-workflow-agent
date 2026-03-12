#!/bin/bash

set -euo pipefail

# ─── 引入共享函数 ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/s3fs_common.sh"

# ─── 参数检查 ─────────────────────────────────────────────
usage() {
    echo "Usage: $0 -b <bucket> -m <mount_point> -a <access_key_id> -s <secret_access_key> [-r <region>] [-e <endpoint>]"
    echo ""
    echo "  -b  TOS bucket 名称"
    echo "  -m  挂载点路径"
    echo "  -a  Access Key ID"
    echo "  -s  Secret Access Key"
    echo "  -r  Region（默认：通过ECS元数据自动获取，回退cn-beijing）"
    echo "  -e  S3兼容端点（默认：根据region自动生成）"
    exit 1
}

REGION=""
ENDPOINT=""

while getopts "b:m:a:s:r:e:h" opt; do
    case $opt in
        b) BUCKET="$OPTARG" ;;
        m) MOUNT_POINT="$OPTARG" ;;
        a) AK="$OPTARG" ;;
        s) SK="$OPTARG" ;;
        r) REGION="$OPTARG" ;;
        e) ENDPOINT="$OPTARG" ;;
        h) usage ;;
        *) usage ;;
    esac
done

if [[ -z "${BUCKET:-}" || -z "${MOUNT_POINT:-}" || -z "${AK:-}" || -z "${SK:-}" ]]; then
    echo "[ERROR] 缺少必要参数"
    usage
fi

# 如果未指定 region，通过 ECS 元数据自动获取
if [[ -z "$REGION" ]]; then
    REGION=$(detect_region)
fi

# 如果未指定端点，根据 region 自动生成 S3 兼容端点
if [[ -z "$ENDPOINT" ]]; then
    ENDPOINT="http://tos-s3-${REGION}.ivolces.com"
fi

# ─── 常量配置 ─────────────────────────────────────────────
BACKUP_DIR="/tmp/open_claw_bak"
MOUNT_DIRNAME=$(basename "$MOUNT_POINT")

# ─── 1. 安装 s3fs ───────────────────────────────────────
echo "[1/4] 检查 s3fs 是否已安装..."
ensure_s3fs_installed

# ─── 2. 备份挂载点目录 ────────────────────────────────────
echo "[2/4] 备份 ${MOUNT_POINT} 到 ${BACKUP_DIR}..."
mkdir -p "$BACKUP_DIR"
if [[ -d "$MOUNT_POINT" ]]; then
    cp -r "$MOUNT_POINT" "$BACKUP_DIR/"
    echo "[2/4] 备份完成，结构保存在 ${BACKUP_DIR}/${MOUNT_DIRNAME}/"
else
    echo "[WARN] 挂载点 ${MOUNT_POINT} 不存在，跳过备份"
fi

# ─── 3. 配置凭证并挂载 TOS bucket ────────────────────────
echo "[3/4] 配置 s3fs 凭证并挂载 ${BUCKET} 到 ${MOUNT_POINT}（region=${REGION}）..."
setup_s3fs_credentials "$AK" "$SK"
mount_s3fs "$BUCKET" "$MOUNT_POINT" "$ENDPOINT"
echo "[3/4] 挂载成功"

# ─── 4. 还原备份文件 ──────────────────────────────────────
echo "[4/4] 将备份文件还原到 ${MOUNT_POINT}..."
if [[ -d "${BACKUP_DIR}/${MOUNT_DIRNAME}" ]]; then
    cp -r "${BACKUP_DIR}/${MOUNT_DIRNAME}/." "$MOUNT_POINT/"
    echo "[4/4] 还原完成"
else
    echo "[4/4] 无备份内容，跳过还原"
fi

echo "✅ 全部完成"
