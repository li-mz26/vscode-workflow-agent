# -*- coding: utf-8 -*-
# Node ID: node_code_002
# Type: code
# Name: 获取数据
# Description: 从数据源获取原始数据

import json

def main(ctx):
    """
    从API或数据源获取数据

    参数:
        ctx: 执行上下文
            - ctx.input: 触发时传入的数据
            - ctx.variables: 工作流变量

    返回:
        获取到的数据对象
    """
    # 从变量获取API端点
    api_endpoint = ctx.variables.get('apiEndpoint', 'https://api.example.com/data')

    # 模拟获取数据（实际场景中可以使用 requests 库）
    # 这里返回模拟数据
    result = {
        "source": api_endpoint,
        "timestamp": __import__('datetime').datetime.now().isoformat(),
        "data": {
            "items": [
                {"id": 1, "name": "项目A", "value": 100, "status": "active"},
                {"id": 2, "name": "项目B", "value": 250, "status": "pending"},
                {"id": 3, "name": "项目C", "value": 75, "status": "active"}
            ],
            "total": 3,
            "summary": {
                "total_value": 425,
                "active_count": 2
            }
        }
    }

    return result