def main(input):
    alert=input.get("alert",{})
    return {"alert":{**alert,"decision":{"level":"P1","action":"立即电话+短信通知值班经理"}}}