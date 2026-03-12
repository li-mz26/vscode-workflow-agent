# 数据处理节点 - 生成示例数据并处理
# 输入: input (任意类型)
# 输出: { result: object }

import time

def main(input):
    print(f"Code node received input: {input}")
    
    # 生成示例数据
    data = {
        "timestamp": int(time.time() * 1000),
        "inputValue": input,
        "processed": True,
        "items": [
            {"id": 1, "name": "Item 1", "value": 100},
            {"id": 2, "name": "Item 2", "value": 200},
            {"id": 3, "name": "Item 3", "value": 300}
        ],
        "total": 600
    }
    
    print(f"Code node output: {data}")
    return data