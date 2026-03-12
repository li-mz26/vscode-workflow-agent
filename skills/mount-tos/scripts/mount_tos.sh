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

# ─── 1. 配置凭证文件 ────────────────────────────────────
echo "[1/2] 配置 s3fs 凭证文件..."
setup_s3fs_credentials "$AK" "$SK"

# ─── 2. 挂载 TOS bucket ─────────────────────────────────
echo "[2/2] 挂载 ${BUCKET} 到 ${MOUNT_POINT}（region=${REGION}）..."
mount_s3fs "$BUCKET" "$MOUNT_POINT" "$ENDPOINT"

echo "✅ TOS bucket 挂载完成"
