import json

with open('.understand-anything/intermediate/assembled-graph.json', 'r', encoding='utf-8') as f:
    graph = json.load(f)

# Remove the spurious ScanningSkeleton class node from DataFlowEffect.tsx
bad_node_id = 'class:frontend/src/components/animations/DataFlowEffect.tsx:ScanningSkeleton'
before = len(graph['nodes'])
graph['nodes'] = [n for n in graph['nodes'] if n.get('id') != bad_node_id]
print(f'Removed node: {bad_node_id}  (nodes: {before} -> {len(graph["nodes"])})')

# Remove edges referencing it
before_edges = len(graph['edges'])
graph['edges'] = [e for e in graph['edges'] if e.get('source') != bad_node_id and e.get('target') != bad_node_id]
print(f'Removed edges referencing it  (edges: {before_edges} -> {len(graph["edges"])})')

# Remove duplicate class nodes from barrel index files
barrel_files = ['frontend/src/components/landing/index.ts', 'frontend/src/components/hero/index.ts']
barrel_node_ids = set()
for n in graph['nodes']:
    if n.get('type') in ('class', 'function') and n.get('filePath') in barrel_files:
        barrel_node_ids.add(n['id'])

before = len(graph['nodes'])
graph['nodes'] = [n for n in graph['nodes'] if n['id'] not in barrel_node_ids]
print(f'Removed {before - len(graph["nodes"])} barrel-export duplicate nodes')

# Remove edges referencing removed barrel nodes
graph['edges'] = [e for e in graph['edges'] if e.get('source') not in barrel_node_ids and e.get('target') not in barrel_node_ids]
print(f'Edges after barrel cleanup: {len(graph["edges"])}')

# Fix layer assignments - move data artifacts, test reports, log files
for layer in graph.get('layers', []):
    lid = layer.get('id')
    if lid == 'layer:backend-config':
        to_remove = ['file:backend/test_sample.csv', 'file:backend/unbiased_ai.db']
        before = len(layer.get('nodeIds', []))
        layer['nodeIds'] = [n for n in layer.get('nodeIds', []) if n not in to_remove]
        print(f'Layer backend-config: removed {before - len(layer["nodeIds"])} data artifact nodes')
    elif lid == 'layer:frontend-app':
        to_remove = ['file:frontend/playwright-report/index.html']
        before = len(layer.get('nodeIds', []))
        layer['nodeIds'] = [n for n in layer.get('nodeIds', []) if n not in to_remove]
        print(f'Layer frontend-app: removed {before - len(layer["nodeIds"])} test artifact nodes')
    elif lid == 'layer:backend-utils':
        to_remove = ['file:backend/uvicorn_err.txt', 'file:backend/uvicorn_out.txt']
        before = len(layer.get('nodeIds', []))
        layer['nodeIds'] = [n for n in layer.get('nodeIds', []) if n not in to_remove]
        print(f'Layer backend-utils: removed {before - len(layer["nodeIds"])} log file nodes')

# Expand tour step 7 to include all 9 workflow steps
for step in graph.get('tour', []):
    if step.get('order') == 7:
        current = set(step.get('nodeIds', []))
        all_workflow = [
            'file:frontend/src/pages/workflow/Step1Upload.tsx',
            'file:frontend/src/pages/workflow/Step2Config.tsx',
            'file:frontend/src/pages/workflow/Step3DataAudit.tsx',
            'file:frontend/src/pages/workflow/Step4ModelBias.tsx',
            'file:frontend/src/pages/workflow/Step5Explanations.tsx',
            'file:frontend/src/pages/workflow/Step6Counterfactual.tsx',
            'file:frontend/src/pages/workflow/Step7StressTest.tsx',
            'file:frontend/src/pages/workflow/Step8Sandbox.tsx',
            'file:frontend/src/pages/workflow/Step9Monitoring.tsx'
        ]
        step['nodeIds'] = list(current.union(all_workflow))
        step['description'] = 'Explore the complete 9-step fairness analysis pipeline: upload data, configure sensitive attributes, audit data, analyze model bias, view SHAP explanations, test counterfactuals, run stress tests, explore sandbox fixes, and monitor for drift.'
        print(f'Tour step 7 expanded: {len(step["nodeIds"])} nodes (was {len(current)})')

with open('.understand-anything/intermediate/assembled-graph.json', 'w', encoding='utf-8') as f:
    json.dump(graph, f, indent=2, ensure_ascii=False)

print('All fixes applied successfully.')
