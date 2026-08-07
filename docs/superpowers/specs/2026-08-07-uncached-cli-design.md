# Uncached CLI MVP

## Objetivo

Criar `uncached-cli`, pacote npm gratuito e independente para localizar diretórios `node_modules` em um workspace e movê-los para a Lixeira/Trash do sistema após uma confirmação única.

## Escopo

- Repositório independente: `uncached-cli`.
- Pacote npm: `uncached-cli`.
- Executável: `uncached`.
- Node.js `>=22`.
- Comando: `npx uncached scan [workspace]`.
- Workspace padrão: diretório atual.
- Nenhum acoplamento com Astro ou frontend.

## Scan

Percorrer workspace recursivamente e detectar somente diretórios chamados `node_modules`. Um target só é válido quando o diretório pai contém `package.json`.

Ignorar `node_modules` dentro de outro `node_modules`, links simbólicos e qualquer caminho fora do workspace. Exibir caminho, tamanho individual em bytes e total.

## Limpeza

Após o scan, exibir targets e solicitar uma confirmação única. `y` move todos para a Lixeira/Trash; qualquer outra resposta cancela.

Usar biblioteca pequena e multiplataforma para Trash. Nunca usar remoção permanente. Não alterar `package.json`, lockfiles ou arquivos fora dos targets confirmados. Falhas individuais devem ser reportadas sem interromper os demais targets.

## Interface e saída

```text
npx uncached scan .
npx uncached scan
```

Saída humana em terminal, sem JSON, configuração, filtros ou seleção individual no MVP.

Código `0` indica scan concluído, limpeza concluída ou cancelamento. Código diferente de `0` indica argumento inválido, workspace inexistente ou falha crítica de scan.

## Estrutura prevista

- `package.json`: metadados, campo `bin` e scripts.
- `src/cli.mjs`: argumentos e fluxo do comando.
- `src/scan.mjs`: traversal, validação e medição.
- `src/trash.mjs`: adaptação da biblioteca de Trash.
- `test/`: testes do scanner e confirmação.

O campo `files` deve limitar o tarball aos arquivos necessários. `node_modules`, artefatos e arquivos locais não podem ser publicados.

## Verificação e publicação

Executar testes, `npm pack --dry-run`, instalação do tarball em workspace temporário, scan cancelado e movimentação de target descartável. Usar `npm publish --dry-run` antes da publicação real.

A publicação real exige autenticação npm, nome disponível e versão incrementada.
