import json

with open('.understand-anything/knowledge-graph.json', 'r') as f:
    g = json.load(f)

layers = [(l['id'], l['name']) for l in g.get('layers', [])]

print("Nodes by type:")
types = {}
for n in g['nodes']:
    t = n.get('type', 'unknown')
    types[t] = types.get(t, 0) + 1
for t, c in sorted(types.items()):
    print(f"  {t}: {c}")

print("Edges by type:")
etypes = {}
for e in g['edges']:
    t = e.get('type', 'unknown')
    etypes[t] = etypes.get(t, 0) + 1
for t, c in sorted(etypes.items()):
    print(f"  {t}: {c}")

print(f"Layers ({len(layers)}):")
for lid, lname in layers:
    print(f"  {lid}: {lname}")

print(f"Tour steps: {len(g.get('tour', []))}")
