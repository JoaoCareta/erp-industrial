# Plano de implementação do ERP após a PR #5

**Objetivo do primeiro marco.** Uma pessoa autorizada imprime a OS, confere uma entrega parcial, registra uma venda de demonstração, corrige uma contagem e encerra a ordem. Outra pessoa consegue explicar cada saldo pelos movimentos registrados. Desenvolvimento pode executar as etapas abaixo com dados sintéticos. Os parâmetros reais da fábrica ficam para a entrada em operação.

## Ponto de partida em 27/11/2026

Na base integrada `583b11d`, Engenharia publica fichas versionadas, Produção fixa a versão na OS e Estoque controla reserva e consumo. A conferência parcial já dá entrada nos kits.

**Regras confirmadas pelo interlocutor em 27/11.** A administração configura a autonomia por ação e escopo. Um líder pode liberar OS se tiver a concessão. O administrador tem acesso completo no seu escopo. A conferência física dá entrada nos acabados. Uma correção preserva o histórico e informa a divergência. Encerrar a OS libera a parte ainda reservada da matéria-prima. A taxa horária varia por etapa. [Registro das decisões](aderencia-requisitos-industriais.md)

## Primeiro marco — execução da OS e saldos

| Ordem | O que implementar | Teste que encerra a entrega |
|---|---|---|
| 1. Impressão da OS e planejamento laser (abas 2, 6 e 14) | Finalizar a impressão a partir da composição congelada na OS, com número, versão, peças, lote, materiais e etapas. Em Engenharia, simular o lote na versão selecionada. Indicar peças com dados de corte incompletos. Os dois recursos podem ser revisados separadamente. | Publicar V2, imprimir uma OS de V1 em PDF e conferir conteúdo e paginação. Simular 150 kits com duas peças cada, capacidade de 98 por corte e 57 minutos por corte. Esperar 4 cortes e 228 minutos. |
| 2. Acabados e venda do piloto (abas 10 e 11) | Concluir o saldo por fábrica e produto. Integrar inventário inicial, conferência e venda à interface. Registrar data, canal, quantidade, preço e total. Exibir histórico e saldo na OS e em Vendas. No piloto, a confirmação explícita da venda efetiva a baixa. | Migrar uma base com entradas anteriores e conferir o mesmo saldo. Receber 30, vender 10, reenviar a venda e receber mais 70 resulta em 90 kits. Duas vendas concorrentes da última unidade produzem uma única baixa. |
| 3. Correção da conferência | Criar ajuste vinculado à entrada original e fila de divergências por unidade. Exibir contagem anterior, recontagem, impacto no saldo e motivo. A API valida a permissão e a revisão da conferência. Estoque e Produção confirmam juntos o efeito do ajuste. | Executar os dois exemplos da seção de correção abaixo, incluindo reenvio e venda simultânea. Fechar a divergência uma única vez e rastrear o movimento usado para conciliá-la. |
| 4. Encerramento antecipado | Na OS liberada, mostrar kits conferidos, quantidade que deixou de ser produzida e reserva restante por material. Ao confirmar, registrar responsável, data e liberação no extrato. Bloquear novos consumos e conferências ordinárias na OS encerrada. Preservar acesso ao histórico e às divergências. | De 30 placas reservadas e 12 consumidas, liberar 18. O físico permanece igual, o disponível sobe 18 e a reserva da OS zera. Repetir o encerramento e disputar com um apontamento preserva a conciliação. |

**Acesso acompanha cada entrega.** Reutilizar as verificações de ação por unidade no servidor e na interface. Incluir no plano de Acesso a tela administrativa para atribuir e revogar as novas ações no cadastro. Demonstrar com duas contas de líder na mesma unidade, concedendo liberação a uma delas. Revogar a permissão e repetir a operação na sessão aberta. Testar correção e encerramento separadamente.

## Correção da conferência

Fluxo acordado em 27/11 para uma OS aberta de 150 kits. Usar como base a quantidade líquida já conferida, incluindo ajustes anteriores. Cada correção registra autor, data, motivo e referência à conferência.

| Recontagem de 30 para 28 | Resultado esperado |
|---|---|
| Já foram vendidos 10 kits | O saldo disponível passa de 20 para 18. O histórico conserva a venda de 10 e a conferência de 30, acrescida do ajuste de −2. A OS passa a mostrar 28 conferidos líquidos e 122 por conferir. |
| Já foram vendidos 28 kits | O ajuste consome as duas unidades disponíveis. O saldo final é zero e a conferência fica corrigida. |
| Já foram vendidos 29 kits | Falta uma unidade para conciliar. Abrir divergência e proteger a unidade ainda em saldo contra nova venda. Uma pessoa autorizada verifica contagem, expedições e entradas. Após regularização documentada, revalidar e aplicar o ajuste uma única vez. |

## Entregas que podem avançar com os dados disponíveis

