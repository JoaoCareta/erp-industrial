# Publicação da Mundo Eduk

O site usa SSH na porta 55, Apache para a interface, uma API Java e Keycloak. Os bancos PostgreSQL da instalação anterior se chamam `erp` e `identity`. A transferência para MariaDB se aplica a `erp`. O Keycloak continua usando `identity` e o emissor `https://mundoeduk.lufan.com.br/auth/realms/industrial`. [Mundo Eduk](https://mundoeduk.lufan.com.br/)

## Primeiro deploy com MariaDB

1. Após a aprovação do PR da migração e o merge na branch padrão (`master`), identifique o SHA integrado. Na execução de **Verificação do ERP** desse SHA, confira o resultado dos testes, inclusive os dois ensaios de atualização. Baixe os artefatos `api` e `web` da mesma execução. O tar de `api` contém a distribuição JVM com `bin/` e `lib/`. O artefato `web` contém `index.html` e `assets/`.
2. Na conta de hospedagem, identifique a configuração efetiva da API, a porta do PostgreSQL, o diretório da distribuição carregada, o document root do domínio e o comando que reinicia somente a API. Registre o destino atual da API e guarde uma cópia do frontend para retorno. Provisione um banco MariaDB vazio e um usuário com acesso a esse banco. Confira a versão da hospedagem contra a versão exercitada pela pipeline e ensaie as migrações antes da janela de corte.
3. Interrompa as escritas do ERP e faça um backup final de `erp` com `pg_dump -Fc`. Confira a restauração em uma base separada. Mantenha PostgreSQL, o banco `identity`, o Keycloak e os arquivos de configuração da conta em operação. Na cópia restaurada, aplique a atualização de grupos e unidades se a instalação for anterior a essa divisão. [Procedimento de transferência](migracao-mariadb.md)
4. Prepare o MariaDB vazio executando a distribuição candidata com a URL `jdbc:mariadb://HOST:PORTA/BANCO`, as credenciais do novo banco e `SPRING_FLYWAY_LOCATIONS=classpath:db/migration`. Para essa inicialização, mantenha a API fora do tráfego público e use uma porta local livre. Após o Flyway aplicar V1, V2 e V5, pare a instância de preparação.
5. Instale as dependências de `scripts/migration-requirements.txt` em um ambiente Python 3.10–3.14 com acesso aos dois servidores. Execute `scripts/migrate_database.py` com os hosts, portas, usuários e nomes de banco da instalação. As senhas vêm de `ERP_SOURCE_PASSWORD` e `ERP_TARGET_PASSWORD`. Repita o comando com as escritas ainda suspensas e confira as 12 contagens e hashes. Guarde o relatório junto ao backup.
6. Instale a distribuição aprovada fora do document root. Faça o caminho de bibliotecas usado pelo lançador Java apontar, por link simbólico, para a `lib/` dessa distribuição. Preserve o alvo anterior para recuperação. Atualize a configuração **da API** com as credenciais MariaDB e o perfil Flyway principal. Reinicie a API e publique a interface preservando `.htaccess` e o encaminhamento de `/api/` e `/auth/`. Valide a prontidão, o login, a equipe e uma ficha publicada antes de reabrir as escritas. O retorno após a primeira nova escrita exige reconciliação dos registros posteriores ao corte.

Inclua o MariaDB no backup diário e confira uma restauração. O backup anterior do PostgreSQL continua necessário para o banco de identidade.

## Deploys seguintes pelo GitHub Actions

O job **Deploy ERP** recebe os mesmos artefatos usados pela verificação do SHA integrado. A execução de `push` na `master` aguarda **Verificação final** e confirma pela API do GitHub qual PR introduziu o commit antes de acessar o ambiente `production`. Os deploys usam uma fila compartilhada. Uma execução antiga que termine depois de uma publicação mais recente não deve substituir a versão em uso. [Workflow](../.github/workflows/verify.yml)

O servidor consulta o workflow por HTTPS com um token fine-grained limitado a este repositório e à permissão Actions de leitura. Guarde-o em `~/.config/erp-industrial/actions-token` com modo 600 e renove-o antes do vencimento. Instale `scripts/pull_release.py` e `scripts/deploy_release.py` em `~/.local/lib/erp-industrial/`. Copie as unidades `infra/erp-pull-release.{service,timer}` para `~/.config/systemd/user/`, execute `systemctl --user daemon-reload` e `systemctl --user enable --now erp-pull-release.timer`.

Na conta SSH, instale `~/.config/erp-industrial/deploy.json` com os caminhos absolutos identificados no primeiro deploy. `api_lib` é o link de bibliotecas que a API em execução usa. `web_root` é o diretório do domínio que contém o `index.html`. `restart_api` contém o executável e seus argumentos para reiniciar somente a API com a configuração da hospedagem. Se o serviço usa o lançador do Gradle, o comando de reinício deve resolver o alvo de `api_lib` e executar o `../bin/erp-industrial` da mesma distribuição. Assim, a lista de JARs acompanha a versão publicada. O formato abaixo usa marcadores que devem ser substituídos pelos valores reais.

```json
{
  "api_lib": "/CAMINHO/DA/API/lib",
  "web_root": "/DOCUMENT_ROOT/DO/DOMINIO",
  "restart_api": ["/CAMINHO/DO/CONTROLE-DA-API", "restart"]
}
```

O servidor confere o SHA-256 do arquivo baixado, ativa a distribuição e registra o SHA, a tentativa e o ID do artefato em `/erp-release.json`. O job compara esse recibo com a execução em andamento e verifica a API, o emissor e os arquivos públicos da interface. A conta precisa de Python 3 no servidor, de acesso de escrita às distribuições e ao document root, e de permissão para reiniciar a própria API. Confira o resultado em **Actions → Verificação do ERP → Deploy ERP** e no histórico do ambiente **production**. [Prontidão da API](https://mundoeduk.lufan.com.br/api/ready) · [Emissor OIDC](https://mundoeduk.lufan.com.br/auth/realms/industrial/.well-known/openid-configuration)

Se alguma verificação pública falhar, o instalador restaura a API e o índice anterior da interface. As migrações SQL já aplicadas continuam no MariaDB. Antes de integrar uma alteração de esquema, verifique no ensaio que a versão anterior da API ainda consegue usar o esquema atualizado.

## Registro de validação em 26/11/2026

`python -m unittest discover -s scripts -p 'test_*release.py' -v` passou nos 16 testes de identificação do PR, preparação e envio do pacote, ativação e recuperação com falhas simuladas. `python scripts/catalog.py` validou os 37 componentes do catálogo. No Windows, `./scripts/setup.ps1` e `./scripts/verify.ps1 -Base ca9d9a4` encontraram acesso negado ao Docker Desktop. O próximo teste é executar a verificação completa no GitHub Actions e conferir os artefatos da migração. A ativação por SSH depende dos caminhos e do comando de reinício confirmados na hospedagem.
