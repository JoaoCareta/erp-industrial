# ERP Industrial

Monólito Kotlin/Spring Boot, interface React/TypeScript, PostgreSQL com Flyway e login individual pelo Keycloak. A implementação cobre a consulta de equipe, o bloqueio de contas suspensas, os cinco cadastros de Engenharia e a publicação de composição e roteiro por versão.

## Executar a partir de um checkout limpo

O frontend ([frontend/](frontend/)), a API ([src/main/kotlin/erp/](src/main/kotlin/erp/)), as [migrações](src/main/resources/db/migration/) e a [infraestrutura](infra/) são versionados juntos. O [Compose](compose.yaml) sobe Nginx, API, PostgreSQL e Keycloak. O script de subida primeiro gera os arquivos estáticos e a distribuição JVM que os contêineres montam.

**Homologação compartilhada.** O Compose fornecido serve para demonstração local. Para hospedar em outro domínio, a Infra precisa configurar HTTPS, a origem pública no Keycloak, os redirecionamentos do cliente e o mesmo emissor OIDC no ERP. Configure segredos próprios, armazenamento persistente e backup do banco e da identidade. O realm e as migrações em `db/demo` contêm contas e dados sintéticos. A prontidão da API pode ser conferida em `/api/ready`.

Pré-requisitos: Git, JDK 25 com `JAVA_HOME` configurado, Node 24 com npm, Python 3.10+, PowerShell 7.4+ e Docker com Compose e contêineres Linux. Inicie o Docker antes do setup. A primeira execução baixa as dependências, as imagens e o Chromium. Em Linux, dê permissão de execução ao wrapper com `chmod +x gradlew` se o checkout tiver perdido o modo executável.

```powershell
./scripts/setup.ps1
./scripts/up.ps1
./scripts/verify.ps1
./scripts/down.ps1
```

Abra [o ERP local](http://localhost:18080). Os serviços de desenvolvimento usam as portas de loopback 18080 e 55432. A verificação usa 18081 e 55433, cria banco e realm novos e remove apenas os volumes do projeto efêmero ao terminar. Execute uma verificação por vez nessa máquina. Para comparar um PR, use `./scripts/verify.ps1 -Base <SHA>`. Os resultados ficam em `reports/`, `build/reports/` e `frontend/coverage/`. O GitHub Actions usa os mesmos scripts. O comando de parada preserva os dados de desenvolvimento.

## Checks de merge na master

Cada PR executa os testes de front-end (Vitest) e back-end (JUnit) em jobs independentes. No Kotlin, marque os testes unitários com `@Tag("unit")` e os de arquitetura com `@Tag("architecture")`. Os demais rodam na integração com PostgreSQL. Para rodar somente os unitários, use `./gradlew test -PtestSuite=unit` e `npm test` na pasta `frontend`.

O check `Coverage >= 90%` compara as linhas executáveis alteradas no Kotlin e no TypeScript com o SHA da base do PR. Ele combina as três execuções do JaCoCo e lê o LCOV do Vitest. Cada módulo precisa atingir 90% de linhas e de branches, no total e no diff. Uma linha nova sem cobertura reprova o módulo se for a única linha executável alterada nele.

A proteção da `master` exige os dois checks unitários, a cobertura, a verificação final e a análise automática do [projeto no SonarQube Cloud](https://sonarcloud.io/project/overview?id=JoaoCareta_erp-industrial). O relatório numérico de cobertura fica no artefato `coverage` do GitHub Actions.

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
