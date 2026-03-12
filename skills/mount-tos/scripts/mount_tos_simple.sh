#!/bin/bash

set -euo pipefail

# ─── 引入共享函数 ─────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/s3fs_common.sh"

# ─── 参数检查 ─────────────────────────────────────────────
usage() {
    echo "Usage: $0 <bucket_name>"
    echo ""
    echo "  参数说明:"
    echo "    bucket_name  TOS bucket 名称"
    echo ""
    echo "  环境变量配置:"
    echo "    TOS_AK: Access Key ID（必需）"
    echo "    TOS_SK: Secret Access Key（必需）"
    echo "    TOS_REGION: 区域（默认：通过ECS元数据自动获取，回退cn-beijing）"
    echo "    TOS_ENDPOINT: S3兼容端点（默认：根据region自动生成）"
    echo "    TOS_MOUNT_POINT: 挂载点（默认：/mnt/tos/\$bucket_name）"
    exit 1
}

# ─── 检查参数 ─────────────────────────────────────────────
if [[ $# -ne 1 ]]; then
    echo "[ERROR] 需要提供bucket名称参数"
    usage
fi

BUCKET="$1"

# ─── 默认配置 ─────────────────────────────────────────────
REGION="${TOS_REGION:-$(detect_region)}"
ENDPOINT="${TOS_ENDPOINT:-http://tos-s3-${REGION}.ivolces.com}"
AK="${TOS_AK:-}"
SK="${TOS_SK:-}"
MOUNT_POINT="${TOS_MOUNT_POINT:-/mnt/tos/${BUCKET}}"

# ─── 检查必需环境变量 ─────────────────────────────────────
if [[ -z "$AK" ]]; then
    echo "[ERROR] 缺少环境变量 TOS_AK (Access Key ID)"
    echo "请设置环境变量: export TOS_AK=your_access_key_id"
    exit 1
fi

if [[ -z "$SK" ]]; then
    echo "[ERROR] 缺少环境变量 TOS_SK (Secret Access Key)"
    echo "请设置环境变量: export TOS_SK=your_secret_access_key"
    exit 1
fi

echo "========================================"
echo "TOS 挂载配置（s3fs）"
echo "========================================"
echo "Bucket名称: $BUCKET"
echo "挂载点: $MOUNT_POINT"
echo "区域: $REGION"
echo "S3端点: $ENDPOINT"
echo "Access Key ID: ${AK:0:4}**********"
echo "========================================"

# ─── 常量配置 ─────────────────────────────────────────────
BACKUP_DIR="/tmp/open_claw_bak"
MOUNT_DIRNAME=$(basename "$MOUNT_POINT")

# ─── 1. 检查 s3fs 是否已安装 ──────────────────────────────
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

echo "========================================"
echo "✅ TOS bucket 挂载完成"
echo "========================================"
echo "Bucket: $BUCKET"
echo "挂载点: $MOUNT_POINT"
echo "访问方式: ls $MOUNT_POINT"
echo "卸载命令: sudo umount $MOUNT_POINT"
echo "========================================"
