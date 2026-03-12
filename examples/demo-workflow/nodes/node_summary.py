# 汇总结果节点 - 合并所有处理结果
# 输入: 上游节点的输出

def main(input):
    users = input.get("users", [])
    avg_score = input.get("avg_score", 0)
    category = input.get("category", "unknown")
    message = input.get("message", "")
    
    # 统计信息
    total_bonus = sum(u.get("bonus", 0) for u in users)
    level_counts = {}
    for u in users:
        level = u.get("level", u.get("suggestion", "unknown"))
        level_counts[level] = level_counts.get(level, 0) + 1
    
    # 生成最终报告
    report = {
        "summary": {
            "total_users": len(users),
            "avg_score": avg_score,
            "total_bonus": total_bonus,
            "category": category
        },
        "level_distribution": level_counts,
        "message": message,
        "users": users,
        "status": "success"
    }
    
    print("=" * 50)
    print("工作流执行完成！")
    print(f"用户数: {len(users)}")
    print(f"平均分: {avg_score}")
    print(f"分类: {category}")
    print(f"消息: {message}")
    print("=" * 50)
    
    return report