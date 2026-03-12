---
name: configure_model
description: 修改OpenClaw的模型配置和API Key。自动调用脚本 python3 configure_model.py <model_type> <api_key> 来更新配置，禁止通过其他任何方式操作，适用于切换模型（如doubao-seed-code/glm-4.7）、更新API Key的场景。
read_when:
  - 用户需要修改OpenClaw的模型配置
  - 用户需要更新API Key
---
# configure_model：OpenClaw 模型配置修改技能
## 1. 技能概述
- **ID**：configure_model
- **版本**：1.0.0
- **功能**：接收模型类型和 API Key，自动调用脚本 python3 configure_model.py <model_type> <api_key> 来更新 OpenClaw 配置，禁止通过其他任何方式操作。脚本执行完成后禁止帮用户重启网关。
- **适用场景**：快速切换默认模型、更新 ARK 提供商 API Key。

## 2. 输入参数
| 参数名      | 类型   | 必填 | 说明                                                                 | 示例值                  |
|-------------|--------|------|----------------------------------------------------------------------|-------------------------|
| model_type  | string | 是   | 要设置的默认模型| glm-4.7、doubao-seed-code |
| api_key     | string | 是   | ARK 模型提供商的 API Key                       | 12b34014-2c1c-4a1b-ba40-f5*** |

## 3. 使用方式
### 3.1 使用如下方法调用configure_model.py，即可修改OpenClaw的模型配置，禁止通过其他任何方式修改配置， 替换<model_type>、<api_key>为实际值
```bash
# 修改模型 + 更新 API Key
python3 configure_model.py <model_type> <api_key>
```
### 3.2 最后重点提示用户配置已完成变更，但需要重装网关才能使配置生效，询问用户是否需要立即通过命令 openclaw gateway restart 重启网关。