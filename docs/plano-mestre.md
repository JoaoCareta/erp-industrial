# ERP Industrial — plano mestre de arquitetura, acesso e engenharia

O piloto atenderá uma fábrica de brinquedos, com contas individuais em computadores compartilhados e individuais. A primeira jornada industrial de ponta a ponta será publicar uma ficha técnica, liberar uma ordem de produção (OS), reservar material, apontar consumo e produção e reconciliar o estoque. Essa jornada demonstrará como arquitetura, permissões, interface, transações e auditoria funcionam juntas.

O projeto está em planejamento. A análise inicial identifica 19 abas, 5.038 células com fórmulas e as regras preliminares BR-001 a BR-018. As fórmulas industriais relevantes para a lista do cliente foram conferidas no arquivo. O recálculo integral e a homologação com a fábrica fazem parte do discovery. [Planejamento original do ERP](https://chatgpt.com/share/6b059c1c-0798-83e8-9995-3652b499aec3)

**Escopo do ERP.** Produção, engenharia, estoques, compras, terceirização, capacidade, laser, vendas operacionais, custos industriais, precificação e identidade de acesso. A proposta é manter RH, folha, ponto, contas a pagar e a receber, caixa e DRE nos sistemas que a empresa já possui. Uma integração com esses sistemas exige levantamento próprio. A matriz funcional identifica os campos, as telas e as regras que ainda precisam de especificação ou aceite. [Aderência aos requisitos industriais](aderencia-requisitos-industriais.md)

## 1. Domínio, arquitetura e padrões

Adotar um **monólito modular**, com Kotlin e Spring Boot no backend, React e TypeScript na interface, PostgreSQL e migrações Flyway. Cada contexto terá contratos públicos, propriedade dos seus dados e testes de fronteira. O domínio será Kotlin puro. Os casos de uso coordenarão as operações. Os adaptadores implementarão persistência, HTTP e integrações. [Kotlin](https://kotlinlang.org/docs/home.html) · [Spring Boot](https://docs.spring.io/spring-boot/) · [Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/) · [React](https://react.dev/reference/react) · [TypeScript](https://www.typescriptlang.org/docs/handbook/intro.html) · [PostgreSQL](https://www.postgresql.org/docs/) · [Flyway](https://documentation.red-gate.com/flyway)

Validar no discovery os nove contextos propostos para o produto: **Engenharia de Produto, Planejamento da Produção, Produção, Estoque, Compras, Terceirização, Vendas, Custos Industriais e Precificação, Identidade e Acesso**. O mapa registrará quem é responsável por cada dado, quem pode alterá-lo e quais consumidores dependem dele. Engenharia publica a versão da ficha, Produção fixa essa versão na OS, Estoque responde pelas reservas e movimentações, e o Kanban consulta o resultado. O código usará os termos acordados em inglês, com glossário e interface em português.

| Problema | Padrão ou abstração planejada | Verificação |
|---|---|---|
| Dinheiro, unidades e arredondamento industrial | Objetos de valor para dinheiro, quantidade, unidade e duração. Cada regra define precisão e arredondamento. | Impedir soma de unidades incompatíveis e conferir exemplos reais de corte e precificação. |
| Transições válidas de uma OS | Agregado `ProductionOrder`, comandos explícitos e máquina de estados. Ficha e roteiro publicados têm versões imutáveis. | Publicar uma ficha nova preserva a composição da OS já liberada. |
| Operação que envolve vários contextos | Serviço de aplicação coordena contratos públicos. Uma transação cobre as mudanças que precisam ser confirmadas juntas. Cada contexto mantém seus repositórios. | Uma falha na reserva desfaz a liberação da OS. O teste arquitetural identifica acesso direto ao repositório de outro contexto. |
| Repetição de operações e disputa de saldo | Chave de idempotência, unicidade de negócio e controle de concorrência no PostgreSQL. O estoque mantém o histórico de movimentos e estornos vinculados à origem. | Repetir um apontamento produz um único efeito. Duas OS concorrentes preservam o saldo disponível. |
| Reação após a confirmação de uma operação | Evento de domínio. Para entrega assíncrona durável, usar *Transactional Outbox*, consumidor idempotente e reconciliação. | Interromper e retomar o processamento entrega o efeito pendente uma única vez do ponto de vista do negócio. |
| Variação por processo ou canal | Política de domínio explícita. Introduzir *Strategy* para variantes aprovadas e *Adapter* para contratos externos, como Excel e identidade. | Cada variante tem exemplos próprios e a troca de adaptador preserva o contrato do caso de uso. |

O catálogo de padrões em `docs/` registrará problema, contexto, decisão, consequência e teste. Na revisão de Clean Code, verificar nomes do domínio, efeitos colaterais explícitos, duplicação de regras e responsabilidade de cada abstração. O ArchUnit bloqueará ciclos, importações de infraestrutura pelo domínio e acesso a detalhes internos de outros módulos. [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) · [ArchUnit](https://www.archunit.org/userguide/html/000_Index.html)

## 2. Back office de identidade e acesso

**Cada pessoa terá uma identidade própria.** Operador, líder, chefe e gerente poderão usar a mesma estação em momentos diferentes. O organograma operacional indicará quem responde por quais equipes. Cada concessão combinará **ação, escopo e inclusão explícita dos subordinados**. Um gerente poderá consultar a produção de todo o ramo e aprovar perdas apenas em dois setores. Custos industriais, preços comerciais e administração de acessos terão permissões próprias.

| Área | Comportamento previsto |
|---|---|
| Pessoas e contas | Criar ou convidar, ativar, suspender, reativar e encerrar acesso. Vincular a identidade ao colaborador e mostrar a situação de ambos. Prever provisionamento assistido para quem trabalha sem e-mail individual. |
| Organograma e papéis | Manter unidades, setores, equipes e responsáveis. Usar Administrador, Líder e Funcionário como perfis iniciais. Permitir compor perfis como Chefia, Gerência e Estoquista pela interface. |
| Acesso efetivo | Responder “quem pode fazer isto?” e “por que esta pessoa pode fazer isto aqui?”. Mostrar papel, concessão, escopo, alcance hierárquico e validade. Pré-visualizar ganhos e perdas de acesso antes de alterar um papel ou mover uma equipe. |
| Login e sessões | Keycloak com OIDC cuida de autenticação, MFA e recuperação. O ERP mantém as autorizações de negócio. Adotar MFA resistente a phishing para administradores. Em terminal compartilhado, a troca de operador exige autenticação da próxima pessoa e encerra o contexto da anterior, inclusive no SSO. |
| Concessões críticas e auditoria | Separar solicitação e aprovação de privilégios críticos, impedir autoaprovação e manter acesso emergencial temporário e auditado. Registrar ator, alvo, escopo, motivo, resultado e correlação. Proteger credenciais e informações salariais dos logs. |

O backend aplicará a autorização em comandos, consultas, listagens e exportações. A interface refletirá as ações disponíveis. Suspensão, revogação ou troca de escopo deve valer na próxima operação protegida, inclusive em sessão aberta. O negócio aprovará uma matriz de exemplos que servirá de entrada independente para os testes da política. [Keycloak](https://www.keycloak.org/documentation) · [Spring Security e OIDC](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/index.html) · [OWASP sobre testes de autorização](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Testing_Automation_Cheat_Sheet.html) · [NIST sobre autenticação](https://pages.nist.gov/800-63-4/sp800-63b.html)

## 3. Documentação e harness para Codex e Claude

Toda afirmação relevante sobre o domínio ou sobre uma API deverá ter uma fonte verificável. Pessoas e agentes seguirão as mesmas referências.

| Fonte | Responsabilidade |
|---|---|
| Notion | Discovery, processos da fábrica, atas, exemplos e aprovação funcional. Cada regra recebe identificador, responsável e estado de aprovação. |
| `docs/` no Git | Índice navegável, glossário, mapa de contextos, regras aprovadas com revisão e link ao Notion, decisões arquiteturais, contratos, catálogo de dependências e procedimentos de operação. Uma mudança funcional identifica a aprovação correspondente. |
| Instruções dos agentes | `AGENTS.md` será a porta de entrada curta. A entrada do Claude apontará para as mesmas instruções. Ambas indicarão como localizar o contexto, consultar referências, executar verificações e retomar trabalho interrompido. |

### Documentação no código

Usar KDoc em Kotlin e TSDoc em TypeScript, incluindo arquivos `.tsx`. O KDoc usa o primeiro parágrafo como resumo. O TSDoc prevê um resumo breve e uma seção opcional de detalhes com `@remarks`. Os limites abaixo são a convenção editorial do ERP para autores, agentes e revisores. [Guia oficial de KDoc](https://kotlinlang.org/docs/kotlin-doc.html#kdoc-syntax) · [Guia oficial de TSDoc sobre resumo e detalhes](https://tsdoc.org/pages/tags/remarks/)

- **Classe ou arquivo — até dois parágrafos curtos.** O primeiro explica o que a classe representa ou para que serve o arquivo. Usar o segundo quando houver uma regra que mude a forma de usá-lo. Se o arquivo gira em torno de uma classe, documentar na declaração. Se reúne funções ou componentes com uma finalidade comum, documentar no cabeçalho.
- **Função ou método — até um parágrafo, em uma ou duas frases.** Documentar quando o chamador precisar conhecer um comportamento que o nome e a assinatura deixam em aberto. Por exemplo, `/** Registra o consumo da OS. Apontamentos idênticos com a mesma chave geram uma única baixa no estoque. */`
- **Corpo do código.** Evitar comentários linha a linha e descrições que repetem nomes, tipos ou instruções. Manter fluxos de negócio e explicações de arquitetura em `docs/`.

Dois exemplos de referência mostram o que merece espaço no comentário. No Kotlin, `Pair` começa descrevendo o que representa e depois explica que a igualdade depende dos dois componentes. No compilador TypeScript, `VersionRange.test` explica que a comparação inclui versões de pré-lançamento. Em ambos, quem chama ganha uma informação concreta sobre o comportamento. [Implementação de `Pair`](https://github.com/JetBrains/kotlin/blob/v2.2.20/libraries/stdlib/src/kotlin/util/Tuples.kt#L10-L25) · [Implementação de `VersionRange.test`](https://github.com/microsoft/TypeScript/blob/v5.9.3/src/compiler/semver.ts#L217-L224)

### Protocolo para cada solicitação técnica

1. Identificar contexto, regra aprovada, contrato público e arquivos que demonstram o comportamento atual. Distinguir fato verificado, proposta e questão de negócio em aberto.
2. Antes de recomendar ou usar uma API, consultar a versão resolvida pelo projeto e a documentação oficial correspondente. Para cada biblioteca, o catálogo registrará finalidade, módulos consumidores, origem da versão, referência da API e notas da versão. Se o fornecedor mantiver apenas documentação corrente, vincular também a tag ou release exata. Incluir os links relevantes na resposta técnica e no PR.
3. Partir de versões estáveis compatíveis, fixá-las e atualizar por PR testado. O CI confrontará catálogo, dependências resolvidas pelo Gradle e lockfile do frontend. Uma referência oficial versionada em cache permitirá consultas durante indisponibilidade do site. Identificar como pendente uma afirmação cuja API ou regra não pôde ser confirmada. [Gradle Dependency Locking](https://docs.gradle.org/current/userguide/dependency_locking.html) · [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
4. Trabalhar uma fatia verificável por vez. Registrar o exemplo, a alteração, os testes executados e o próximo ponto de retomada. Disponibilizar os mesmos comandos de preparação, consulta de contexto e verificação no Windows e no CI, com dados sintéticos e ambientes isolados.

**Exemplo do catálogo.** Para uma solicitação sobre `Flow`, consultar a versão de `org.jetbrains.kotlinx:kotlinx-coroutines-core` resolvida no módulo afetado. A versão 1.11.0 foi um exemplo da pesquisa do planejamento. A entrada definitiva registrará a versão adotada na fundação. Para TypeScript, consultar o compilador travado, o Handbook e as notas da versão correspondente. [API oficial de Flow](https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-core/kotlinx.coroutines.flow/-flow/) · [Releases de kotlinx.coroutines](https://github.com/Kotlin/kotlinx.coroutines/releases) · [TypeScript Handbook e notas por versão](https://www.typescriptlang.org/docs/handbook/intro.html)

**Avaliação do harness.** Manter tarefas de referência em cópias descartáveis do projeto. A suíte inicial pedirá ao agente que localize a versão de uma biblioteca, identifique uma regra sem aprovação, corrija uma regressão de escopo e retome uma OS parcialmente implementada. O avaliador verificará fontes, compilação, estado final e testes de referência protegidos. Ao mudar modelo, instruções ou ferramentas, repetir as tarefas e comparar acertos, afirmações sem fonte, tempo e custo. [OpenAI sobre harness engineering](https://openai.com/index/harness-engineering/) · [Anthropic sobre agentes de longa duração](https://www.anthropic.com/research/effective-harnesses-for-long-running-agents) · [Anthropic sobre avaliações de agentes](https://www.anthropic.com/research/demystifying-evals-for-ai-agents)

## 4. TDD, testes e critérios de aceite

Cada mudança de comportamento começa com um exemplo que falha pelo motivo esperado. Seguem a implementação mínima, o teste verde e a refatoração. Para regras industriais, rastrear **regra → origem no Excel → decisão da fábrica → exemplo aprovado → teste → implementação**. Uma fórmula com defeito conhecido receberá um caso de divergência documentado. [Kent Beck sobre TDD](https://newsletter.kentbeck.com/p/canon-tdd)

### Cobertura mínima e meta

**O mínimo obrigatório é 90% e a meta é sempre 100%.** A política vale para todos os módulos do backend e do frontend. Cada métrica e cada módulo precisam atingir o próprio mínimo.

| O que medir | Mínimo obrigatório | Meta | Critério de aceite |
|---|---|---|---|
| Linhas executáveis por módulo | 90% | 100% | Medir o código existente e também as linhas novas ou alteradas do PR. Cada recorte com linhas executáveis deve atingir o mínimo. |
| Branches por módulo | 90% | 100% | Medir separadamente os desvios lógicos do módulo e os novos ou alterados no PR. Cada recorte com branches deve atingir o mínimo. |
| Cenários de aceite por suíte de integração, contrato, UI e E2E | 90% | 100% | Para cada suíte, dividir o número de cenários de aceite cobertos por testes aprovados pelo total de cenários de aceite definidos para ela. Cada cenário conta uma vez. |
| Cenários positivos e negativos das regras críticas | 100% | 100% | Todos os cenários críticos definidos para a entrega devem ter testes aprovados. |
| Aprovação dos testes obrigatórios | 100% | 100% | Todos os testes obrigatórios da etapa, inclusive arquiteturais e de integração, devem executar e passar. |

O CI bloqueará o PR quando qualquer mínimo aplicável falhar. Uma média global não compensa um módulo ou uma métrica abaixo do limite. O relatório mostrará o resultado por módulo e suíte, o recorte do PR e os itens que faltam para atingir 100%. O critério de segurança permanece **zero vulnerabilidades críticas sem tratamento**.

### Cenários industriais e operacionais obrigatórios

| Cenário | Resultado esperado |
|---|---|
| Reserva e consumo parcial | Com 100 placas físicas, reservar 30 deixa 70 disponíveis. Apontar consumo de 12 deixa 88 físicas, 18 reservadas e 70 disponíveis. Repetir o apontamento conserva os três valores. Cancelar o restante libera as 18 reservadas e preserva o consumo registrado. |
| Paridade industrial | No exemplo da Casinha Branca, 150 kits × 2 peças exigem 300 peças. Com 98 peças por corte e 57 minutos por corte, são 4 cortes e 228 minutos. O domínio distingue capacidade planejada de produção apontada. |
| Concorrência e recuperação | Duas OS disputando o último saldo preservam o estoque. Falha durante a transação, repetição após uma resposta perdida e reprocessamento de evento mantêm ordem, estoque e auditoria coerentes. |
| Hierarquia e posto compartilhado | Líder atua no setor autorizado. Gerente consulta os descendentes permitidos. Transferir uma equipe altera o alcance conforme a concessão. Ao trocar o operador no terminal, a sessão anterior deixa de expor dados e permissões. |
| Migração e operação | Importar duas vezes preserva quantidades e vínculos. Uma OS aberta no corte mantém o consumo anterior e só reserva o saldo pendente aprovado. Uma restauração recupera os dados e permite reconciliar OS, reservas e movimentos. |

A suíte rápida roda no PR. Integração usa PostgreSQL real em ambiente efêmero. O release exige jornadas críticas de UI e E2E em homologação, incluindo os três perfis iniciais. Contratos HTTP serão publicados em OpenAPI. Carga, resiliência e restauração serão exercitadas antes do piloto. [JUnit 5](https://docs.junit.org/5.13.4/user-guide/) · [Testcontainers](https://java.testcontainers.org/) · [Vitest](https://vitest.dev/guide/) · [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/) · [Playwright](https://playwright.dev/docs/intro) · [OpenAPI](https://spec.openapis.org/oas/) · [k6](https://grafana.com/docs/k6/latest/)

## 5. Sequência de implementação

Começar com uma OS encerrada que o operador e o líder consigam reconstruir. A ficha usada, os apontamentos e os saldos antes e depois servirão de referência para os primeiros testes e para a homologação. A fundação técnica pode avançar enquanto a fábrica valida o exemplo e a equipe confere as 19 abas.

| Ordem | Entrega | Como saber que podemos avançar |
|---|---|---|
| 1 · Discovery da primeira OS | Registrar a OS anonimizada, a versão da ficha, os materiais, as unidades, os setores, quem executou cada ação, perdas e saldos. Comparar o que aconteceu na fábrica com o que o Excel calculou. Registrar separadamente as reservas e os apontamentos esperados para o piloto. | Operador e líder conseguem explicar as diferenças. A fábrica aprova os exemplos da primeira jornada e identifica os pontos pendentes. O levantamento das 19 abas, das regras BR-001 a BR-018, da rede, dos postos e das necessidades de recuperação continua em paralelo. |
| 2 · R0 — Fundação e harness | Preparar o repositório, as instruções compartilhadas de Codex e Claude, o índice de documentação e o catálogo de versões e fontes oficiais. Subir o backend, a interface e um banco descartável. Ligar migrações, testes e verificações de arquitetura ao CI. | A partir de um checkout limpo, outra pessoa ou agente prepara o ambiente no Windows, executa a verificação usada no CI e aplica a primeira migração em banco vazio. Uma alteração de exemplo que infringe uma fronteira de módulo faz a verificação falhar. |
| 3 · R0 — Identidade e acesso por setor | Entregar login individual e uma operação real do back office. Por exemplo, um responsável com permissão consulta a equipe do seu setor. Em seguida, completar provisionamento, concessões por escopo, auditoria, suspensão e troca de operador em posto compartilhado. | A mesma operação é permitida no setor autorizado e negada pelo backend em outro. A suspensão vale na próxima operação, inclusive com sessão aberta. As jornadas administrativas privilegiadas da seção 2 são homologadas antes do uso real. |
| 4 · R1 — Materiais e unidades | Cadastrar o material e a unidade usados na OS de referência. Fixar o significado da quantidade e o identificador que Engenharia e Estoque usarão em seus contratos públicos. | A ficha consegue referenciar o mesmo material que o estoque movimenta. Os testes rejeitam unidades incompatíveis. |
| 5 · R1 — Engenharia e Estoque | Engenharia publica produto, ficha e roteiro versionados. Estoque registra inventário inicial, entradas por compra e histórico de movimentos. Iniciar a prévia de importação de cadastros, inventário e OS abertas, com relatório de divergências. As duas frentes podem avançar em paralelo a partir do contrato de materiais. | A versão publicada da ficha permite calcular os materiais da OS. O saldo do item pode ser reconstruído pelas movimentações. A prévia aponta referências ausentes ou ambíguas para revisão. |
| 6 · R2 — Liberar a OS e reservar | Criar a OS com ficha e roteiro fixados. Entregar a ação de liberação, desde a interface do líder até a autorização, a reserva no estoque e o registro da operação. Esta é a primeira entrega que reúne Identidade, Engenharia, Estoque e Produção. | Com 100 placas físicas, reservar 30 deixa 70 disponíveis. Repetir a liberação conserva uma única reserva. Falha durante a transação preserva o estado anterior da OS e do estoque. Duas OS simultâneas respeitam o saldo. |
| 7 · R2 — Executar e encerrar | Entregar tarefas e Kanban, apontamento parcial pelo operador, registro de perdas e sobras, cancelamento e conclusão com entrada de produto acabado. | Consumir 12 das 30 placas reservadas deixa 88 físicas, 18 reservadas e 70 disponíveis. Em cenários distintos, cancelar libera o restante e concluir duas vezes gera uma única entrada de acabados. A equipe reconcilia a OS de referência de ponta a ponta. |
| 8 · R2 — Migração e piloto de um setor | Ensaiar a virada em homologação. Importar cadastros, inventário validado e OS abertas na data de corte. Preservar o consumo anterior e reservar apenas o pendente aprovado. Exercitar restauração, carga, recuperação e operação nos postos reais. | Repetir a carga preserva saldos e vínculos. A equipe reconcilia os dados, verifica a restauração e homologa as jornadas dos três perfis. Só então efetiva a carga de abertura e inicia a operação acompanhada em um setor. O histórico anterior fica disponível no Excel. |
| 9 · R3 e R4 — Expansão | R3 entrega planejamento laser, capacidade de montagem com saldo de peças soltas e produção externa. R4 entrega vendas por canal, baixa do produto acabado, custos industriais e precificação. Os indicadores de operação acompanham a entrega de cada área. | Cada release usa os dados já reconciliados e tem contratos, permissões, testes e homologação próprios. |

### Primeiras entregas para revisão

O [plano de fundação, acesso por setor e engenharia de produto](plano-fundacao-acesso-engenharia.md) detalha a sequência de PRs, as dependências e os ensaios de aceite dos três primeiros itens solicitados.

1. **Primeira entrega de planejamento.** Produzir a ficha da OS de referência, a matriz de atores e ações e os exemplos de aceite. Vincular cada regra à sua origem no Excel e à decisão da fábrica. Essa é a entrada para escrever os testes de negócio.
2. **Primeiro PR técnico.** Entregar a fundação reproduzível da etapa 2, com os comandos de preparação e verificação documentados e executados no CI. Incluir as fontes oficiais das dependências efetivamente adotadas. [Harness de engenharia da OpenAI](https://openai.com/index/harness-engineering/) · [Testcontainers](https://java.testcontainers.org/)
3. **Primeiro PR funcional.** Começar pelo teste de autorização por setor. Entregar a consulta de equipe por um usuário autenticado, com um exemplo permitido e outro negado, passando pela interface, API e banco. Os próximos PRs de R0 completam o ciclo administrativo descrito na etapa 3. [Keycloak](https://www.keycloak.org/documentation) · [Spring Security e OIDC](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/index.html)

A partir do primeiro comportamento executável, cada entrega seguirá o ciclo de TDD e os critérios de cobertura da seção 4. O desenvolvimento industrial pode começar assim que o escopo de acesso necessário e os exemplos da fábrica estiverem aprovados. A preparação das demais permissões e a análise das outras áreas podem prosseguir em paralelo.

O discovery decidirá hospedagem e continuidade durante quedas de rede com base nas condições do chão de fábrica. A estimativa original de 628–939 horas incluía RH e Financeiro. O novo orçamento deverá considerar o escopo industrial revisado, as pendências da matriz funcional, o back office hierárquico, o harness, o saneamento dos dados e a homologação. O primeiro marco será uma OS real que a fábrica consiga explicar, operar e reconciliar e que outra pessoa ou agente consiga reproduzir pela documentação.
