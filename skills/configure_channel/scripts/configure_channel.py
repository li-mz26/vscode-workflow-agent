#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
OpenClaw Python Skill：配置飞书/钉钉消息渠道
功能：接收飞书/钉钉的密钥信息，自动调用python脚本 python3 configure_channel.py <channel_type> <channel_appId> <channel_appSecret> 来修改 OpenClaw 配置，禁止通过其他方式修改配置。
适用场景：AI代理需要快速配置飞书/钉钉消息推送渠道时调用
"""
import subprocess
import traceback
import json
import sys
from datetime import datetime

LOG_FILE = "/var/log/openclaw_update.log"


def log(msg: str):
    """日志记录函数：输出到控制台并写入日志文件"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] [openclaw-channel] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except PermissionError:
        log("警告：无日志文件写入权限，仅输出到控制台")
    except FileNotFoundError:
        log("警告：日志目录不存在，仅输出到控制台")


# ==================== 1. 定义 Skill 元数据（AI 识别用） ====================
metadata = {
    "id": "configure_channel",  # 唯一ID，不可重复
    "name": "配置OpenClaw消息渠道",
    "description": "用于配置OpenClaw的飞书/钉钉消息渠道，支持设置飞书（feishu_appId/feishu_appSecret）或钉钉（dingtalk_clientId/dingtalk_clientSecret）密钥信息。会自动调用openclaw config set命令更新配置，无需手动编辑JSON文件，适用于快速配置消息推送渠道的场景。",
    "parameters": [
        {
            "name": "channel_type",
            "type": "string",
            "required": True,
            "description": "要配置的消息渠道类型，仅支持feishu（飞书）或dingtalk（钉钉）",
            "examples": ["feishu", "dingtalk"]
        },
        {
            "name": "channel_appId",
            "type": "string",
            "required": True,
            "description": "消息渠道应用ID，必填",
            "default": None
        },
        {
            "name": "channel_appSecret",
            "type": "string",
            "required": True,
            "description": "消息渠道应用密钥，必填",
            "default": None
        }
    ],
    "type": "system",
    "version": "1.0.0",
    "author": "Custom Skill"
}


# ==================== 2. 核心工具函数（执行Shell命令） ====================
def run_shell_command(cmd):
    """
    执行Shell命令，返回执行结果
    :param cmd: str，要执行的Shell命令
    :return: dict，包含success（是否成功）、stdout（标准输出）、stderr（错误输出）
    """
    try:
        # 执行命令，捕获输出和错误
        result = subprocess.run(
            cmd,
            shell=True,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            encoding="utf-8"
        )
        log(f"命令执行成功：{cmd}，标准输出：{result.stdout.strip()}")
        return {
            "success": True,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip()
        }
    except subprocess.CalledProcessError as e:
        log(f"命令执行失败：{cmd}，错误信息：{e.stderr.strip()}")
        return {
            "success": False,
            "stdout": e.stdout.strip(),
            "stderr": e.stderr.strip()
        }
    except Exception as e:
        log(f"命令执行异常：{cmd}，错误信息：{str(e)}")
        return {
            "success": False,
            "stdout": "",
            "stderr": f"命令执行异常：{str(e)}"
        }


