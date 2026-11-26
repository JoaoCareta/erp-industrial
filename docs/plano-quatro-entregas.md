# Plano de implementação enquanto a fábrica valida a OS

Proposta técnica de 26/11/2026. A revisão `2f8fd85` fornece a instalação de origem para o ensaio de atualização. A revisão `e2ea03d` reúne o portal por unidade e a Engenharia que servirão de ponto de partida para os quatro PRs. A equipe técnica responde pelos ensaios com dados sintéticos. A aprovação das regras industriais segue o [recorte de discovery](plano-fundacao-acesso-engenharia.md).

| Ordem sugerida | Entrega demonstrável | Dependência para começar |
|---|---|---|
| 1 | Atualizar uma base anterior e reabrir a equipe e a ficha | Revisão de origem identificada e PostgreSQL descartável |
| 2 | Dois usuários se alternarem no mesmo posto | Fluxo atual de login e contas do realm de demonstração |
| 3 | Conferir um arquivo de materiais na tela e localizar as linhas a revisar | Leitura do catálogo do grupo pela unidade autorizada |
| 4 | Ler os materiais de uma versão específica como consumidor de Estoque | Contrato de publicações de Engenharia |

Começar pelo PR 1 porque ele verifica a compatibilidade das migrações já alteradas no checkout. O PR 2 pode avançar em paralelo. Os PRs 3 e 4 podem compartilhar o exemplo de material e unidade, mas cada um deve preparar os próprios dados e passar isoladamente.

## 1. Atualizar uma base com histórico

**Primeiro teste.** Em banco efêmero, executar a aplicação da revisão `2f8fd85` com suas migrações originais e seus dados de demonstração. Consultar a equipe de Corte como líder, publicar uma ficha V1 e guardar as respostas de referência. Subir a aplicação candidata sobre o mesmo banco. A primeira divergência esperada é a validação dos checksums pelo Flyway. V1 e V2 foram alteradas no checkout, assim como V3 no perfil de demonstração.

**Implementação.** Preservar os arquivos das migrações já aplicadas e introduzir as transformações em novas versões. Ordenar a criação das estruturas de grupo e fábrica, o preenchimento dos vínculos e só então as restrições que os exigem. Conferir a ordem em relação à renomeação de fábrica e à remoção da permissão de suspensão do administrador. Usar um mapeamento explícito para as contas, setores e cadastros da amostra. Para dados cuja origem não determine o grupo ou a unidade, interromper a atualização com diagnóstico antes de atribuir acesso. Evitar reparo de checksum e recriação do banco como mecanismos de atualização.

**Aceite.** Pela API candidata, o líder recupera a equipe esperada em Corte e recebe negativa fora do seu alcance. A V1 preserva identificadores, peças por kit, materiais por produto, unidades, ordem das etapas, autor e instante. O administrador do grupo fica com as concessões previstas no checkout. Repetir a subida mantém uma publicação e os mesmos vínculos. Exercitar também a instalação limpa e validar a sequência de migrações com e sem os dados de demonstração. Registrar o SHA de origem separadamente da base usada para medir a cobertura do PR.

Pontos de entrada do ensaio. [Migrações](../src/main/resources/db/migration/) · [Dados sintéticos](../src/main/resources/db/demo/) · [Verificação atual](../scripts/verify.ps1)

## 2. Trocar de operador no mesmo posto

**Primeiro teste.** Em uma única aba e no mesmo perfil do navegador, entrar como `regional`, selecionar Araçatuba e conferir o nome de um membro da equipe. Acionar **Sair**, voltar ao ERP e verificar que o Keycloak exige autenticação. Entrar como `operador` e conferir a mensagem “Nenhuma unidade liberada”. Manter cookies, armazenamento local e histórico durante o ensaio.

**Implementação.** Exercitar primeiro o logout OIDC existente e a preferência de unidade já vinculada à conta. Se o teste revelar dados anteriores na tela, localizar se vieram de uma resposta pendente, do estado da interface ou de uma página restaurada pelo navegador e corrigir a origem. Incluir a jornada na matriz de aceite.

**Aceite.** Voltar e recarregar a página após a troca mantém a equipe anterior inacessível. Consultar a equipe de Araçatuba com a credencial do operador recebe 403 e não expõe os membros. Em novo login do regional, a unidade lembrada só abre se a conta ainda tiver autorização para ela.

Pontos de entrada da jornada. [Login e saída](../frontend/src/main.tsx) · [Seleção de unidade](../frontend/src/Workspace.tsx) · [Testes de acesso no navegador](../frontend/e2e/access.spec.ts)

## 3. Conferir materiais antes de importar

**Primeiro teste.** Preparar um catálogo do grupo com o material `MAD-01` na unidade `PL` e a unidade adicional `KG`. Usar um CSV UTF-8 de ensaio com cabeçalho e as colunas código, descrição e unidade. Comparar por código no catálogo autorizado. Preservar a numeração do arquivo para que a pessoa consiga corrigir a origem.

| Linha do arquivo | Exemplo sintético | Resultado que a tela deve explicar |
|---|---|---|
| 2 | MAD-01, Madeira, PL | Material e unidade conferem |
| 3 e 4 | EVA-02, EVA, PL em ambas | Código repetido. Identificar as duas linhas |
| 5 | TIN-03, Tinta, LT | Unidade LT desconhecida no catálogo do grupo |
| 6 | EVA-04, EVA azul, PL | Código de material novo, unidade conhecida |

