import subprocess
import time
import urllib.request
import urllib.parse
import json
import os

os.chdir("c:/Users/nanda/Desktop/solution_challenge/unbiased-ai/backend")
server = subprocess.Popen(["c:/Users/nanda/Desktop/solution_challenge/.venv/Scripts/python.exe", "-m", "uvicorn", "main:app"])
time.sleep(3)

base = "http://127.0.0.1:8000"

def post_multipart(url, file_text, data):
    import uuid
    boundary = uuid.uuid4().hex
    body = []
    
    for k, v in data.items():
        body.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n")
    
    body.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"demo.csv\"\r\nContent-Type: text/csv\r\n\r\n{file_text}\r\n")
    body.append(f"--{boundary}--\r\n")
    
    body_data = "".join(body).encode("utf-8")
    req = urllib.request.Request(url, data=body_data, headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    try:
        resp = urllib.request.urlopen(req)
        return resp.getcode(), resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")

def post_json(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers={'Content-Type': 'application/json'})
    try:
        resp = urllib.request.urlopen(req)
        return resp.getcode(), resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8")

try:
    print("GET /demo/loan")
    resp = urllib.request.urlopen(f"{base}/demo/loan")
    print(resp.getcode())
    csv_text = json.loads(resp.read())["csv_text"]

    data = {"project_id": "1", "sensitive_cols": "gender,caste", "target_col": "approved"}
    
    print("POST /audit/data")
    code, text = post_multipart(f"{base}/audit/data", csv_text, data)
    print(code, text[:200])
    audit_res = json.loads(text)

    print("POST /audit/proxy")
    code, text = post_multipart(f"{base}/audit/proxy", csv_text, {"sensitive_cols": "gender,caste"})
    print(code, text[:200])
    proxy_res = json.loads(text)

    print("POST /bias/model")
    code, text = post_multipart(f"{base}/bias/model", csv_text, data)
    print(code, text[:200])
    bias_res = json.loads(text)

    print("POST /bias/explain")
    code, text = post_multipart(f"{base}/bias/explain", csv_text, data)
    print(code, text[:200])

    print("POST /bias/counterfactual")
    code, text = post_multipart(f"{base}/bias/counterfactual", csv_text, data)
    print(code, text[:200])

    print("POST /bias/stress")
    code, text = post_multipart(f"{base}/bias/stress", csv_text, data)
    print(code, text[:200])

    print("POST /fixes/recommend")
    req_body = {
        "audit_result": audit_res,
        "proxy_result": proxy_res,
        "bias_result": bias_res
    }
    code, text = post_json(f"{base}/fixes/recommend", req_body)
    print(code, text[:200])
    recommendations = json.loads(text)

    print("POST /fixes/sandbox")
    req_body2 = {
        "df": "should be multiparts?", # Wait, fixes/sandbox might expect multipart or JSON?
    }

except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    server.terminate()
