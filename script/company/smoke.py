#!/usr/bin/env python3
"""Exercise a compiled company CLI against loopback model and audit servers."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

root = Path(__file__).resolve().parents[2]
major = 'v2' if (root / 'packages/cli/package.json').exists() and json.loads((root / 'package.json').read_text()).get('version', '').startswith('2.') else 'v1'
audit = []
provider_calls = []
fail_audit = False

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.path == '/opencode/compliance':
            if not fail_audit:
                audit.append(json.loads(data['command']))
            self.send_response(503 if fail_audit else 204)
            self.end_headers()
            return
        provider_calls.append(data)
        names = [item['function']['name'] for item in data.get('tools', [])]
        prompt = json.dumps(data.get('messages', []))
        name = 'shell' if 'shell' in names else 'bash'
        call = name in names and 'COMPANY_TOOL' in prompt and not any(item.get('role') == 'tool' for item in data.get('messages', []))
        content = {'role': 'assistant', 'content': 'COMPANY_SMOKE_OK'}
        finish = 'stop'
        if call:
            command = 'forbidden-company-command' if 'COMPANY_TOOL_DENY' in prompt else 'echo COMPANY_TOOL_OK'
            content = {'role': 'assistant', 'tool_calls': [{'index': 0, 'id': 'call-company-smoke', 'type': 'function', 'function': {'name': name, 'arguments': json.dumps({'command': command, 'description': 'Company policy smoke test'})}}]}
            finish = 'tool_calls'
        self.send_response(200)
        if not data.get('stream'):
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'id': 'smoke', 'object': 'chat.completion', 'model': 'trial', 'choices': [{'index': 0, 'message': content, 'finish_reason': finish}]}).encode())
            return
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        for delta, reason in [(content, None), ({}, finish)]:
            self.wfile.write(('data: ' + json.dumps({'id': 'smoke', 'object': 'chat.completion.chunk', 'created': 1, 'model': 'trial', 'choices': [{'index': 0, 'delta': delta, 'finish_reason': reason}]}) + '\n\n').encode())
        self.wfile.write(b'data: [DONE]\n\n')
        self.wfile.flush()

    def log_message(self, *args):
        pass

with ThreadingHTTPServer(('127.0.0.1', 18788), Handler) as collector, ThreadingHTTPServer(('127.0.0.1', 0), Handler) as provider:
    for server in (collector, provider):
        threading.Thread(target=server.serve_forever, daemon=True).start()
    with tempfile.TemporaryDirectory(prefix='opencode-company-smoke-') as directory:
        work = Path(directory)
        config = work / 'profile/config/opencode'
        config.mkdir(parents=True)
        settings = {'baseURL': f'http://127.0.0.1:{provider.server_port}/v1', 'apiKey': 'local-smoke'}
        model = {'name': 'Trial', 'limit': {'context': 32000, 'output': 2000}}
        info = {'name': 'Loopback trial', 'models': {'trial': model}}
        if major == 'v1':
            info.update(npm='@ai-sdk/openai-compatible', options=settings)
            document = {'model': 'trial/trial', 'provider': {'trial': info}, 'autoupdate': False}
        else:
            info.update(package='@opencode/ai/providers/openai-compatible', settings=settings)
            document = {'model': 'trial/trial', 'providers': {'trial': info}, 'update': 'disable'}
        (config / 'opencode.json').write_text(json.dumps(document))
        env = dict(os.environ, OPENCODE_COMPANY_HOME=str(work / 'profile'))
        command = [str(root / 'script/company/run.sh'), 'run'] + (['--standalone'] if major == 'v2' else []) + ['-m', 'trial/trial']
        for prompt in ('COMPANY_TEXT', 'COMPANY_TOOL_ALLOW', 'COMPANY_TOOL_DENY'):
            result = subprocess.run(command + [prompt], cwd=work, env=env, capture_output=True, text=True, timeout=60)
            output = result.stdout + result.stderr
            assert result.returncode == 0 and 'COMPANY_SMOKE_OK' in output, output
            if prompt == 'COMPANY_TOOL_ALLOW':
                assert 'COMPANY_TOOL_OK' in output, output
            if prompt == 'COMPANY_TOOL_DENY':
                assert 'Permission denied' in output or 'prevents you' in output, output
            print(f'PASS {major}: {prompt}', flush=True)
        types = {item['type'] for item in audit}
        assert {'user.message', 'assistant.message', 'tool.call.request', 'tool.call.output'} <= types, types
        assert all('prompt' in item['data'] and 'response' in item['data'] for item in audit if item['type'] == 'assistant.message')
        print(f'PASS {major}: audit prompt/response and tool records', flush=True)
        fail_audit = True
        before = len(provider_calls)
        result = subprocess.run(command + ['COMPANY_AUDIT_UNAVAILABLE'], cwd=work, env=env, capture_output=True, text=True, timeout=60)
        output = result.stdout + result.stderr
        assert 'COMPANY_SMOKE_OK' not in output, output
        assert len(provider_calls) == before, 'Provider was called while audit server was unavailable'
        print(f'PASS {major}: unavailable audit server blocks provider execution', flush=True)
    collector.shutdown()
    provider.shutdown()
