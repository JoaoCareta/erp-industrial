# Documentação do ERP Industrial

- [Preparar, subir e verificar o projeto](../README.md)
- [Plano mestre, glossário dos contextos e decisões arquiteturais](plano-mestre.md)
- [Requisitos industriais e vínculos às fórmulas do Excel](aderencia-requisitos-industriais.md)
- [Escopo das três entregas, matriz de aceite e decisões em aberto](plano-fundacao-acesso-engenharia.md)
- [Próximas entregas do piloto na fábrica toda](plano-piloto-fabrica.md)
- [Sequência de implementação das funções da planilha após a PR #5](plano-paridade-industrial.md)
- [Plano anterior e resultado das quatro entregas de 26/11](plano-quatro-entregas.md)
- [Transferir e conferir os dados de uma instalação PostgreSQL no MariaDB](migracao-mariadb.md)
- [Publicação na hospedagem da Mundo Eduk e deploy após merge](deploy.md)
- [Versões e referências oficiais](versoes.md)
- [Contrato HTTP OpenAPI](openapi.json)

**Fronteiras.** Acesso mantém contas, setores, concessões e auditoria. Engenharia mantém cadastros, rascunhos e publicações. Os identificadores UUID de material e unidade fazem parte do contrato com Estoque. Uma ficha publicada identifica um produto e uma versão numérica. Cada linha de peça representa quantidade por kit e contém as etapas em ordem. Cada linha de material representa consumo por produto na unidade de referência. Os registros publicados guardam cópias das descrições e unidades.

**Homologação.** Os exemplos de Corte e Pintura e o roteiro do kit são sintéticos. As quantidades industriais, dimensões, matriz de concessões e papéis para publicação permanecem sujeitos à validação de D0 pela fábrica.

**Estoque.** Engenharia fornece a referência de material e unidade. Estoque mantém o saldo por fábrica e o extrato de inventário inicial, entradas e estornos. Cada comando de lançamento tem uma chave própria para reenvio. [Roteiro das 100 placas](../README.md#conferir-o-estoque-no-ambiente-de-demonstração)

**Produção.** A OS fixa uma ficha publicada, suas peças e o roteiro no momento da criação. A liberação confirma as reservas de todos os materiais da fábrica em uma única transação. O estoque disponível corresponde ao físico menos o reservado. [Criar e liberar a OS da Vila Natalina](../README.md#criar-e-liberar-a-os-da-vila-natalina)

**Kanban e apontamento.** Produção guarda a quantidade processada por peça e etapa. Estoque registra o consumo efetivo contra a reserva da ordem. Ambos são confirmados na mesma transação. [Acompanhar a OS no Kanban](../README.md#acompanhar-a-os-no-kanban)
