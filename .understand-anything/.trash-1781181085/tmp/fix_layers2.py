import json

with open('.understand-anything/intermediate/assembled-graph.json', 'r', encoding='utf-8') as f:
    graph = json.load(f)

# Fix 1: layer:data references 'file:backend/test_sample.csv' but node is 'table:backend/test_sample.csv'
for layer in graph.get('layers', []):
    if layer['id'] == 'layer:data':
        if 'file:backend/test_sample.csv' in layer['nodeIds']:
            layer['nodeIds'].remove('file:backend/test_sample.csv')
            layer['nodeIds'].append('table:backend/test_sample.csv')
            print("Fixed layer:data - corrected test_sample.csv reference")

# Fix 2: Add playwright-report/index.html to layer:test
for layer in graph.get('layers', []):
    if layer['id'] == 'layer:test':
        if 'file:frontend/playwright-report/index.html' not in layer['nodeIds']:
            layer['nodeIds'].append('file:frontend/playwright-report/index.html')
            print("Added playwright-report to layer:test")

# Also clean up my created data-assets layer - merge into existing layer:data
for layer in graph.get('layers', []):
    if layer['id'] == 'layer:data-assets':
        # Merge into layer:data
        for existing in graph['layers']:
            if existing['id'] == 'layer:data':
                for nid in layer['nodeIds']:
                    if nid not in existing['nodeIds']:
                        existing['nodeIds'].append(nid)
                print(f"Merged {len(layer['nodeIds'])} nodes from data-assets into layer:data")
                break
        # Remove data-assets
        graph['layers'] = [l for l in graph['layers'] if l['id'] != 'layer:data-assets']
        print("Removed temporary layer:data-assets")
        break

with open('.understand-anything/intermediate/assembled-graph.json', 'w', encoding='utf-8') as f:
    json.dump(graph, f, indent=2, ensure_ascii=False)

print("Second-pass fixes applied.")