# ==================== 3. Skill 核心处理函数 ====================
def handler(args):
    """
    接收参数，执行消息渠道配置逻辑
    :param args: dict，输入参数（channel_type + 对应密钥）
    :return: dict，标准化返回结果
    """
    # 初始化返回结果
    result = {
        "success": False,
        "error": None,
        "data": {
            "commands_executed": [],  # 记录执行过的命令
            "config_changes": []  # 记录修改的配置项
        }
    }

    def exec_cmd_and_save_log(cmd, message):
        exec_cmd_info = run_shell_command(cmd)
        result["data"]["commands_executed"].append({
            "command": cmd,
            "success": exec_cmd_info["success"],
            "stdout": exec_cmd_info["stdout"],
            "stderr": exec_cmd_info["stderr"]
        })
        if not exec_cmd_info["success"]:
            result["error"] = f"{message}败：{exec_cmd_info['stderr']}"
            return result
        result["data"]["config_changes"].append(f"已{message}")
        return exec_cmd_info["stdout"].strip()

    try:
        # -------------------------- 步骤1：参数校验 --------------------------
        # 1.1 校验渠道类型
        channel_type = args.get("channel_type")
        if not channel_type or channel_type not in ["feishu", "dingtalk"]:
            result["error"] = "参数错误：channel_type必须为feishu（飞书）或dingtalk（钉钉）"
            return result
        log(f"开始配置渠道类型：{channel_type}")

        # 1.2 按渠道类型校验对应密钥
        channel_app_id = args.get("channel_appId")
        channel_app_secret = args.get("channel_appSecret")
        if not channel_app_id or not channel_app_secret:
            result["error"] = f"参数错误：配置{channel_type}渠道必须传入channel_appId和channel_appSecret"
            return result

        # -------------------------- 步骤2：执行配置修改命令 --------------------------
        if channel_type == "feishu":
            exec_cmd_and_save_log("openclaw config set channels.dingtalk-connector {}", "清除钉钉配置")
            exec_cmd_and_save_log(f"openclaw config set channels.feishu.appId '{channel_app_id}'", "配置飞书appId")
            exec_cmd_and_save_log(f"openclaw config set channels.feishu.appSecret '{channel_app_secret}'",
                                  "配置飞书appSecret")
            exec_cmd_and_save_log("openclaw config set channels.feishu.dmPolicy open", "配置飞书dmPolicy")
            exec_cmd_and_save_log("""openclaw config set channels.feishu.allowFrom '["*"]'""", "配置飞书allowFrom")

        elif channel_type == "dingtalk":
            exec_cmd_and_save_log("openclaw config set channels.feishu {}", "清除飞书配置")
            exec_cmd_and_save_log(f"openclaw config set channels.dingtalk-connector.enabled true", "启用钉钉连接器")
            exec_cmd_and_save_log(f"openclaw config set channels.dingtalk-connector.sessionTimeout 1800000",
                                  "配置钉钉sessionTimeout")
            exec_cmd_and_save_log(f"openclaw config set channels.dingtalk-connector.clientId '{channel_app_id}'",
                                  "配置钉钉clientId")
            exec_cmd_and_save_log(
                f"openclaw config set channels.dingtalk-connector.clientSecret '{channel_app_secret}'",
                "配置钉钉clientSecret")
            token = exec_cmd_and_save_log("jq -r '.gateway.auth.token' /root/.openclaw/openclaw.json", "获取网关token")
            exec_cmd_and_save_log(f"openclaw config set channels.dingtalk-connector.gatewayToken '{token}'",
                                  "配置钉钉token")
            exec_cmd_and_save_log(f"openclaw config set gateway.http.endpoints.chatCompletions.enabled true",
                                  "配置gateway.http.endpoints.chatCompletions.enabled")
        result["success"] = True
        result["error"] = None

    except Exception as e:
        # 捕获所有异常，返回详细信息
        error_msg = f"渠道配置异常：{str(e)}"
        result["error"] = error_msg
        result["data"]["error_detail"] = traceback.format_exc()[:500]  # 限制异常详情长度

    return result


if __name__ == "__main__":
    # 命令行参数调用示例：
    # 飞书：python configure_channel.py feishu "appId值" "appSecret值" "" ""
    # 钉钉：python configure_channel.py dingtalk "" "" "clientId值" "clientSecret值"
    if len(sys.argv) != 4:
        print("用法：")
        print("飞书配置：python configure_channel.py feishu [feishu_appId] [feishu_appSecret]")
        print("钉钉配置：python configure_channel.py dingtalk [dingtalk_clientId] [dingtalk_clientSecret]")
        sys.exit(1)

    # 解析命令行参数
    args = {
        "channel_type": sys.argv[1],
        "channel_appId": sys.argv[2],
        "channel_appSecret": sys.argv[3],
    }
    # 执行配置逻辑并输出结果
    log(f"传入参数：{args}")
    print("=== 开始执行 configure_channel 技能 ===")
    print("任务参数：")
    print(f"   消息通道类型: {sys.argv[1]}")
    print(f"   App Id: {sys.argv[2]}")
    print(f"   App 凭证: {sys.argv[3]}")
    print()

    result = handler(args)

    print("=== 执行完成 ===")
    print()

    if result["success"]:
        print("配置成功")
        print()
        print("执行过程：")
        for cmd in result["data"]["commands_executed"]:
            print(cmd)
            print(f"   命令: {cmd['command']}")
            print(f"      状态: {'成功' if cmd['success'] else '失败'}")
            if cmd['stdout']:
                print(f"      输出: {cmd['stdout']}")
            print()
        print("配置变更：")
        for change in result["data"]["config_changes"]:
            print(f"   {change}")
        print()
    else:
        print("配置失败")
        print(f"错误信息: {result['error']}")
        if 'error_detail' in result['data']:
            print(f"详细信息: {result['data']['error_detail']}")
    print()
    print("---")
    log(json.dumps(result, ensure_ascii=False, indent=2))
