import json

with open('.understand-anything/intermediate/assembled-graph.json', 'r', encoding='utf-8') as f:
    graph = json.load(f)

# Remove test_sample.csv from backend-config (keep in data)
for layer in graph.get('layers', []):
    if layer['id'] == 'layer:backend-config':
        if 'table:backend/test_sample.csv' in layer['nodeIds']:
            layer['nodeIds'].remove('table:backend/test_sample.csv')
            print("Removed test_sample.csv from backend-config (duplicate)")
    if layer['id'] == 'layer:data':
        for nid in list(layer.get('nodeIds', [])):
            if nid.startswith('file:backend/'):
                layer['nodeIds'].remove(nid)
                print(f"Removed {nid} from data (not a dataset)")

with open('.understand-anything/intermediate/assembled-graph.json', 'w', encoding='utf-8') as f:
    json.dump(graph, f, indent=2, ensure_ascii=False)
print("Done")
