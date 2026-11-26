# Transferir uma instalação existente para MariaDB

O comando de transferência copia as 12 tabelas de negócio do ERP. Isso inclui os vínculos de acesso, os rascunhos, o histórico publicado e a auditoria. Os UUIDs, as referências entre itens, as quantidades no JSON e os instantes UTC com microssegundos acompanham os registros. O Flyway cria e controla seu próprio histórico em cada motor. O Keycloak continua no volume da identidade e as contas conservam o emissor e o sujeito OIDC da origem.

Para uma instalação nova, use diretamente a [subida normal do ERP](../README.md).

## 1. Preparar o corte

Faça o primeiro ensaio em uma cópia. No corte definitivo, pare a API e os demais escritores do PostgreSQL **antes do backup final**. Mantenha a base original e o volume de identidade. Guarde o backup fora dos volumes do Compose. No checkout PostgreSQL, estes comandos usam o nome do projeto local do ERP e evitam passar um dump binário pelo pipeline do PowerShell.

```powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$dump = Read-Host 'Caminho completo de um novo arquivo .dump fora do checkout'
if (Test-Path -LiteralPath $dump) { throw 'Escolha um destino livre para o backup' }
docker compose -p erp-industrial-dev stop api web
docker compose -p erp-industrial-dev exec -T db pg_dump -U erp -d erp -Fc -f /tmp/erp-cutover.dump
docker compose -p erp-industrial-dev cp db:/tmp/erp-cutover.dump $dump
docker compose -p erp-industrial-dev stop db
```

Restaure o arquivo em um **PostgreSQL 17 vazio de ensaio** com espaço para a cópia. O exemplo cria um contêiner novo em loopback na porta 55434. A senha fornecida em `POSTGRES_PASSWORD` vem do ambiente. Se já existir um contêiner com esse nome, identifique a cópia desejada antes de prosseguir.

```powershell
$env:POSTGRES_PASSWORD = Read-Host -MaskInput 'Senha do PostgreSQL de ensaio'
docker run --detach --name erp-pg-cutover -p 127.0.0.1:55434:5432 -e POSTGRES_DB=erp -e POSTGRES_USER=erp -e POSTGRES_PASSWORD postgres:17.9-alpine@sha256:c7526c0f6c3f30260a563d7bcf8ad778effac59a44f8ffa86678c35418338609
docker cp $dump erp-pg-cutover:/tmp/erp.dump
```

Quando `docker exec erp-pg-cutover pg_isready -h 127.0.0.1 -U erp -d erp` indicar que o servidor aceita conexões, restaure a cópia.

```powershell
docker exec erp-pg-cutover pg_restore --exit-on-error --single-transaction --no-owner --no-acl -U erp -d erp /tmp/erp.dump
```

Use o usuário proprietário dos objetos ou uma conta com leitura das tabelas e da sequência `access_audit_id_seq`.

**Instalações anteriores a grupos e unidades.** Na cópia PostgreSQL, aplique primeiro a versão `b1749ffcc515dc4e70f5c90e5deeecebdd3ba446` do ERP. Nesse checkout, configure `DB_URL=jdbc:postgresql://127.0.0.1:55434/erp`, `DB_USER`, `DB_PASSWORD`, `OIDC_ISSUER` e `OIDC_JWKS` com a identidade da instalação. Para a demonstração criada em `2f8fd85`, use `SPRING_FLYWAY_LOCATIONS=classpath:db/legacy,classpath:db/legacy-demo`. Para a instalação anterior sem demonstração, use `classpath:db/legacy`. Com itens no catálogo, defina `ERP_LEGACY_CATALOG_GROUP=mundo-eduk` somente após confirmar a propriedade dos itens. Rode `./gradlew run --args=--server.port=0` (no Windows, `.\gradlew.bat run --args=--server.port=0`) e encerre após a inicialização bem-sucedida. As migrações antigas interrompem o processo quando não há mapeamento conhecido. A transferência aceita a cópia com o escopo por grupo já aplicado, incluindo V5.

## 2. Preparar o MariaDB vazio

No checkout desta branch, use um banco vazio e o histórico principal do Flyway. No Compose da revisão `b1749ff`, o mesmo nome de projeto mantém o volume de identidade `scoped-realm-data`, e o serviço `db` usa um volume próprio do MariaDB. Mantenha a mesma origem pública e o mesmo emissor OIDC nas duas versões.

