# Plano de implementação dos primeiros três itens do ERP Industrial

**Resultado da primeira demonstração.** Em um checkout limpo, uma segunda pessoa sobe o ERP e executa a verificação do CI. Na interface, um líder consulta sua equipe. Com a sessão ainda aberta, o backend nega a mesma consulta após a suspensão do líder. Em Engenharia, uma pessoa autorizada publica duas versões de um produto e consulta a composição e o roteiro de cada uma.

Este documento detalha as etapas 2, 3, 4 e a frente de Engenharia da etapa 5 do [plano mestre](plano-mestre.md). O estado atual do repositório é de planejamento. Os nomes de comandos, contratos HTTP e estruturas abaixo são propostas para os primeiros PRs. As decisões industriais dependem dos exemplos e aprovações registrados no discovery. [Matriz de aderência](aderencia-requisitos-industriais.md)

## Sequência de trabalho

| Ordem | Entrega revisável | Dependência | Evidência para encerrar |
|---|---|---|---|
| D0 | Operador e líder reconstituem uma OS encerrada e anonimizada. Engenharia identifica produto, peças por kit, materiais, unidades e etapas por peça. O responsável pelo acesso valida a matriz de ações por setor. | Pode começar junto com F1 | Regra, aba/célula quando aplicável, exemplo, responsável, decisão e pendências registrados no Notion e referenciados no Git. |
| F1 | Preparar checkout, aplicações mínimas, banco efêmero e primeira migração. | Plano mestre | Segunda pessoa abre a interface no Windows, que consulta o backend e confirma a disponibilidade do banco migrado. |
| F2 | Ligar testes, cobertura, contratos, catálogo e instruções dos agentes ao CI. | F1 | O mesmo commit gera resultados equivalentes localmente e no CI. As provas de falha abaixo bloqueiam a verificação. |
| A1 | Entregar login e consulta de equipe de ponta a ponta. | F2 e exemplos de acesso validados | Líder abre a equipe do próprio setor. O teste chama a API para outro setor e recebe uma negativa. |
| A2 | Entregar suspensão auditada e tratamento da sessão aberta. | A1 | Após confirmação da suspensão, repetir a chamada com a mesma credencial resulta em acesso negado. |
| E1 | Entregar cadastros e contrato público de materiais e unidades. | F2, autorização de cadastro e exemplo industrial aprovado | Um material da OS de referência pode ser identificado e validado pelo contrato que Estoque consumirá. |
| E2 | Editar e publicar ficha e roteiro por peça. | E1 e concessão de publicação | Duas versões do mesmo produto passam no ensaio histórico descrito abaixo, inclusive após reiniciar a aplicação. |

Cada PR começa por um exemplo que falha pelo motivo esperado. A revisão recebe o teste, o contrato ou regra que ele verifica, a migração aplicável, o relatório do CI e o próximo ponto de retomada. A fundação usa dados sintéticos. A homologação industrial usa a OS aprovada em D0.

## 1. Fundação e harness

