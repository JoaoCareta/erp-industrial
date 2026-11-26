# Homologação das quatro entregas de 26/11/2026

A equipe executou `./scripts/setup.ps1` e `./scripts/verify.ps1 -Base e2ea03d` em Windows com PostgreSQL descartável, realm sintético e Chromium. A execução local passou em 25 cenários de aceite. A execução de CI da PR fornece os XMLs, a cobertura e os identificadores da revisão e da base.

| Cartão | Como reproduzir | Resultado observado e escopo |
|---|---|---|
| F1 | Rodar a verificação. A suíte instala a revisão `2f8fd85`, publica V1, aplica a migração e inicia duas vezes a aplicação candidata. | A equipe e a publicação conservaram IDs, conteúdo, autor e instante. Um setor sem mapeamento interrompeu a transação. Uma segunda pessoa pode reproduzir o roteiro em Windows limpo. |
| F2 | Abrir os artefatos de atualização, integração e contrato, UI, E2E, cobertura e aceite. | Localmente passaram 2 cenários de atualização, 7 de integração, 2 de contrato, 8 de interface e 6 de navegador. A demonstração completa de todos os bloqueios negativos continua pendente. |
| R0-ADM | No mesmo navegador, entrar como regional, abrir Araçatuba, sair e entrar como operador. Voltar e recarregar. | O Keycloak pediu autenticação. O operador ficou sem unidade e sua consulta à equipe recebeu 403. Provisionamento, concessões e MFA permanecem no escopo maior do cartão. |
| R1-IMP | Abrir Engenharia → Prévia de materiais. Usar o arquivo abaixo após cadastrar PL e o material MDF com descrição Painel. Repetir. | A tela mostra material conferido e material novo, com número da linha. A repetição manteve os resultados e fez apenas leituras. Inventário e OS abertas aguardam as amostras. |
| R1-EST | Executar o teste de contrato `stockReadsRequestedVersion` com 0,50 placa na V1 e 0,75 na V2. | A leitura por versão conservou os UUIDs, quantidades e descrições, inclusive após alteração do cadastro. Movimentos, saldo e estornos continuam pendentes. |

```csv
código,descrição,unidade
MDF,Painel,PL
NOVA,Nova,PL
```

Para homologar, registrar revisão, ambiente, responsável, resultado e eventual linha ou passo divergente.
