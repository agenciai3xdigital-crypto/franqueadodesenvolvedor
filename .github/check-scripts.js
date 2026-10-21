#!/usr/bin/env node
// Checagem de sintaxe: extrai cada <script> inline (sem src) de todos os *.html,
// grava em arquivo temporário e roda `node --check`; também checa os .js avulsos.
// Sai com código 1 se qualquer bloco falhar, imprimindo arquivo e índice do bloco.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const IGNORAR_DIRS = new Set(['node_modules', '.git', '.github']);
// Blocos pré-existentes a excluir explicitamente: "arquivo.html#indice"
const EXCLUIR = new Set([]);

function listar(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (!IGNORAR_DIRS.has(ent.name)) listar(path.join(dir, ent.name), out);
    } else if (/\.(html?|js)$/i.test(ent.name)) {
      out.push(path.join(dir, ent.name));
    }
  }
  return out;
}

function checar(codigo, rotulo) {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chk-')), 'bloco.js');
  fs.writeFileSync(tmp, codigo);
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  if (r.status !== 0) {
    console.error('ERRO em ' + rotulo + '\n' + (r.stderr || r.stdout).replace(tmp, rotulo));
    return false;
  }
  return true;
}

const RE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
let erros = 0, blocos = 0, arquivos = 0;

for (const arq of listar(RAIZ, []).sort()) {
  const rel = path.relative(RAIZ, arq);
  if (/\.js$/i.test(arq)) {
    arquivos++;
    if (!checar(fs.readFileSync(arq, 'utf8'), rel)) erros++;
    continue;
  }
  const html = fs.readFileSync(arq, 'utf8');
  let m, idx = 0;
  while ((m = RE_SCRIPT.exec(html)) !== null) {
    const attrs = m[1], corpo = m[2];
    const i = idx++;
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const tipo = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1];
    if (tipo && /^(application\/(ld\+)?json|importmap|text\/template|text\/x-template)$/i.test(tipo)) continue;
    if (EXCLUIR.has(rel + '#' + i)) { console.log('ignorado (excluído): ' + rel + '#' + i); continue; }
    if (!corpo.trim()) continue;
    const rotulo = rel + ' <script> #' + i;
    blocos++;
    if (!checar(corpo, rotulo)) erros++;
  }
}

console.log('Blocos inline checados: ' + blocos + ' · arquivos .js: ' + arquivos + ' · erros: ' + erros);
process.exit(erros ? 1 : 0);
