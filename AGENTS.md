# Trabalho no ERP Industrial

Comece pelo [índice](docs/README.md), pelo [plano mestre](docs/plano-mestre.md) e pelo [recorte R0–R1](docs/plano-fundacao-acesso-engenharia.md). O código usa inglês e a interface usa português. Cada alteração de regra precisa de exemplo, responsável e aprovação identificável. Os dados do realm local são sintéticos.

Antes de usar uma API, consulte a versão resolvida e a fonte oficial no [catálogo](docs/versoes.md). Preserve as fronteiras dos módulos e o contrato OpenAPI. Comece pelo teste que demonstra o comportamento. Documente regras não óbvias com KDoc/TSDoc conforme o plano mestre.

Use PowerShell 7. Execute `./scripts/setup.ps1` e `./scripts/verify.ps1`. Para reproduzir um PR, passe `-Base <SHA da base>`. Cada módulo exige pelo menos 90% de linhas e branches, com meta de 100%. Registre comando, resultado, lacunas e próximo teste ao interromper uma tarefa. Para retomar Engenharia, por exemplo, localize o ensaio de publicação em `EngineeringTest` e a jornada em `frontend/e2e/engineering.spec.ts`.
