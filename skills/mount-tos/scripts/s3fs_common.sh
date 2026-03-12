#!/bin/bash
# s3fs 共享函数库
# 被其他脚本通过 source 引入

# 通过 ECS 元数据服务获取当前实例所在区域
# 失败时回退到 cn-beijing
detect_region() {
    local region
    region=$(curl -s --connect-timeout 2 --max-time 5 100.96.0.96/latest/region_id 2>/dev/null || true)
    if [[ -n "$region" ]]; then
        echo "$region"
    else
        echo "cn-beijing"
    fi
}

# 根据系统可用内存自动计算最优 s3fs 参数
# 规则：memMB/2*0.3 > parallel_count * multipart_size
calculate_s3fs_params() {
    TOTAL_MEM_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "2048")

    SAFE_SIZE=$(( TOTAL_MEM_MB / 2 * 3 / 10 ))

    if [[ $SAFE_SIZE -ge 900 ]]; then
        PARALLEL_COUNT=30
        MULTIPART_SIZE=30
    elif [[ $SAFE_SIZE -ge 600 ]]; then
        PARALLEL_COUNT=30
        MULTIPART_SIZE=20
    elif [[ $SAFE_SIZE -ge 450 ]]; then
        PARALLEL_COUNT=30
        MULTIPART_SIZE=15
    elif [[ $SAFE_SIZE -ge 300 ]]; then
        PARALLEL_COUNT=30
        MULTIPART_SIZE=10
    else
        PARALLEL_COUNT=15
        MULTIPART_SIZE=10
    fi
}

# 配置 s3fs 凭证文件
# 参数: $1=AK, $2=SK, $3=凭证文件路径（可选，默认 $HOME/.passwd-s3fs）
setup_s3fs_credentials() {
    local ak="$1"
    local sk="$2"
    local passwd_file="${3:-$HOME/.passwd-s3fs}"

    echo "${ak}:${sk}" > "$passwd_file"
    chmod 600 "$passwd_file"
}

# 执行 s3fs 挂载
# 参数: $1=bucket, $2=mount_point, $3=endpoint, $4=凭证文件路径（可选）
mount_s3fs() {
    local bucket="$1"
    local mount_point="$2"
    local endpoint="$3"
    local passwd_file="${4:-$HOME/.passwd-s3fs}"

    calculate_s3fs_params

    echo "系统内存: ${TOTAL_MEM_MB}MB, 使用参数: parallel_count=${PARALLEL_COUNT}, multipart_size=${MULTIPART_SIZE}"

    mkdir -p "$mount_point"

    s3fs "$bucket" "$mount_point" \
        -o passwd_file="$passwd_file" \
        -o url="$endpoint" \
        -o parallel_count="${PARALLEL_COUNT}" \
        -o multipart_size="${MULTIPART_SIZE}" \
        -o max_background=1000 \
        -o max_stat_cache_size=100000 \
        -o multireq_max=30 \
        -o nonempty
}

# 安装 s3fs（如果尚未安装）
ensure_s3fs_installed() {
    if command -v s3fs &>/dev/null; then
        S3FS_VERSION=$(s3fs --version 2>&1 | head -1)
        echo "s3fs 已安装：${S3FS_VERSION}"
        return 0
    fi

    echo "s3fs 未安装，开始安装..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get update -qq
        sudo apt-get install -y s3fs
    elif command -v yum &>/dev/null; then
        sudo yum install -y s3fs-fuse
    else
        echo "[ERROR] 未找到支持的包管理器（apt/yum）"
        return 1
    fi

    if ! command -v s3fs &>/dev/null; then
        echo "[ERROR] s3fs 安装失败"
        return 1
    fi
    S3FS_VERSION=$(s3fs --version 2>&1 | head -1)
    echo "s3fs 安装完成：${S3FS_VERSION}"
}
