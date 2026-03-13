def main(input):
    alert=input.get("alert",{})
    return {"alert":{**alert,"decision":{"level":"P2","action":"创建工单并通知值班群"}}}