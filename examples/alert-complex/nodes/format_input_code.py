def main(input):
    alert={"alert_id":input.get("alert_id","A-UNKNOWN"),"source":input.get("source","monitoring"),"severity":str(input.get("severity","medium")).lower(),"title":input.get("title","未命名告警"),"timestamp":input.get("timestamp","2026-01-01T00:00:00Z")}
    return {"alert":alert}