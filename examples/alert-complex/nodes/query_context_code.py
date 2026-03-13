def main(input):
    alert=input.get("alert",{})
    cmdb={"monitoring":{"service":"payment-core","region":"cn-north-1"},"apm":{"service":"trade-gateway","region":"cn-east-3"}}
    ctx=cmdb.get(alert.get("source","monitoring"),{"service":"unknown","region":"unknown"})
    return {"alert":{**alert,"context":ctx}}