**Keycloak anterior às unidades.** A revisão `2f8fd85` usava o volume `realm-data`. Para preservar contas e senhas dessa instalação, identifique o volume montado em `/opt/keycloak/data` no contêiner antigo. Acrescente o mapeamento abaixo ao seu `compose.override.yaml` local antes de iniciar a nova identidade. O exemplo usa o nome do projeto de desenvolvimento. Pare o Keycloak antigo antes de montar seu volume no novo contêiner.

```yaml
volumes:
  scoped-realm-data:
    external: true
    name: erp-industrial-dev_realm-data
```

```powershell
$env:ERP_FLYWAY_LOCATIONS = 'classpath:db/migration'
./scripts/setup.ps1
. ./scripts/common.ps1
Build-Erp
docker compose -p erp-industrial-dev up -d --wait db
docker compose -p erp-industrial-dev up -d api
docker compose -p erp-industrial-dev logs api
```

Aguarde o log de inicialização da API e confirme as migrações V1, V2 e V5 bem-sucedidas. Pare a API durante toda a transferência.

```powershell
docker compose -p erp-industrial-dev stop api
```

## 3. Copiar e reconciliar

Use CPython 3.10 a 3.14 e o arquivo de versões dos dois drivers. O exemplo usa PowerShell 7.4+ e um ambiente virtual separado. A porta de destino corresponde ao Compose local. Informe a senha do usuário `erp` do MariaDB. Na configuração sintética de desenvolvimento, o padrão é `local-demo`. [Psycopg](https://pypi.org/project/psycopg-binary/3.2.13/) · [PyMySQL](https://pypi.org/project/PyMySQL/1.1.2/)

```powershell
python -m venv build/migration-env
$py = if ($IsWindows) { './build/migration-env/Scripts/python.exe' } else { './build/migration-env/bin/python' }
& $py -m pip install -r scripts/migration-requirements.txt
$env:ERP_SOURCE_PASSWORD = $env:POSTGRES_PASSWORD
$env:ERP_TARGET_PASSWORD = Read-Host -MaskInput 'Senha do MariaDB de destino'
& $py scripts/migrate_database.py --source-port 55434 --target-port 55432
```

A ferramenta lê um único snapshot do PostgreSQL, grava as tabelas em uma transação InnoDB e compara a contagem e o SHA-256 do conteúdo de cada tabela. A conferência considera todas as colunas importadas, os nulos e as repetições. A capacidade de memória necessária cresce com a maior tabela, em cerca de um hash por linha. O utilitário mostra os totais e hashes ao concluir e preserva o próximo identificador de auditoria, inclusive após saltos na sequência antiga.

Uma falha de dados reverte a transação. A conta de destino precisa de leitura, inserção, atualização e exclusão nos dados da aplicação e permissão de `ALTER` em `access_audit` para alinhar a sequência quando necessário. Esse último ajuste ocorre após a confirmação das linhas. Uma repetição antes de liberar os escritores reconcilia o conteúdo e termina qualquer ajuste pendente. Um destino com conteúdo divergente interrompe a cópia. Corrija divergências em uma cópia controlada da origem e repita em um destino novo. O modo estrito também rejeita identificadores de grupo, unidade, setor ou ação acima de 255 caracteres e cargos acima de 191.

## 4. Liberar o ERP ou retornar ao PostgreSQL

Registre as 12 contagens e hashes. Execute o comando de cópia novamente antes de iniciar a API e confirme os mesmos resultados. Mantenha `ERP_FLYWAY_LOCATIONS=classpath:db/migration` em todas as subidas dessa instalação para evitar a aplicação posterior de sementes de demonstração. Registre essa variável na configuração persistente de implantação.

```powershell
./scripts/up.ps1
```

Com um login existente, confira as unidades liberadas, uma equipe e o conteúdo de uma ficha histórica conhecida. Libere os escritores após o aceite. Para voltar antes da primeira escrita no MariaDB, pare a nova aplicação e reinicie o checkout PostgreSQL anterior com o nome de projeto, volume, emissor e parâmetros Flyway originais. Preserve os dois volumes durante a homologação. Após alterações no MariaDB, uma volta ao PostgreSQL requer conciliar as escritas posteriores ao corte.
