# ERP Industrial

Monólito Kotlin/Spring Boot, interface React/TypeScript, PostgreSQL com Flyway e login individual pelo Keycloak. A implementação cobre a consulta de equipe, a suspensão da conta, os cinco cadastros de Engenharia e a publicação de composição e roteiro por versão.

## Executar a partir de um checkout limpo

Pré-requisitos: Git, JDK 25 com `JAVA_HOME` configurado, Node 24 com npm, Python 3.10+, PowerShell 7.4+ e Docker com Compose e contêineres Linux. Inicie o Docker antes do setup. A primeira execução baixa as dependências, as imagens e o Chromium. Em Linux, dê permissão de execução ao wrapper com `chmod +x gradlew` se o checkout tiver perdido o modo executável.

```powershell
./scripts/setup.ps1
./scripts/up.ps1
./scripts/verify.ps1
./scripts/down.ps1
```

Abra [o ERP local](http://localhost:18080). Os serviços de desenvolvimento usam as portas de loopback 18080 e 55432. A verificação usa 18081 e 55433, cria banco e realm novos e remove apenas os volumes do projeto efêmero ao terminar. Execute uma verificação por vez nessa máquina. Para comparar um PR, use `./scripts/verify.ps1 -Base <SHA>`. Os resultados ficam em `reports/`, `build/reports/` e `frontend/coverage/`. O GitHub Actions usa os mesmos scripts. O comando de parada preserva os dados de desenvolvimento.

| Conta de demonstração | Jornada |
|---|---|
| `lider` | Em Equipe, consultar `corte` retorna Ana. Consultar `pintura` retorna acesso negado. |
| `admin` | Consultar equipes, manter cadastros, publicar fichas e suspender contas. Em outro perfil de navegador, suspender o líder pelo ID `00000000-0000-4000-8000-000000000001` e informar o motivo. Repetir a consulta na sessão do líder. |
| `operador` | Exercitar a negativa da consulta sem concessão. |

As três contas locais usam a senha de demonstração `demo-industrial`. A configuração do Compose foi preparada para desenvolvimento em loopback. Para repetir a demonstração de suspensão preservando seus dados locais, use a suíte isolada.

## Publicar e comparar

Com a conta de administração, abra Engenharia, carregue os cadastros existentes e crie categoria, unidade com dimensão, matéria-prima com categoria e unidade, produto e peças. Selecione o produto pai, adicione as peças com quantidades por kit, informe as etapas na ordem e os materiais consumidos por produto. Publique e consulte V1. Use **Copiar para rascunho**, altere quantidades ou etapas, publique e consulte V2. As duas publicações incluem as descrições e unidades vigentes quando cada uma foi gravada. A matéria-prima usa a unidade de referência do cadastro; conversões industriais dependem da homologação.

O [índice de documentação](docs/README.md) reúne contratos, decisões, plano de implementação e catálogo de versões.
