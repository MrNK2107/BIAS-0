import json

with open('.understand-anything/intermediate/assembled-graph.json', 'r', encoding='utf-8') as f:
    graph = json.load(f)

# Show all layers
for layer in graph.get('layers', []):
    print(f"  {layer['id']}: name={layer['name']}, nodes={len(layer.get('nodeIds', []))}")

# Find the data layer or create one
data_layer = None
for layer in graph.get('layers', []):
    if 'data' in layer['id']:
        data_layer = layer
        break

if not data_layer:
    # Create a data-assets layer
    graph['layers'].append({
        "id": "layer:data-assets",
        "name": "Data Assets",
        "description": "Dataset files, test data, and database artifacts used for analysis",
        "nodeIds": []
    })
    data_layer = graph['layers'][-1]
    print(f"\nCreated layer: data-assets")

# Add unbiased_ai.db to data layer
if 'file:backend/unbiased_ai.db' not in data_layer['nodeIds']:
    data_layer['nodeIds'].append('file:backend/unbiased_ai.db')
    print("Added unbiased_ai.db to data-assets")

# Also add test_sample.csv and demo datasets if not there
for node_id in ['file:backend/test_sample.csv', 'table:data/demo_hiring.csv', 'table:data/demo_loan.csv']:
    present = any(node_id in layer.get('nodeIds', []) for layer in graph['layers'])
    if not present:
        data_layer['nodeIds'].append(node_id)
        print(f"Added {node_id} to data-assets")

# Find frontend-test layer or use existing
test_layer = None
for layer in graph.get('layers', []):
    if 'test' in layer['id'] or 'frontend-app' == layer['id']:
        test_layer = layer
        break

if test_layer and test_layer['id'] == 'frontend-app':
    test_layer['nodeIds'].append('file:frontend/playwright-report/index.html')
    print("Added playwright-report to frontend-app")

with open('.understand-anything/intermediate/assembled-graph.json', 'w', encoding='utf-8') as f:
    json.dump(graph, f, indent=2, ensure_ascii=False)

print("\nFixes applied.")
