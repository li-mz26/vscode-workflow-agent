# 高分处理节点 - 分数>=80的处理
# 输入: { users, avg_score, count }

def main(input):
    users = input.get("users", [])
    avg_score = input.get("avg_score", 0)
    
    # 高分用户额外奖励
    for user in users:
        if user["score"] >= 90:
            user["bonus"] = 100
            user["level"] = "S"
        elif user["score"] >= 80:
            user["bonus"] = 50
            user["level"] = "A"
        else:
            user["bonus"] = 0
            user["level"] = "B"
    
    print(f"高分处理完成，平均分: {avg_score}")
    
    return {
        "users": users,
        "avg_score": avg_score,
        "category": "high",
        "message": "团队表现优秀！"
    }