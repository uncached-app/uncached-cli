# Shared Rust Core and Multiplatform CLI

## Objetivo

Substituir a implementação JavaScript provisória do CLI por um binário Rust que compartilha o mesmo core do desktop Uncached. O MVP gratuito suporta Windows, macOS e Linux e habilita somente o scanner `node_modules`.

## Repositórios

- Todos os repositórios permanecem privados durante desenvolvimento e lançamento inicial.
- `uncached`: aplicação desktop Tauri e origem do crate compartilhado.
- `uncached-cli`: launcher npm, crates de empacotamento e testes do CLI.
- Futuros módulos Pro podem viver em repositórios privados separados.

O core será extraído do atual `src-tauri/src` para um crate `uncached-core` no repositório desktop. O desktop usará esse crate por dependência local; o CLI usará a mesma versão por dependência Git/tagueada. O core não dependerá de Tauri, React, npm, rede ou serviços de pagamento.

## Limite do core

`uncached-core` concentra:

- traits e modelos de scanners;
- `NodeModulesScanner`;
- traversal e poda de subárvores;
- cálculo de tamanho;
- canonicalização e validação de paths;
- proteção contra symlinks, raízes e escape da workspace;
- `TrashCleaner` multiplataforma;
- erros e relatórios serializáveis.

Orquestração Tauri, eventos IPC, registro de sessões e estado visual permanecem no desktop adapter. O CLI terá adapter próprio para argumentos, saída terminal e confirmação única.

## Configuração gratuita

Core recebe registro explícito de providers. Build gratuito registra apenas `NodeModulesScanner`:

```text
FreeProviders -> NodeModulesScanner
```

O CLI não executará scanners adicionais mesmo que o core contenha interfaces para eles. O comportamento atual do desktop para outros scanners será migrado gradualmente, sem expor esses scanners no CLI gratuito.

## Extensão Pro

O core define interfaces estáveis para `Scanner`, `Cleaner` e registro de providers. Providers Pro implementam essas interfaces em crates privadas e entram somente em builds Pro:

```text
Free build -> uncached-core + NodeModulesScanner
Pro build  -> uncached-core + uncached-pro + NodeModulesScanner + providers Pro
```

Core não conhece preço, conta, token, licença ou entitlement. A verificação de entitlement acontece na borda do desktop/CLI e somente decide quais providers registrar. Segurança de filesystem continua obrigatória em todos os builds.

Composição será feita em compile-time no MVP. Plugins dinâmicos ficam fora do escopo por causa de ABI instável, assinatura de código e diferenças entre Windows, macOS e Linux.

## Distribuição npm

`uncached-cli` será um launcher npm pequeno. Pacotes opcionais carregam binários nativos:

```text
uncached-cli
├── @uncached/cli-win32-x64
├── @uncached/cli-darwin-arm64
├── @uncached/cli-darwin-x64
└── @uncached/cli-linux-x64
```

O launcher seleciona binário por `process.platform` e `process.arch`, repassa argumentos e propaga o exit code. Não haverá scanner ou limpeza implementados em JavaScript.

Cada binário gratuito conterá somente `uncached-core` com `NodeModulesScanner`. Builds Pro futuros poderão usar pacote npm privado ou distribuição privada de binários, sem alterar contrato do core.

## Fluxo do CLI

```text
npx uncached scan [workspace]
        -> launcher npm
        -> binário Rust da plataforma
        -> scan_workspace(root, FreeProviders)
        -> relatório de targets e bytes
        -> confirmação única
        -> validação final de cada target
        -> TrashCleaner
```

O CLI nunca usa `rm -rf`, não altera `package.json` ou lockfiles e não aceita path de target como autoridade após o scan. Targets são revalidados imediatamente antes de serem enviados à Trash.

## Compatibilidade e releases

- Windows: `x64` inicialmente; arquitetura adicional só quando houver binário e teste.
- macOS: `x64` e `arm64`.
- Linux: `x64`.
- Cada binário é produzido em CI, associado a versão do crate e publicado junto dos pacotes npm correspondentes.
- Testes devem executar scanner, segurança de paths, Trash adapter e smoke test do binário instalado em workspace descartável.
- Repositórios privados podem conter core, desktop, CLI gratuito e código Pro. O pacote npm gratuito pode ser público para permitir `npx uncached`, sem expor o código-fonte dos repositórios.

## Migração

1. Criar `uncached-core` e mover primeiro scanner `node_modules`, traversal, sizing, paths e Trash.
2. Adaptar desktop para consumir core sem alterar eventos IPC ou comportamento visual.
3. Criar binário Rust CLI que consome core com providers gratuitos.
4. Substituir código JS do `uncached-cli` por launcher npm e pacotes de binários.
5. Configurar builds multiplataforma e smoke tests de tarball.
6. Publicar somente após desktop e CLI passarem pelos mesmos testes de segurança do core.