**Ambiente de referência.** Manter backend Kotlin/Spring Boot com Gradle Wrapper, frontend React/TypeScript com lockfile npm e PostgreSQL descartável. Versionar o Compose, o exemplo de configuração, a migração Flyway e os dados sintéticos de demonstração. Documentar pré-requisitos, portas, como reconhecer que cada serviço está pronto e como encerrar o ambiente. Isolar o banco de teste do banco de desenvolvimento. O teste de integração deve aplicar ao PostgreSQL real as mesmas migrações da aplicação. [Flyway](https://documentation.red-gate.com/flyway) · [Testcontainers](https://java.testcontainers.org/)

| Comando proposto a partir da raiz | Contrato a implementar em PowerShell 7 no Windows e no executor do CI |
|---|---|
| `./scripts/setup.ps1` | Conferir pré-requisitos e restaurar ferramentas e dependências nas versões fixadas. Informar como corrigir um pré-requisito ausente. |
| `./scripts/up.ps1` | Subir os serviços, aguardar prontidão, aplicar migrações e imprimir o endereço da interface. Uma segunda execução preserva os dados. |
| `./scripts/verify.ps1` | Preparar ambiente isolado, compilar, verificar tipos, arquitetura, contratos e catálogo, executar as suítes obrigatórias da etapa e gerar relatórios. Propagar o código de falha. Aceitar a revisão-base do PR para reproduzir o recorte localmente. |
| `./scripts/down.ps1` | Parar os serviços de desenvolvimento. Documentar a recriação explícita de um banco descartável em procedimento próprio. |

**Pipeline e medição.** Manter um inventário versionado dos módulos Gradle e das áreas funcionais do frontend, com seus diretórios e suítes. Incluir todo código de produção, inclusive arquivos nunca importados nos testes. Usar relatório de linhas e branches da JVM e do Vitest, associar os resultados aos módulos e cruzar as linhas executáveis e os pontos de decisão com o diff contra a base do PR. Registrar exclusões justificadas de código gerado. Publicar o resumo legível e os resultados estruturados como artefatos de cada execução. [Vitest](https://vitest.dev/guide/) · [ArchUnit](https://www.archunit.org/userguide/html/000_Index.html)

| Indicador | Regra do CI |
|---|---|
| Linhas e branches | Para **cada módulo** de backend e frontend, mínimo de **90%** e meta de **100%** em cada métrica, tanto no total quanto no código novo ou alterado. Exibir numerador, denominador e lacunas. Marcar denominador zero como “sem itens aplicáveis”. Um relatório obrigatório ausente falha. |
| Cenários de integração, contrato, UI e E2E | Por suíte, contar IDs de aceite distintos com teste aprovado sobre o total definido para a entrega. Mínimo de 90%, meta de 100%. Listar IDs descobertos e pendentes. |
| Regras críticas e execução | Exigir 100% dos cenários críticos positivos e negativos e aprovação de todos os testes obrigatórios. Bloquear também vulnerabilidade crítica sem tratamento. Executar a suíte rápida no PR e repetir jornadas críticas com os três perfis iniciais em homologação antes do release. |

**Provas de F2.** Em checkout descartável, introduzir uma referência ao repositório privado de outro módulo e verificar a falha de arquitetura. Repetir para ciclo entre módulos e dependência de infraestrutura no domínio. Levar um único módulo abaixo de 90% em branches com média global superior a 90% e conferir o bloqueio. Repetir com cobertura insuficiente apenas no diff. Executar o teste de migração em banco vazio e repetir a subida. Anexar SHA, revisão-base, comandos e relatórios da execução limpa local e do CI.

**Catálogo de versões.** F1 deve resolver e testar a combinação JDK/Kotlin/Gradle/Spring Boot, Node/npm/React/TypeScript, PostgreSQL/Flyway e ferramentas de teste. A1 acrescenta servidor e cliente Keycloak e Spring Security. Para cada dependência direta ou ferramenta, registrar versão exata, finalidade, módulos consumidores, arquivo que fixa a versão, referência oficial da API, release ou tag e cópia de referência para consulta offline. Fixar também imagens e wrappers. F2 compara catálogo, resolução Gradle e lockfile npm e falha em caso de divergência. Os números definitivos surgem do primeiro build reproduzido. [Kotlin](https://kotlinlang.org/docs/home.html) · [Spring Boot](https://docs.spring.io/spring-boot/) · [Gradle Dependency Locking](https://docs.gradle.org/current/userguide/dependency_locking.html) · [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/) · [React](https://react.dev/) · [TypeScript](https://www.typescriptlang.org/docs/) · [PostgreSQL](https://www.postgresql.org/docs/)

**Instruções compartilhadas.** Criar um `AGENTS.md` curto na raiz e um `CLAUDE.md` que remeta a ele. O índice em `docs/` leva ao glossário, fronteiras dos módulos, regras aprovadas, decisões em aberto, catálogo, contratos OpenAPI e comandos. Incluir convenções KDoc/TSDoc do plano mestre e um exemplo de retomada com último teste executado e próxima ação. Avaliar ambos os agentes em cópias descartáveis com as tarefas do plano mestre (localizar versão, distinguir regra pendente, corrigir escopo e retomar uma OS parcialmente implementada em fixture). Registrar fontes, resultados dos testes protegidos, tempo e custo para futuras comparações.

## 2. Login e consulta de equipe por setor

**Consulta proposta.** A interface React inicia login individual no Keycloak pelo fluxo de código de autorização com PKCE. Configurar o cliente público com origens e redirecionamentos explícitos. A API valida assinatura, emissor, audiência e validade do token de acesso. O ERP vincula emissor e sujeito à conta local e lê, em cada operação protegida, o estado atual da conta, a concessão para a ação e seu escopo. A decisão usa o estado confirmado no banco primário. Permissões em tela ou no token não substituem essa leitura. [Adaptador oficial do Keycloak](https://www.keycloak.org/securing-apps/javascript-adapter) · [Spring Security Resource Server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html)

| Operação proposta | Comportamento observável |
|---|---|
| `GET /api/sectors/{sectorId}/team` | Verificar a ação de consulta naquele setor e filtrar os membros pelo setor autorizado já na consulta ao banco. Responder 200 com a equipe, inclusive lista vazia. Credencial ausente ou inválida recebe 401. Conta suspensa ou sem concessão recebe 403, sem nomes, contagens ou outros dados da equipe. |
| Tela “Equipe” | Mostrar setor, pessoas, carregamento, lista vazia e negativa. Ao receber 401/403, retirar a listagem anterior. Desabilitar cache de respostas protegidas e limpar dados em memória na troca de identidade. |
| `POST /api/accounts/{id}/suspension` | Exigir concessão administrativa específica e motivo. Confirmar suspensão e auditoria na mesma transação. A próxima operação protegida iniciada após a confirmação encontra a conta suspensa. Registrar ator, alvo, escopo, motivo, resultado e correlação, preservando credenciais. |

**Roteiro de aceite crítico.** Preparar setores Corte e Pintura, um membro identificável em cada um, um líder com concessão somente em Corte e um administrador habilitado a suspender. A matriz de acesso deve ser revisada pelo responsável operacional antes de servir de referência para os testes.

1. Autenticar o líder no Keycloak de teste. Abrir Corte e conferir que a resposta contém apenas os membros esperados.
2. Com o mesmo token, consultar Pintura diretamente pela API. Esperar 403 e corpo sem dados da equipe. Um funcionário sem concessão também recebe 403 em Corte.
3. Com a tela do líder aberta, o administrador suspende a conta em outra sessão. Repetir a consulta a Corte com o **mesmo token ainda válido**, sem renovar ou refazer login. Esperar 403 e remoção dos dados exibidos ao atualizar a tela. Conferir o registro da suspensão e da negativa.
4. Verificar 401 com token vencido e credencial ausente. Tentar suspender com o perfil de líder e confirmar que a conta alvo permanece ativa. Testar revogação e mudança de setor com a mesma semântica de próxima chamada.

O primeiro PR funcional entrega a consulta. O fechamento de R0 para uso real ainda exige o ciclo administrativo do plano mestre, incluindo provisionamento, escopo hierárquico explícito, concessões críticas, MFA administrativo e encerramento do SSO na troca de operador. Vincular essas homologações ao marco de uso real.

## 3. Cadastros e engenharia de produto

| Objeto | Dados e comportamento a implementar |
|---|---|
| Categoria, unidade e matéria-prima | Categoria identificável, unidade com símbolo e dimensão, material com código, descrição, categoria e unidade de referência. O contrato de materiais devolve ID estável e unidade. Validar unidade compatível e quantidade decimal positiva com precisão aprovada. |
| Produto e peça | Código e descrição pesquisáveis. Selecionar produto pai, associar peças e informar quantidade de cada peça por kit. Preservar referências utilizadas em publicações quando o cadastro for alterado ou inativado. |
| Ficha de composição física | Um rascunho reúne linhas de peças por kit e linhas de materiais com ID, quantidade e unidade por produto. Separar as duas bases de quantidade na edição e na consulta. Quando aplicável, registrar espessura, peças por placa, peças por corte e minutos por corte conforme a matriz industrial. |
| Roteiro | Manter, por peça, a lista ordenada de etapas. Permitir inserir, remover e reordenar no rascunho. Persistir ordem explícita e validar posições e referências. O roteiro publicado acompanha a consulta histórica da ficha. |

**Fluxo de edição.** Oferecer formulários e listas filtráveis para os cinco cadastros. Na tela do produto, escolher uma versão como base, editar peças, materiais e etapas, revisar e publicar. Na mesma tela, o seletor de versões carrega a edição publicada escolhida. Aplicar no backend concessões distintas de consulta, edição e publicação. Homologar a atribuição dessas ações com Engenharia.

**Proposta de publicação.** O produto identifica cada ficha por número de versão. A publicação referencia a revisão imutável do roteiro e grava, na mesma transação, composição, sequência por peça, autor e instante. Preservar os valores e descrições apresentados no histórico. Uma alteração posterior de cadastro ou rascunho deve deixar V1 integralmente reproduzível. Usar restrição única por produto e número, controle de revisão do rascunho e identificação única da publicação daquele rascunho. Repetir a requisição já confirmada devolve a publicação existente. Edição concorrente sobre revisão ultrapassada recebe conflito. Uma falha no roteiro desfaz a publicação inteira.

**Contrato proposto.** Documentar em OpenAPI as operações de cadastro, criação e atualização de rascunho, publicação e leitura. A consulta `GET /api/products/{id}/versions` enumera as publicações. `GET /api/products/{id}/versions/{version}` devolve peças, quantidades, unidades, materiais e roteiro da edição solicitada. A futura OS poderá reter a referência exata obtida nesse contrato. [OpenAPI](https://spec.openapis.org/oas/)

| Ensaio | Entrada e resultado esperado |
|---|---|
| Publicar V1 | Exemplo sintético de um kit com 2 rodas e 1 base, 0,50 placa de madeira por kit e roteiro da roda “corte → pintura”. A consulta V1 reproduz esses valores. |
| Derivar V2 | Copiar V1, alterar para 4 rodas, 0,75 placa e roteiro “corte → lixamento → pintura”. Publicar. A listagem contém V1 e V2. Consultar cada versão pela UI e pela API e comparar peça a peça, incluindo a base de 1 unidade em ambas. |
| Preservar histórico | Renomear a peça, inativar o material e reiniciar a aplicação. Reabrir as duas publicações e conferir nomes históricos, quantidades, unidades e ordem das etapas. Uma tentativa de alterar diretamente uma publicação deve ser rejeitada. |
| Rejeitar dados inválidos | Exercitar referência inexistente, material em unidade incompatível, quantidade zero ou negativa e posição repetida de etapa. O erro identifica a linha e preserva o rascunho anterior. |
| Publicação atômica | Forçar falha ao salvar a sequência e verificar ausência de versão parcial. Repetir publicação confirmada e simular duas tentativas simultâneas sobre o mesmo rascunho. Deve existir uma única publicação desse rascunho. |

## Decisões para a primeira revisão

| Responsável proposto | Decisão e momento |
|---|---|
| Operador, líder e Engenharia | Em D0, identificar a OS, confirmar quantidades por kit, base de consumo dos materiais, precisão e unidades permitidas. Conferir a sequência real por peça contra as colunas de etapas da planilha. |
| Responsável por acessos | Antes de A1, aprovar atores, ação, setor e validade das concessões. Antes de A2, confirmar quem suspende e qual motivo a auditoria exige. |
| Engenharia de produto | Antes de E2, validar publicação conjunta da ficha e da revisão do roteiro, campos históricos, regras de edição e quem pode publicar. Confirmar quais parâmetros de corte se aplicam a cada família de peças. |
| Equipe técnica | Em F1, registrar versões efetivamente compatíveis, provedor de CI e pré-requisitos do checkout Windows. Em F2, anexar os primeiros relatórios e as provas de bloqueio. |

O encerramento destes três itens requer as evidências de F2, A2 e E2. A valorização financeira da ficha depende da decisão sobre custo médio ou último preço. Movimentações de estoque pertencem à outra frente da etapa 5, e a reserva e a execução da OS entram em R2, conforme o [plano mestre](plano-mestre.md).
