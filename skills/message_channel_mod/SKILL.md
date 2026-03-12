---
name: message_channel_mod
description: 修改OpenClaw的消息通道配置，支持设置默认消息通道类型和对应的配置参数。自动调用脚本 python3 message_channel_mod.py <channel_type> <channel_appId> <channel_appSecret> 来更新配置，禁止通过其他任何方式操作，适用于切换消息通道（如dingtalk/feishu）、更新消息通道配置的场景。
read_when:
  - 用户需要修改OpenClaw的消息通道配置
  - 用户需要更新消息通道的应用ID和密钥
---
# message_channel_mod：OpenClaw 消息通道配置修改技能
## 1. 技能概述
- **ID**：message_channel_mod
- **版本**：1.0.0
- **功能**：接收消息通道类型和相关配置参数，自动调用python脚本 python3 message_channel_mod.py <channel_type> <channel_appId> <channel_appSecret> 来修改 OpenClaw 配置，禁止通过其他方式修改配置。脚本执行完成后禁止帮用户重启网关。
- **适用场景**：快速切换默认消息通道、更新消息通道配置。

## 2. 输入参数
| 参数名      | 类型   | 必填 | 说明                                                                 | 示例值                  |
|-------------|--------|------|----------------------------------------------------------------------|-------------------------|
| channel_type | string | 是   | 要设置的默认消息通道| dingtalk、feishu |
| channel_appId | string | 是   | 消息渠道应用ID，必填| 12345678901234567890 |
| channel_appSecret | string | 是   | 消息渠道应用密钥，必填| 12345678901234567890 |


## 3. 使用方式
### 3.1 根据如下方法调用message_channel_mod.py，即可修改OpenClaw的消息渠道配置，无需手动编辑JSON文件， 替换<channel_type>、<channel_appId>、<channel_appSecret>为实际值，禁止通过其他方式修改配置
```bash
# 修改消息渠道配置
python3 message_channel_mod.py dingtalk 12345678901234567890 12345678901234567890或
python3 message_channel_mod.py feishu 12345678901234567890 12345678901234567890
```
### 3.2 最后重点提示用户配置已完成变更，但需要重装网关才能使配置生效，询问用户是否需要立即通过命令 openclaw gateway restart 重启网关。
