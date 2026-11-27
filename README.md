# ERP Industrial

Monólito Kotlin/Spring Boot, interface React/TypeScript, MariaDB com Flyway e login individual pelo Keycloak. A implementação cobre acesso por unidade, fichas versionadas, inventário, reserva de materiais e acompanhamento da execução das ordens de produção por etapa.

## Executar a partir de um checkout limpo

O frontend ([frontend/](frontend/)), a API ([src/main/kotlin/erp/](src/main/kotlin/erp/)), as [migrações](src/main/resources/db/migration/) e a [infraestrutura](infra/) são versionados juntos. O [Compose](compose.yaml) sobe Nginx, API, MariaDB e Keycloak. O script de subida primeiro gera os arquivos estáticos e a distribuição JVM que os contêineres montam.

**Homologação compartilhada.** O Compose fornecido serve para demonstração local. Para hospedar em outro domínio, a Infra precisa configurar HTTPS, a origem pública no Keycloak, os redirecionamentos do cliente e o mesmo emissor OIDC no ERP. Configure segredos próprios, armazenamento persistente e backup do banco e da identidade. O realm e as migrações em `db/demo` contêm contas e dados sintéticos. A prontidão da API pode ser conferida em `/api/ready`.

Pré-requisitos: Git, JDK 25 com `JAVA_HOME` configurado, Node 24 com npm, Python 3.10+, PowerShell 7.4+ e Docker com Compose e contêineres Linux. Inicie o Docker antes do setup. A primeira execução baixa as dependências, as imagens e o Chromium. Em Linux, dê permissão de execução ao wrapper com `chmod +x gradlew` se o checkout tiver perdido o modo executável.

```powershell
./scripts/setup.ps1
./scripts/up.ps1
./scripts/verify.ps1
./scripts/down.ps1
```