| Ordem | Implementação e dependência | Exemplo de aceite técnico |
|---|---|---|
| 5. Compras (abas 3, 7 e 9) | Registrar material, unidade, fornecedor, data, quantidade e valor. Gravar compra e entrada no mesmo lançamento, com estorno vinculado. Filtrar material, fornecedor e período. Exibir último preço e custo médio ponderado. Esta frente pode começar junto da etapa 1. | Dez placas por R$ 100 e dez por R$ 140 somam 20 placas e R$ 240. Exibir último preço de R$ 14 e média de R$ 12. Estornar a segunda compra reconcilia quantidade e valor. |
| 6. Terceirização (aba 8) | Vincular remessa à OS, peça e terceiro. Registrar data e quantidade de cada retorno e mostrar saldo em poder do terceiro. Manter o histórico e separar retorno físico, perda declarada e custo do serviço. | Enviar 100 e receber 60 deixa 40 pendentes. Reenviar o registro do retorno mantém as mesmas 40. Um segundo retorno de 40 encerra o saldo físico. |
| 7. Capacidade e reposição (abas 5, 9 e 13) | Identificar peças pela versão da ficha. Registrar movimentos por peça e unidade, incluindo montagem, reserva e perda. Simular capacidade com o menor quociente inteiro entre peças livres e peças exigidas. Para reposição, mostrar consumo por período selecionado, físico, reservado e disponível. | De 40 peças prontas, 30 já usadas e duas por kit, restam cinco montagens se os demais componentes bastarem. Se um componente obrigatório zera, a capacidade cai a zero. Testar o alerta com período, saldo e limite explícitos na simulação. |
| 8. Custos e preços por canal (abas 3, 12 e 15) | Usar a versão da ficha, os preços de compra e os tempos por etapa. Permitir simulações com método de valorização, taxas, impostos, comissão e margem informados. Exibir a memória de cálculo por material e etapa. | Seis minutos de corte a R$ 60/h e três de pintura a R$ 40/h somam R$ 8 de trabalho. Com R$ 12 de material, o custo direto é R$ 20. Em um ensaio por canal, custo de R$ 60 e deduções de 40% sobre o preço resultam em R$ 100. |
| 9. Painel do turno (aba 1) | Começar com ordens, apontamentos e kits conferidos. Acrescentar vendas, compras e capacidade quando cada origem estiver validada. Filtrar por unidade e período e permitir abrir os registros que compõem cada total. | Reconciliar os números do painel com OS, Kanban e extratos após a venda, correção e encerramento do primeiro marco. Testar troca de unidade e acesso parcial. |

## Homologação antes do uso real

Comercial define o evento real de baixa e o tratamento do cancelamento da venda. Compras e Engenharia escolhem o método de valorização da ficha. Estoque define janela e limite de reposição. Produção confirma quando peças entram e saem do saldo livre e quem reconhece perdas em terceiros. Gestão fornece tempos, taxas, tratamento do serviço externo e parâmetros por canal. Até a homologação, essas escolhas são entradas explícitas dos ensaios e das simulações. RH, folha, financeiro e caixa seguem nos sistemas existentes.

Na virada, reconciliar inventários e OS em aberto, ensaiar restauração e repetir a carga para identificar duplicações. Registrar data de corte, responsáveis pelos saldos e revisão aprovada.

## Critério de conclusão de cada entrega

Desenvolvimento começa pelo teste que demonstra o comportamento, verifica a versão resolvida no catálogo, preserva as fronteiras dos módulos e atualiza o OpenAPI quando a API mudar. Para lançamentos, testar autorização por unidade, reenvio após perda de resposta, concorrência, migração dos dados anteriores e reversão da transação em caso de falha. Conferir a jornada pela interface em português.

Em PowerShell 7, executar `./scripts/setup.ps1` e `./scripts/verify.ps1 -Base <SHA da base do PR>`. Para a branch atual, a base é `583b11d`. Exigir ao menos 90% de linhas e branches em cada módulo, com meta de 100%. Registrar comando, resultado, lacunas e próximo teste. O roteiro de regressão começa pela impressão da V1 e pelos quatro cortes no simulador. A jornada transacional continua com a venda de dez dos trinta kits conferidos.

## Entrega local do piloto

As nove etapas estão implementadas na branch `codex/paridade-industrial`. Em **Engenharia**, selecione o produto e a versão publicada para abrir **Planejamento laser**. Em **Ordens de produção**, abra a OS para imprimir a ficha congelada, conferir kits, corrigir a entrada ou encerrar a ordem. O extrato em **Estoque** identifica a OS que liberou a reserva.

**Vendas**, **Compras** e **Terceiros** mantêm o histórico dos lançamentos por unidade. **Planejamento** calcula a capacidade pela peça limitante e simula reposição. **Custos e preços** apresenta os componentes do custo e as deduções por canal. **Painel do turno** permite consultar a origem dos totais. **Permissões** controla as ações individuais na unidade selecionada.

Em 27/11/2026, a verificação sobre a base `583b11d` aprovou os 75 cenários de aceite obrigatórios, incluindo dez jornadas no Chromium. A suíte da interface passou em 63 testes. A cobertura superou o mínimo de 90% de linhas e branches por módulo e nas alterações mensuráveis. O PDF da OS V1 foi conferido em duas páginas após a publicação da V2. Evidências locais em `reports/acceptance.json`, `reports/coverage.json` e `reports/os-v1.pdf`.

O cadastro real dos responsáveis, a reconciliação dos saldos de abertura e a homologação dos parâmetros comerciais e industriais continuam sob responsabilidade das áreas identificadas acima.

[Plano mestre](plano-mestre.md) · [Histórico do piloto](plano-piloto-fabrica.md) · [Catálogo de versões](versoes.md) · [Contrato OpenAPI](openapi.json)
