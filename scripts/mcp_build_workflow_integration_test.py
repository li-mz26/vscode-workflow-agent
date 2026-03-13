#!/usr/bin/env python3
"""Integration script: start local MCP server, build a complex alert workflow via MCP tools only, then run it.

Usage:
  python scripts/mcp_build_workflow_integration_test.py
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PORT = int(os.environ.get('MCP_TEST_PORT', '8877'))
MCP_URL = f'http://127.0.0.1:{PORT}/mcp'


def rpc(method: str, params=None, req_id=1):
    payload = {'jsonrpc': '2.0', 'id': req_id, 'method': method}
    if params is not None:
        payload['params'] = params

    req = urllib.request.Request(
        MCP_URL,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'content-type': 'application/json',
            'mcp-protocol-version': '2024-11-05',
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = json.loads(resp.read().decode('utf-8'))
    if 'error' in body:
        raise RuntimeError(body['error'])
    return body['result']


def call_tool(name: str, arguments: dict, req_id=1):
    result = rpc('tools/call', {'name': name, 'arguments': arguments}, req_id=req_id)
    return json.loads(result['content'][0]['text'])


def wait_server_ready(timeout_s=10):
    start = time.time()
    while time.time() - start < timeout_s:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=1) as r:
                if r.status == 200:
                    return
        except Exception:
            time.sleep(0.2)
    raise TimeoutError('MCP server not ready in time')


def main() -> int:
    subprocess.run(['npm', 'run', 'compile', '--silent'], cwd=REPO, check=True)

    with tempfile.TemporaryDirectory(prefix='workflow-mcp-it-') as tmpdir:
        workspace = Path(tmpdir)
        workflow_dir = workspace / 'alert-complex'
        workflow_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy(REPO / 'examples' / 'demo-workflow' / 'demo-workflow.workflow.json', workflow_dir)
        (workflow_dir / 'nodes').mkdir(parents=True, exist_ok=True)

        env = os.environ.copy()
        env.update(
            {
                'WORKFLOW_MCP_HOST': '127.0.0.1',
                'WORKFLOW_MCP_PORT': str(PORT),
                'WORKFLOW_MCP_TRANSPORT': 'streamable-http',
                'WORKFLOW_MCP_CWD': str(workspace),
            }
        )

        proc = subprocess.Popen(
            ['node', '-e', "require('./out/mcp/server.js').runMCPServer()"],
            cwd=REPO,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )

        try:
            wait_server_ready()
            wf = str(workflow_dir)

            workflow = call_tool('workflow_get', {'path': wf}, 1)
            for node in list(workflow['workflow']['nodes']):
                call_tool('node_remove', {'path': wf, 'nodeId': node['id']}, 2)

            call_tool('node_add', {'path': wf, 'nodeId': 'start', 'nodeType': 'start', 'name': '开始', 'x': 20, 'y': 120}, 3)
            call_tool('node_add', {'path': wf, 'nodeId': 'end', 'nodeType': 'end', 'name': '结束', 'x': 1420, 'y': 120}, 4)

            nodes = [
                ('format_input', 'code', '告警格式化', 220, 120),
                ('enrich_alert', 'code', '补全告警信息', 420, 120),
                ('query_context', 'code', '查询关联信息', 620, 120),
                ('risk_switch', 'switch', '风险分流', 820, 120),
                ('high_process', 'code', '高风险处理', 1020, 30),
                ('medium_process', 'code', '中风险处理', 1020, 120),
                ('low_process', 'code', '低风险处理', 1020, 210),
                ('final_output', 'code', '输出格式化', 1220, 120),
            ]
            for i, (nid, nt, name, x, y) in enumerate(nodes, 10):
                call_tool('node_add', {'path': wf, 'nodeId': nid, 'nodeType': nt, 'name': name, 'x': x, 'y': y}, i)

            for nid in ['format_input', 'enrich_alert', 'query_context', 'high_process', 'medium_process', 'low_process', 'final_output']:
                call_tool('node_config_set_value', {'path': wf, 'nodeId': nid, 'key': 'language', 'value': 'python'}, 40)

            call_tool('node_config_set_code', {'path': wf, 'nodeId': 'format_input', 'code': 'def main(input):\n    alert={"alert_id":input.get("alert_id","A-UNKNOWN"),"source":input.get("source","monitoring"),"severity":str(input.get("severity","medium")).lower(),"title":input.get("title","未命名告警"),"timestamp":input.get("timestamp","2026-01-01T00:00:00Z")}\n    return {"alert":alert}'}, 41)
            call_tool('node_config_set_code', {'path': wf, 'nodeId': 'enrich_alert', 'code': 'def main(input):\n    alert=dict(input.get("alert",{}))\n    severity_map={"critical":95,"high":85,"medium":60,"low":30}\n    alert["severity_score"]=severity_map.get(alert.get("severity","medium"),50)\n    alert["owner"]=input.get("owner","oncall-default")\n    return {"alert":alert}'}, 42)
            call_tool('node_config_set_code', {'path': wf, 'nodeId': 'query_context', 'code': 'def main(input):\n    alert=input.get("alert",{})\n    cmdb={"monitoring":{"service":"payment-core","region":"cn-north-1"},"apm":{"service":"trade-gateway","region":"cn-east-3"}}\n    ctx=cmdb.get(alert.get("source","monitoring"),{"service":"unknown","region":"unknown"})\n    return {"alert":{**alert,"context":ctx}}'}, 43)

            call_tool('node_config_set_value', {'path': wf, 'nodeId': 'risk_switch', 'key': 'branches', 'value': [
                {'id': 'branch_high', 'name': '高风险', 'condition': 'data.alert.severity_score >= 80'},
                {'id': 'branch_medium', 'name': '中风险', 'condition': 'data.alert.severity_score >= 50'},
                {'id': 'branch_low', 'name': '低风险', 'condition': 'true'},
            ]}, 44)
            call_tool('node_config_set_value', {'path': wf, 'nodeId': 'risk_switch', 'key': 'defaultBranch', 'value': 'branch_low'}, 45)
            call_tool('node_config_set_value', {'path': wf, 'nodeId': 'risk_switch', 'key': 'evaluationMode', 'value': 'first-match'}, 46)

            call_tool('node_config_set_code', {'path': wf, 'nodeId': 'high_process', 'code': 'def main(input):\n    alert=input.get("alert",{})\n    return {"alert":{**alert,"decision":{"level":"P1","action":"立即电话+短信通知值班经理"}}}'}, 47)
            call_tool('node_config_set_code', {'path': wf, 'nodeId': 'medium_process', 'code': 'def main(input):\n    alert=input.get("alert",{})\n    return {"alert":{**alert,"decision":{"level":"P2","action":"创建工单并通知值班群"}}}'}, 48)
            call_tool('node_config_set_code', {'path': wf, 'nodeId': 'low_process', 'code': 'def main(input):\n    alert=input.get("alert",{})\n    return {"alert":{**alert,"decision":{"level":"P3","action":"记录日志并加入观察列表"}}}'}, 49)
            call_tool('node_config_set_code', {'path': wf, 'nodeId': 'final_output', 'code': 'def main(input):\n    alert=input.get("alert",{})\n    return {"final_alert":{"alert_id":alert.get("alert_id"),"title":alert.get("title"),"severity":alert.get("severity"),"severity_score":alert.get("severity_score"),"service":alert.get("context",{}).get("service"),"region":alert.get("context",{}).get("region"),"owner":alert.get("owner"),"action_level":alert.get("decision",{}).get("level"),"action":alert.get("decision",{}).get("action")}}'}, 50)

            workflow = call_tool('workflow_get', {'path': wf}, 60)
            for edge in list(workflow['workflow'].get('edges', [])):
                call_tool('edge_remove', {'path': wf, 'edgeId': edge['id']}, 61)

            def add(src, tgt, i, branch=None, eid=None):
                args = {'path': wf, 'sourceNodeId': src, 'targetNodeId': tgt}
                if branch:
                    args['branchId'] = branch
                if eid:
                    args['edgeId'] = eid
                call_tool('edge_add', args, i)

            add('start', 'format_input', 70)
            add('format_input', 'enrich_alert', 71)
            add('enrich_alert', 'query_context', 72)
            add('query_context', 'risk_switch', 73)
            add('risk_switch', 'high_process', 74, branch='branch_high', eid='e_branch_high')
            add('risk_switch', 'medium_process', 75, branch='branch_medium', eid='e_branch_medium')
            add('risk_switch', 'low_process', 76, branch='branch_low', eid='e_branch_low')
            add('high_process', 'final_output', 77)
            add('medium_process', 'final_output', 78)
            add('low_process', 'final_output', 79)
            add('final_output', 'end', 80)

            run_result = call_tool(
                'workflow_run',
                {
                    'path': wf,
                    'input': {
                        'alert_id': 'ALERT-2026-INT-001',
                        'source': 'apm',
                        'severity': 'medium',
                        'title': '交易延迟升高',
                        'owner': 'bob',
                    },
                },
                90,
            )

            status = run_result['result']['status']
            if status != 'success':
                print(json.dumps(run_result, ensure_ascii=False, indent=2))
                raise RuntimeError(f'workflow_run failed: {status}')

            print('✅ Integration scenario passed. workflow_run status=success')
            return 0
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=3)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f'❌ Integration scenario failed: {exc}', file=sys.stderr)
        raise