Em um segundo arquivo, uma linha isolada com `MAD-01` e `KG` deve indicar divergência da unidade cadastrada. Para exercitar ambiguidade, cadastrar dois materiais de códigos distintos com a descrição “Madeira” e fornecer essa descrição com o código em branco. O relatório deve indicar a linha, pedir o código e deixar a correspondência em aberto.

**Implementação.** Começar pela comparação das linhas. Depois ligar a leitura do arquivo e o relatório a uma tela de Engenharia usando as consultas de materiais e unidades já protegidas por `engineering.read`. Exibir por linha o valor recebido, o resultado e o motivo. Tratar coluna obrigatória ausente e mostrar um erro de leitura quando o arquivo estiver malformado. O formato do ensaio é uma escolha técnica reversível. O layout do arquivo da fábrica será validado com uma amostra real.

**Aceite.** Reprocessar o arquivo sobre o mesmo catálogo produz o mesmo relatório e mantém os registros originais. Códigos iguais em outro grupo não participam da comparação. Uma conta sem leitura do catálogo não consegue consultar os resultados relativos àquele grupo. O usuário consegue identificar cada linha a corrigir sem gravar cadastros.

Pontos de entrada da prévia. [Catálogo de Engenharia](../src/main/kotlin/erp/engineering/Catalog.kt) · [Interface de Engenharia](../frontend/src/engineering/Engineering.tsx) · [Contrato HTTP](openapi.json)

## 4. Ensaiar o consumo da ficha por Estoque

**Primeiro teste.** Criar um consumidor na suíte de contrato que consulte `GET /api/units/{plant}/products/{product}/versions/{version}`. Publicar V1 com 0,50 placa por produto e V2 com 0,75 do mesmo material. Pedir explicitamente a V1 depois de publicar a V2. Ler o UUID do material, o UUID da unidade e a quantidade decimal usando somente a resposta pública. Conferir os identificadores com as cópias históricas de material e unidade na publicação.

**Implementação.** Usar as operações públicas de Engenharia para preparar o cenário. Complementar o teste de rotas e verbos com asserções sobre o conteúdo que o consumidor precisa. Começar pelo contrato existente. Uma divergência deve produzir um teste de regressão e, se exigir alteração de HTTP, atualização correspondente do OpenAPI.

**Aceite.** Cada versão retorna sua própria quantidade com a mesma base por produto. Renomear ou inativar o cadastro mantém a V1 legível com a descrição e a unidade históricas. Uma versão inexistente ou um produto de outro grupo consultado pela unidade própria retorna 404. Uma unidade sem autorização retorna 403. O consumidor permanece um teste e dispensa tabelas de Estoque, saldo, reserva ou OS para esta entrega.

Pontos de entrada do contrato. [Publicação e consulta](../src/main/kotlin/erp/engineering/Sheets.kt) · [Cenários de publicação](../src/test/kotlin/erp/PublicationTest.kt) · [Teste de contrato atual](../src/test/kotlin/erp/ContractTest.kt)

## Revisão e retomada

Em cada PR, registrar o exemplo sintético, o teste inicial, o resultado observado e a evidência de aceite. Incluir os novos cenários obrigatórios no [inventário de aceite](../scripts/acceptance.py). Rodar `./scripts/setup.ps1` e `./scripts/verify.ps1 -Base <SHA da base do PR>` em PowerShell 7. Aplicar os mínimos do projeto por módulo e no diff, com 90% de linhas e branches e meta de 100%. Todos os cenários críticos devem passar.

A equipe pode demonstrar os quatro resultados antes do retorno do cliente. Operador, líder e Engenharia ainda precisam confirmar a OS de referência, unidades, precisão, conversões e perdas. O responsável por acessos valida a matriz real de concessões. Reserva, valorização do estoque e gravação de uma importação real ficam para entregas que registrem o exemplo, o responsável e a decisão correspondente.

**Verificação inicial em 26/11/2026.** Os comandos `./scripts/setup.ps1` e `./scripts/verify.ps1 -Base 2f8fd85` concluíram com sucesso. Passaram os 19 cenários de aceite existentes (7 de integração, 1 de contrato, 6 de interface e 5 de ponta a ponta). Todos os módulos atingiram os mínimos de cobertura aplicáveis. A suíte atual parte de banco novo. A atualização sobre uma base anterior e os demais cenários propostos ainda precisam de testes próprios.


**Resultado da implementação em 26/11/2026.** O primeiro ensaio reproduziu a recusa por checksum ao iniciar a aplicação candidata sobre o banco da revisão de origem. A migração preservou a publicação e a equipe em duas inicializações. A verificação local com `./scripts/verify.ps1 -Base e2ea03d` terminou com sucesso. Passaram 25 cenários de aceite (2 de atualização, 7 de integração, 2 de contrato, 8 de interface e 6 de ponta a ponta). A prévia foi exercitada duas vezes no navegador com o mesmo arquivo. O ensaio de Estoque leu as versões pela API após a alteração dos cadastros. O procedimento de atualização e o formato do arquivo estão no [README](../README.md).

**Próximo teste de homologação.** Quando a fábrica fornecer a amostra anonimizada, repetir a conferência de materiais e confrontar cada divergência com o responsável pelo cadastro. O mapeamento de um catálogo real para um grupo requer confirmação explícita antes da atualização.
