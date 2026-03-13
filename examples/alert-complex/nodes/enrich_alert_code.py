def main(input):
    alert=dict(input.get("alert",{}))
    severity_map={"critical":95,"high":85,"medium":60,"low":30}
    alert["severity_score"]=severity_map.get(alert.get("severity","medium"),50)
    alert["owner"]=input.get("owner","oncall-default")
    return {"alert":alert}