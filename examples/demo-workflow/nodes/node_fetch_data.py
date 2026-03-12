# 获取数据节点 - 生成模拟数据
# 输出: { users: list, score: int }

import random

def main(input):
    # 生成模拟用户数据
    users = []
    for i in range(5):
        users.append({
            "id": i + 1,
            "name": f"用户{i + 1}",
            "age": random.randint(20, 50),
            "score": random.randint(50, 100)
        })
    
    # 计算平均分
    avg_score = sum(u["score"] for u in users) // len(users)
    
    print(f"生成了 {len(users)} 个用户数据")
    print(f"平均分数: {avg_score}")
    
    return {
        "users": users,
        "avg_score": avg_score,
        "count": len(users)
    }