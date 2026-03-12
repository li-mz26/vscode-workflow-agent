#!/usr/bin/env python3
import sys
import subprocess
import traceback
import json
from datetime import datetime

LOG_FILE = "/var/log/openclaw_update.log"


def log(msg: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] [openclaw] {msg}"
    print(line)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except PermissionError:
        pass


def run_shell_command(cmd):
    try:
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


def handler(args):
    result = {
        "success": False,
        "error": None,
        "data": {
            "commands_executed": [],
            "config_changes": []
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
            result["error"] = f"{message}失败：{exec_cmd_info['stderr']}"
            return None
        result["data"]["config_changes"].append(f"已{message}")
        return exec_cmd_info["stdout"].strip()

    try:
        _model_type = args.get("model_type")
        if not _model_type:
            result["error"] = "参数错误：必须传入 model_type（如glm-4.7）"
            return result

        _api_key = args.get("api_key")
        if not _api_key:
            result["error"] = "参数错误：必须传入 api_key（用于调用模型服务）"
            return result

        ark_model_type = "ark/{}".format(_model_type)
        exec_cmd_and_save_log(f'openclaw models set "{ark_model_type}"', "修改默认模型")
        exec_cmd_and_save_log(f"openclaw config set models.providers.ark.apiKey '{_api_key}'", "修改API Key")

        verify_model_cmd = "openclaw config get agents.defaults.model.primary"
        verify_model_result = run_shell_command(verify_model_cmd)
        defaults_model_info = exec_cmd_and_save_log("openclaw config get agents.defaults.model.primary", "获取默认模型")
        if _model_type in defaults_model_info:
            result["data"]["verification"] = ["默认模型验证成功"]
        else:
            result["data"]["verification"] = [f"默认模型验证失败，当前值：{verify_model_result['stdout']}"]
        result["success"] = True
        result["error"] = None
    except Exception as e:
        error_msg = f"配置修改异常：{str(e)}"
        result["error"] = error_msg
        result["data"]["error_detail"] = traceback.format_exc()[:500]

    return result


if __name__ == "__main__":
    model_type = sys.argv[1]
    api_key = sys.argv[2]

    print("=== 开始执行 configure_model 技能 ===")
    print("任务参数：")
    print(f"   模型类型: {model_type}")
    print(f"   API Key: {api_key}")
    print()

    result = handler({"model_type": model_type, "api_key": api_key})

    print("=== 执行完成 ===")
    print()

    if result["success"]:
        print("配置成功")
        print()
        print("执行过程：")
        for cmd in result["data"]["commands_executed"]:
            print(f"   命令: {cmd['command']}")
            print(f"      状态: {'成功' if cmd['success'] else '失败'}")
            if cmd['stdout']:
                print(f"      输出: {cmd['stdout']}")
            print()
        print("配置变更：")
        for change in result["data"]["config_changes"]:
            print(f"   {change}")
        print()
        print("验证结果：")
        print(f"   {result['data']['verification'][0]}")
    else:
        print("配置失败")
        print(f"错误信息: {result['error']}")
        if 'error_detail' in result['data']:
            print(f"详细信息: {result['data']['error_detail']}")
    print()
    print("---")
    log(json.dumps(result, ensure_ascii=False, indent=2))
