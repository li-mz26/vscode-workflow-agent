def main(inputs, context):
    """
    数据处理函数
    接收输入数据，计算总和、平均值，并分类
    """
    items = inputs.get('items', [])
    threshold = inputs.get('threshold', 100)
    
    # 计算统计信息
    if not items:
        return {
            "total": 0,
            "average": 0,
            "count": 0,
            "category": "empty",
            "threshold": threshold
        }
    
    total = sum(items)
    average = total / len(items)
    count = len(items)
    
    # 根据阈值分类
    category = "high" if total > threshold else "low"
    
    return {
        "total": total,
        "average": round(average, 2),
        "count": count,
        "category": category,
        "threshold": threshold,
        "items": items
    }
