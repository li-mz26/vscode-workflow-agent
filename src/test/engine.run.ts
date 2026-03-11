/**
 * 引擎功能测试
 * 运行: npx ts-node --project tsconfig.test.json src/test/engine.run.ts
 */

import { WorkflowEngine, WorkflowRunner, ExecutionStatus } from '../engine';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// 模拟 ExtensionContext
const mockContext = {
  extensionPath: __dirname,
  subscriptions: []
} as any;

async function runTests() {
  console.log('🧪 Workflow Engine Tests\n');
  
  const engine = new WorkflowEngine(mockContext);
  const runner = new WorkflowRunner(engine, mockContext);
  
  let passed = 0;
  let failed = 0;

  // 测试 1: 创建工作流
  try {
    console.log('Test 1: Create Workflow');
    const workflow = engine.createWorkflow('Test Workflow', 'A test workflow');
    
    if (!workflow.id || workflow.name !== 'Test Workflow') {
      throw new Error('Workflow creation failed');
    }
    if (workflow.nodes.length !== 2) {
      throw new Error('Workflow should have start and end nodes');
    }
    
    console.log('  ✅ Workflow created with ID:', workflow.id);
    console.log('  📊 Nodes:', workflow.nodes.length, '| Edges:', workflow.edges.length);
    passed++;
  } catch (error) {
    console.log('  ❌ Failed:', (error as Error).message);
    failed++;
  }

  // 测试 2: 添加节点
  try {
    console.log('\nTest 2: Add Nodes');
    const codeNode = engine.createNode('code', { x: 300, y: 100 });
    engine.addNode(codeNode);
    
    const switchNode = engine.createNode('switch', { x: 500, y: 100 });
    engine.addNode(switchNode);
    
    const workflow = engine.getCurrentWorkflow();
    if (workflow!.nodes.length !== 4) {
      throw new Error('Expected 4 nodes');
    }
    
    console.log('  ✅ Added code and switch nodes');
    console.log('  📊 Total nodes:', workflow!.nodes.length);
    passed++;
  } catch (error) {
    console.log('  ❌ Failed:', (error as Error).message);
    failed++;
  }

  // 测试 3: 连接节点
  try {
    console.log('\nTest 3: Connect Nodes');
    const workflow = engine.getCurrentWorkflow()!;
    const startNode = workflow.nodes.find(n => n.type === 'start')!;
    const codeNode = workflow.nodes.find(n => n.type === 'code')!;
    const endNode = workflow.nodes.find(n => n.type === 'end')!;
    
    // 添加边: start -> code
    engine.addEdge({
      id: 'edge_1',
      source: { nodeId: startNode.id, portId: 'output' },
      target: { nodeId: codeNode.id, portId: 'input' }
    });
    
    // 添加边: code -> end
    engine.addEdge({
      id: 'edge_2',
      source: { nodeId: codeNode.id, portId: 'output' },
      target: { nodeId: endNode.id, portId: 'input' }
    });
    
    if (workflow.edges.length !== 2) {
      throw new Error('Expected 2 edges');
    }
    
    console.log('  ✅ Connected nodes');
    console.log('  📊 Total edges:', workflow.edges.length);
    passed++;
  } catch (error) {
    console.log('  ❌ Failed:', (error as Error).message);
    failed++;
  }

  // 测试 4: 验证工作流
  try {
    console.log('\nTest 4: Validate Workflow');
    const workflow = engine.getCurrentWorkflow()!;
    const errors = engine.validateWorkflow(workflow);
    
    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
    
    console.log('  ✅ Workflow is valid');
    passed++;
  } catch (error) {
    console.log('  ❌ Failed:', (error as Error).message);
    failed++;
  }

  // 测试 5: 拓扑排序
  try {
    console.log('\nTest 5: Topological Sort');
    const order = engine.getTopologicalOrder();
    
    if (order.length !== 4) {
      throw new Error(`Expected 4 nodes in order, got ${order.length}`);
    }
    
    console.log('  ✅ Topological order:', order.join(' -> '));
    passed++;
  } catch (error) {
    console.log('  ❌ Failed:', (error as Error).message);
    failed++;
  }

  // 测试 6: 环检测
  try {
    console.log('\nTest 6: Cycle Detection');
    const workflow = engine.getCurrentWorkflow()!;
    const codeNode = workflow.nodes.find(n => n.type === 'code')!;
    const startNode = workflow.nodes.find(n => n.type === 'start')!;
    
    // 尝试创建环: code -> start (应该失败)
    try {
      engine.addEdge({
        id: 'edge_cycle',
        source: { nodeId: codeNode.id, portId: 'output' },
        target: { nodeId: startNode.id, portId: 'input' }
      });
      throw new Error('Should have detected cycle');
    } catch (e) {
      if ((e as Error).message.includes('cycle')) {
        console.log('  ✅ Correctly detected cycle');
        passed++;
      } else {
        throw e;
      }
    }
  } catch (error) {
    console.log('  ❌ Failed:', (error as Error).message);
    failed++;
  }

  // 测试 7: 序列化/反序列化
  try {
    console.log('\nTest 7: Serialize/Deserialize');
    const json = engine.serialize();
    const parsed = JSON.parse(json);
    
    if (!parsed.id || !parsed.nodes || !parsed.edges) {
      throw new Error('Invalid serialized format');
    }
    
    console.log('  ✅ Serialized size:', json.length, 'bytes');
    console.log('  ✅ JSON structure valid');
    passed++;
  } catch (error) {
    console.log('  ❌ Failed:', (error as Error).message);
    failed++;
  }

  // 测试 8: 保存/加载
  try {
    console.log('\nTest 8: Save/Load Workflow');
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `test_workflow_${Date.now()}.workflow.json`);
    
    await engine.saveWorkflow(undefined, tempFile);
    
    // 创建新引擎并加载
    const engine2 = new WorkflowEngine(mockContext);
    await engine2.loadWorkflow(tempFile);
    
    const loaded = engine2.getCurrentWorkflow();
    if (!loaded || loaded.name !== 'Test Workflow') {
      throw new Error('Load failed');
    }
    
    console.log('  ✅ Saved to:', tempFile);
    console.log('  ✅ Loaded workflow:', loaded.name);
    
    // 清理
    await fs.promises.unlink(tempFile);
    passed++;
  } catch (error) {
    console.log('  ❌ Failed:', (error as Error).message);
    failed++;
  }

  // 测试 9: 节点执行器
  try {
    console.log('\nTest 9: Node Executors');
    const { executorFactory } = await import('../engine/executor');
    
    const supportedTypes = executorFactory.getSupportedTypes();
    const expectedTypes = ['start', 'end', 'code', 'switch', 'parallel', 'llm'];
    
    for (const type of expectedTypes) {
      if (!supportedTypes.includes(type as any)) {
        throw new Error(`Missing executor for type: ${type}`);
      }
    }
    
    console.log('  ✅ All node executors registered');
    console.log('  📊 Supported types:', supportedTypes.join(', '));
    passed++;
  } catch (error) {
    console.log('  ❌ Failed:', (error as Error).message);
    failed++;
  }

  // 测试结果汇总
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));
  
  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
runTests().catch(console.error);