Abra [o ERP local](http://localhost:18080). Os serviços de desenvolvimento usam as portas de loopback 18080 e 55432. A verificação usa 18081 e 55433, cria banco e realm novos e remove apenas os volumes do projeto efêmero ao terminar. Execute uma verificação por vez nessa máquina. Para comparar um PR, use `./scripts/verify.ps1 -Base <SHA>`. Os resultados ficam em `reports/`, `build/reports/` e `frontend/coverage/`. O GitHub Actions usa os mesmos scripts. O comando de parada preserva os dados de desenvolvimento.

### Tema de acesso da estação

O Compose disponibiliza o tema `estacao` no Keycloak e o realm de demonstração o seleciona na primeira importação. Em uma instalação existente, inclusive na hospedagem, copie a pasta [estacao](infra/themes/estacao/) para o diretório de temas do Keycloak e selecione **estacao** em **Realm settings → Themes → Login theme** no realm industrial. Em **Localization**, configure português do Brasil como idioma padrão. O pacote de interface do ERP e o tema do servidor de identidade têm destinos distintos. [Temas do Keycloak](https://www.keycloak.org/ui-customization/themes)

### Conferir o estoque no ambiente de demonstração

Entre como `admin` e selecione **Estoque**. Se o catálogo estiver vazio, cadastre em Engenharia uma categoria, uma unidade de medida para placas e uma matéria-prima vinculada a ambas. Em Estoque, escolha o material e registre **100** em **Quantidade inicial**. A tela mostra o saldo físico, o reservado, o disponível e o extrato da fábrica selecionada.

Se a confirmação se perder durante o envio, **Reenviar lançamento** usa a mesma operação. O inventário de 100 placas deixa um único movimento. Uma entrada posterior de 12 leva o saldo a 112. Estornar essa entrada acrescenta um movimento de −12 ligado à origem e devolve o saldo a 100. As permissões `stock.read` e `stock.write` seguem o escopo de unidade da conta. A migração de demonstração concede consulta e escrita ao administrador e consulta ao regional. A definição dos responsáveis da fábrica continua com a direção.

### Criar e liberar a OS da Vila Natalina

A demonstração usa a **Vila Natalina 1 – Vermelha (Montagem Interna)**. Na planilha `ERP_Fabrica_Master_Menus_Completos.xlsx`, a linha 5 de **3. Ficha Tecnica (BOM)** informa o consumo por kit e **14. Planejamento Laser PCP**, células C3:C4, identifica a variante e o lote de 150 kits. O ensaio reproduz as peças e etapas das linhas 7–18 de **2. Estrutura Roteiros**. As linhas 4–6 repetem as três primeiras peças. Os saldos iniciais abaixo pertencem à demonstração.

| Material da ficha | Por kit | Saldo físico inicial | Reserva para 150 kits | Disponível após liberar |
|---|---:|---:|---:|---:|
| Placa MDF 2,5mm UF Branca | 0,20 PL | 100 PL | 30 PL | 70 PL |
| Placa MDF 2,5mm UF Vermelha | 0,13333 PL | 100 PL | 19,9995 PL | 80,0005 PL |
| Placa MDF 2,5mm UF Verde | 0,0164 PL | 100 PL | 2,46 PL | 97,54 PL |
| Caixa 29x18x11 | 1 CX | 150 CX | 150 CX | 0 CX |

1. Com a ficha publicada em Engenharia e os materiais disponíveis no Estoque da unidade, abra **Ordens de produção → Nova OS**. Selecione o produto, a versão da ficha e 150 kits. Clique em **Criar OS**. O rascunho mostra as quantidades previstas e o roteiro de cada peça. O estoque continua integralmente disponível.
2. Clique em **Liberar OS → Confirmar liberação**. A ordem passa a **Liberada** quando todos os materiais forem reservados. Abra **Estoque** e escolha a placa branca para conferir 100 físicas, 30 reservadas e 70 disponíveis. A OS preserva a versão da criação se Engenharia publicar outra ficha.
3. Na demonstração, `admin` pode criar e liberar. Na fábrica, a liberação cabe à direção. As concessões `production.read`, `production.create` e `production.release` são verificadas na unidade a cada operação. Uma reserva acima do saldo disponível mantém a OS em rascunho e permite nova tentativa depois de repor o material.

O [teste da Vila Natalina](frontend/e2e/production.spec.ts) prepara a ficha e o estoque no ambiente de verificação, cria e libera a OS pela interface e confere os quatro materiais. O [teste em MariaDB](src/test/kotlin/erp/ProductionOrderTest.kt) também cobre o exemplo sintético de 100 carrinhos a 0,30 placa por kit.

### Conferir kits acabados da OS

Em **Ordens de produção**, abra a OS liberada e use **Conferência de kits → Conferir kits**. Informe os kits acabados que foram conferidos e confirme a entrada. Em uma ordem de 150, a primeira entrada de 30 deixa 120 por conferir. O painel exibe a quantidade recebida nesta ordem e o estoque do produto na fábrica. Atribua a permissão `production.receive` ao conferente definido pela fábrica.

### Acompanhar a OS no Kanban

Abra **Kanban** para consultar as OS liberadas na fábrica ou **Acompanhar etapas** dentro de uma OS para ver suas peças. Cada cartão identifica a ordem, a peça e a etapa do roteiro que estava publicado quando a ordem foi criada. Um lote parcial pode estar em duas etapas ao mesmo tempo.

No exemplo de 150 kits da Vila Natalina, a ficha prevê duas Casinhas Brancas por kit. Há 300 para cortar. Abra o cartão **Casinha Branca** na coluna **Corte Laser**. O ensaio usa **60 peças** e consumo medido de **12 placas de MDF branco**. As 60 peças são uma quantidade escolhida para a demonstração. Informe o consumo de material quando ele ocorrer na etapa.

| Depois de registrar o corte | Resultado |
|---|---:|
| Casinhas ainda disponíveis no corte | 240 peças |
| Casinhas disponíveis para limpeza | 60 peças |
| Placas brancas físicas na fábrica | 88 PL |
| Reserva restante de placas brancas desta OS | 18 PL |
| Placas brancas disponíveis na fábrica | 70 PL |

O apontamento identifica a conta, o instante, a peça, a etapa e a quantidade. O consumo aparece no extrato do material com vínculo à OS e ao apontamento. Reenviar a mesma operação preserva os saldos e o histórico. O corte isolado mantém a quantidade de kits acabados produzidos em zero. A consulta exige `production.read` e o apontamento exige também `production.report`. No piloto, a conta de demonstração tem essa concessão. A atribuição aos operadores reais depende da definição da fábrica.

## Checks de merge na master

Cada PR executa os testes de front-end (Vitest) e back-end (JUnit) em jobs independentes. No Kotlin, marque os testes unitários com `@Tag("unit")` e os de arquitetura com `@Tag("architecture")`. Os demais rodam na integração com MariaDB. Para rodar somente os unitários, use `./gradlew test -PtestSuite=unit` e `npm test` na pasta `frontend`.

O check `Coverage >= 90%` compara as linhas executáveis alteradas no Kotlin e no TypeScript com o SHA da base do PR. Ele combina as três execuções do JaCoCo e lê o LCOV do Vitest. Cada módulo precisa atingir 90% de linhas e de branches, no total e no diff. Uma linha nova sem cobertura reprova o módulo se for a única linha executável alterada nele.

A proteção da `master` exige os dois checks unitários, a cobertura, a verificação final e a análise automática do [projeto no SonarQube Cloud](https://sonarcloud.io/project/overview?id=JoaoCareta_erp-industrial). O relatório numérico de cobertura fica no artefato `coverage` do GitHub Actions.

Após o merge de um PR na `master`, a pipeline verifica o commit integrado e publica os artefatos aprovados na hospedagem da Mundo Eduk. O primeiro corte para MariaDB e a configuração do ambiente `production` têm um [roteiro de publicação](docs/deploy.md).

## Grupos, unidades e cargos

Cada conta pertence a um grupo. Após o login, o ERP abre a única fábrica liberada ou solicita a escolha entre as unidades autorizadas. A última seleção é lembrada por conta neste navegador e validada novamente na entrada. O cabeçalho identifica grupo e unidade. Na tela Equipe, um único setor carrega automaticamente. Quando há vários, a pessoa escolhe o setor.

| Conta local | Grupo e alcance de demonstração |
|---|---|
| `lider` | Mundo Eduk. Entra diretamente na equipe de Corte e vê Ana. |
| `admin` | Administrador do grupo Mundo Eduk. Consulta equipes, mantém cadastros e fichas. |
| `operador` | Mundo Eduk. Exemplo de conta ainda sem unidade liberada. |
| `lider-birigui` e `lider-aracatuba` | Grupo de demonstração. Cada líder vê apenas o Corte da própria fábrica. |
| `gerente-birigui` | Gerente de Birigui. Consulta equipes dessa unidade e o catálogo do grupo. |
| `regional` | Gerente regional com duas atribuições explícitas. Pode alternar entre Birigui e Araçatuba para consultar as equipes. |

**Configuração.** A tabela `role_action` define o que cada cargo faz. Em `assignment`, uma atribuição com unidade vale naquela fábrica, e o setor opcional restringe a consulta de equipe. Uma atribuição de grupo vale nas unidades daquele grupo. Para dar acesso regional, atribua o cargo às unidades escolhidas. Uma nova fábrica não é adicionada ao alcance regional automaticamente. A lotação em uma equipe é registrada separadamente em `team_member`. O cadastro de cargos e atribuições nesta entrega é feito no banco.

A autorização é lida do banco a cada chamada. Cadastros e fichas são compartilhados dentro do grupo. Alterações nesse catálogo exigem concessão de grupo. A gestão de acessos fica reservada ao futuro portal interno de staff. A edição e a publicação são permissões distintas. Os nomes de cidades pertencem ao segundo cliente fictício da demonstração.

As contas locais usam a senha de demonstração `demo-industrial`. A configuração do Compose foi preparada para desenvolvimento em loopback. Para repetir a demonstração de suspensão preservando seus dados locais, use a suíte isolada.

## Publicar e comparar

Com a conta de administração, abra Engenharia e escolha um produto para consultar sua última ficha publicada. Use **Novo** para cadastrar um produto. Na composição, busque peças e matérias-primas por código ou nome. Use **+** para adicionar uma linha e selecione o tipo de item. Marque as etapas de cada peça e arraste os retângulos na prévia para ordenar o roteiro. Com o teclado, use as setas esquerda e direita sobre uma etapa. Publique e consulte V1. Use **Editar composição**, altere quantidades ou etapas, publique e consulte V2. As duas publicações incluem as descrições e unidades vigentes quando cada uma foi gravada. A matéria-prima usa a unidade de referência do cadastro; conversões industriais dependem da homologação.

O [índice de documentação](docs/README.md) reúne contratos, decisões, plano de implementação e catálogo de versões.

## Migrar uma instalação PostgreSQL

O Compose inicia o MariaDB em um volume próprio. Para conservar contas, permissões, cadastros, rascunhos e publicações de um PostgreSQL existente, siga o [procedimento de transferência e conferência](docs/migracao-mariadb.md) antes de abrir o ERP para escrita. O procedimento também cobre a instalação anterior à divisão por grupos e unidades.

## Conferir um arquivo de materiais

Em **Engenharia → Prévia de materiais**, abra um arquivo CSV UTF-8 com o cabeçalho `código,descrição,unidade`. Separe os campos por vírgula e use aspas duplas em descrições que contenham vírgulas. A tela compara as linhas com o catálogo autorizado do grupo e indica duplicidades e divergências. A conferência é somente leitura.
