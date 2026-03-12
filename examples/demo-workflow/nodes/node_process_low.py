# 低分处理节点 - 分数<80的处理
# 输入: { users, avg_score, count }

def main(input):
    users = input.get("users", [])
    avg_score = input.get("avg_score", 0)
    
    # 低分用户需要改进
    for user in users:
        if user["score"] < 60:
            user["need_improve"] = True
            user["suggestion"] = "需要加强学习"
        elif user["score"] < 80:
            user["need_improve"] = False
            user["suggestion"] = "继续保持"
        else:
            user["need_improve"] = False
            user["suggestion"] = "表现良好"
    
    print(f"低分处理完成，平均分: {avg_score}")
    
    return {
        "users": users,
        "avg_score": avg_score,
        "category": "low",
        "message": "团队需要改进！"
    }