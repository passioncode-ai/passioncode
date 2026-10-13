'use strict';
/**
 * One proving call against a stdio MCP server, the way a coding agent starts it: the registered
 * command, arguments and environment; `initialize`, `notifications/initialized`, `tools/list`,
 * then one read-only tool. The child is the probe's own process and is stopped when the call
 * returns or the deadline passes. Nothing the server prints is logged; only the outcome is kept.
 */
const { spawn } = require('child_process');

const PROTOCOL = '2025-06-18';

function probe({ command, args = [], env = {}, cwd, tool = null, toolArgs = {}, timeoutMs = 20000, version = '0.0.0' }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ ok: false, stage: 'start', reason: error.message });
      return;
    }
    const result = { ok: false, stage: 'start', server: null, tools: null, reason: null };
    let buffer = '';
    let done = false;
    const pending = new Map();
    let nextId = 1;
    const finish = (patch) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      Object.assign(result, patch);
      // Release every pipe (a wrapper that does not exec, whose own child holds them, must not keep
      // the launcher alive), ask the server to stop, and wait for it — at most 2.5 s, then SIGKILL —
      // so no probe outlives the command as an orphan.
      for (const stream of [child.stdin, child.stdout, child.stderr]) { try { stream.destroy(); } catch (_) { /* gone */ } }
      let settled = false;
      const settle = () => { if (settled) return; settled = true; clearTimeout(hard); try { child.unref(); } catch (_) { /* gone */ } resolve(result); };
      const hard = setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) { /* gone */ } settle(); }, 2500);
      if (child.exitCode !== null || child.signalCode !== null) { settle(); return; }
      child.once('exit', settle);
      try { child.kill('SIGTERM'); } catch (_) { settle(); }
    };
    const timer = setTimeout(() => finish({ ok: false, reason: `no answer to ${result.stage} within ${Math.round(timeoutMs / 1000)} s` }), timeoutMs);
    const send = (method, params) => new Promise((ok) => {
      const id = nextId++;
      pending.set(id, ok);
      try { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); } catch (error) { finish({ ok: false, reason: error.message }); }
    });
    const notify = (method, params) => { try { child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) })}\n`); } catch (_) { /* reported by exit */ } };
    child.on('error', (error) => finish({ ok: false, reason: error.code === 'ENOENT' ? `${command} does not exist` : error.message }));
    child.on('exit', (code, signal) => finish({ ok: false, reason: `the server exited (${signal || `code ${code}`}) during ${result.stage}` }));
    child.stderr.on('data', () => { /* servers log on stderr; never echoed */ });
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch (_) { finish({ ok: false, reason: 'the server wrote something that is not JSON-RPC on stdout' }); return; }
        if (msg.id !== undefined && pending.has(msg.id)) { const ok = pending.get(msg.id); pending.delete(msg.id); ok(msg); }
      }
    });
    (async () => {
      result.stage = 'initialize';
      const init = await send('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'passioncode-doctor', version } });
      if (init.error || !init.result) { finish({ ok: false, reason: `initialize refused: ${(init.error && init.error.message) || 'no result'}` }); return; }
      result.server = init.result.serverInfo ? { name: init.result.serverInfo.name, version: init.result.serverInfo.version } : null;
      notify('notifications/initialized');
      // tool === false: initialize only (a server whose first real call has an effect).
      if (tool === false) { finish({ ok: true, stage: 'initialize' }); return; }
      result.stage = 'tools/list';
      const list = await send('tools/list', {});
      if (list.error || !list.result || !Array.isArray(list.result.tools)) { finish({ ok: false, reason: `tools/list failed: ${(list.error && list.error.message) || 'no tools'}` }); return; }
      result.tools = list.result.tools.length;
      if (!tool) { finish({ ok: true }); return; }
      if (!list.result.tools.some((t) => t.name === tool)) { finish({ ok: false, reason: `the server lists no ${tool} tool` }); return; }
      result.stage = `tools/call ${tool}`;
      const call = await send('tools/call', { name: tool, arguments: toolArgs });
      if (call.error) { finish({ ok: false, reason: `${tool} failed: ${call.error.message}` }); return; }
      if (call.result && call.result.isError) {
        const text = (call.result.content || []).map((c) => c.text || '').join(' ').slice(0, 200);
        finish({ ok: false, reason: `${tool} answered with an error${text ? `: ${text}` : ''}` });
        return;
      }
      finish({ ok: true });
    })().catch((error) => finish({ ok: false, reason: error.message }));
  });
}

module.exports = { probe, PROTOCOL };
