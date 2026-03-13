def main(input):
    alert=input.get("alert",{})
    return {"alert":{**alert,"decision":{"level":"P3","action":"记录日志并加入观察列表"}}}