---
name: mount-tos
description: 通过s3fs将火山引擎TOS对象存储挂载到本地文件系统的技能，支持AK/SK认证、自定义挂载点、基于内存自动调优s3fs性能参数。当Claude需要将TOS bucket挂载为本地文件系统进行文件操作时使用此技能
---

# Mount TOS（s3fs）

## 概述

本技能提供将火山引擎TOS对象存储挂载为本地文件系统的能力。通过s3fs（S3兼容文件系统），可以将TOS bucket映射为本地目录，支持标准文件操作（读、写、删除等）。脚本会根据系统内存自动计算最优的 `parallel_count` 和 `multipart_size` 参数以获得最佳读写性能。

## 快速开始

### 完整挂载流程

使用完整脚本一次性完成所有步骤：

```bash
./scripts/mount_tos_complete.sh -b <bucket_name> -m <mount_point> -a <access_key_id> -s <secret_access_key>
```

### 简易模式（环境变量配置）

通过环境变量传入 AK/SK，仅需指定 bucket 名称：

```bash
export TOS_AK=<access_key_id>
export TOS_SK=<secret_access_key>
./scripts/mount_tos_simple.sh <bucket_name>
```

### 分步执行

1. **安装s3fs工具**：
   ```bash
   ./scripts/install_s3fs.sh
   ```

2. **备份现有挂载点**（可选）：
   ```bash
   ./scripts/backup_mountpoint.sh -m <mount_point>
   ```

3. **挂载TOS bucket**：
   ```bash
   ./scripts/mount_tos.sh -b <bucket_name> -m <mount_point> -a <access_key_id> -s <secret_access_key>
   ```

4. **恢复备份文件**（可选）：
   ```bash
   ./scripts/restore_backup.sh -m <mount_point>
   ```

## 参数说明

### 必需参数
- `-b`：TOS bucket名称
- `-m`：本地挂载点路径
- `-a`：Access Key ID
- `-s`：Secret Access Key

### 可选参数
- `-r`：区域（默认：通过ECS元数据 `100.96.0.96/latest/region_id` 自动获取，回退cn-beijing）
- `-e`：S3兼容端点（默认：http://tos-s3-cn-beijing.ivolces.com，根据region自动生成）

### 环境变量（简易模式）
- `TOS_AK`：Access Key ID（必需）
- `TOS_SK`：Secret Access Key（必需）
- `TOS_REGION`：区域（默认：通过ECS元数据自动获取，回退cn-beijing）
- `TOS_ENDPOINT`：S3兼容端点（默认根据region自动生成）
- `TOS_MOUNT_POINT`：挂载点路径（默认：/mnt/tos/$bucket_name）

## 脚本说明

### 1. install_s3fs.sh
安装s3fs文件系统工具，支持 apt 和 yum 包管理器。

### 2. backup_mountpoint.sh
备份现有挂载点内容到临时目录。

### 3. mount_tos.sh
挂载TOS bucket到指定目录，自动配置凭证文件和性能参数。

### 4. restore_backup.sh
将备份文件恢复到挂载点。

### 5. mount_tos_complete.sh
完整挂载流程脚本，包含安装、备份、挂载、恢复所有步骤。

### 6. mount_tos_simple.sh
简易挂载脚本，通过环境变量配置AK/SK，仅需传入bucket名称。

## s3fs 性能调优

脚本会根据系统可用内存自动选择最优参数，规则：`memMB / 2 * 0.3 > parallel_count * multipart_size`

| 内存规格 | parallel_count | multipart_size | 预期读取加速 |
|----------|---------------|----------------|-------------|
| ≥ 8192MB | 30 | 30 | ~4.5倍（~1.0GB/s） |
| 4096MB | 30 | 20 | ~4倍（~941MB/s） |
| 3072MB | 30 | 15 | ~4倍（~928MB/s） |
| 2048~2560MB | 30 | 10 | ~3倍（~730MB/s） |
| 1024MB | 15 | 10 | ~2倍（~403MB/s） |

### 其他固定优化参数
- `max_background=1000`：FUSE并发异步请求上限
- `max_stat_cache_size=100000`：元数据缓存条目上限（约40MB）
- `multireq_max=30`：目录列表同步请求上限

## 使用示例

### 示例1：完整挂载
```bash
./scripts/mount_tos_complete.sh \
  -b my-tos-bucket \
  -m /mnt/tos/my-bucket \
  -a AKLTxxxxxxxxxxxxxxxxxxxx \
  -s SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 示例2：简易模式
```bash
export TOS_AK=AKLTxxxxxxxxxxxxxxxxxxxx
export TOS_SK=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
./scripts/mount_tos_simple.sh my-tos-bucket
```

### 示例3：使用自定义区域
```bash
./scripts/mount_tos_complete.sh \
  -b my-tos-bucket \
  -m /mnt/tos/my-bucket \
  -a AKLTxxxxxxxxxxxxxxxxxxxx \
  -s SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  -r cn-shanghai
```

## 注意事项

1. **权限要求**：脚本需要sudo权限安装s3fs工具。
2. **网络连接**：需要能够访问TOS S3兼容端点（tos-s3-*.ivolces.com）。
3. **挂载点**：挂载点目录会被清空，建议先备份重要数据。
4. **AK/SK安全**：凭证存储在 `~/.passwd-s3fs`，权限为600。确保AK/SK不在脚本中硬编码。
5. **/tmp空间**：s3fs使用 `/tmp` 存放临时分片文件，需确保 `/tmp` 可用空间大于 `multipart_size * parallel_count`（MB）。
6. **S3兼容端点**：TOS的S3兼容端点格式为 `tos-s3-{region}.ivolces.com`（注意与标准TOS端点 `tos-{region}.ivolces.com` 不同）。

## 故障排除

### s3fs 安装失败
- 检查网络连接
- 确认包管理器可用（apt 或 yum）
- 检查是否有sudo权限

### 挂载失败
- 验证AK/SK是否正确
- 检查bucket名称是否存在
- 确认使用的是S3兼容端点（tos-s3-*.ivolces.com）
- 检查挂载点目录权限

### 磁盘空间不足错误
`s3fs: There is no enough disk space for used as cache(or temporary) directory by s3fs.`
- s3fs上传大文件时会在 `/tmp` 写入临时缓存
- 需确保 `/tmp` 可用空间 > `multipart_size * parallel_count`
- 解决方案：增大磁盘空间，或降低 `multipart_size` / `parallel_count` 参数

### 文件操作失败
- 检查文件权限设置
- 验证TOS bucket的访问策略

## 脚本位置

所有脚本位于 `scripts/` 目录下：
- `s3fs_common.sh` - 共享函数库（凭证配置、内存计算、挂载逻辑）
- `install_s3fs.sh` - s3fs工具安装
- `backup_mountpoint.sh` - 挂载点备份
- `mount_tos.sh` - TOS bucket挂载
- `restore_backup.sh` - 备份恢复
- `mount_tos_complete.sh` - 完整挂载流程
- `mount_tos_simple.sh` - 简易挂载流程（环境变量模式）

## 卸载说明

要卸载挂载的TOS bucket：
```bash
sudo umount <mount_point>
```
