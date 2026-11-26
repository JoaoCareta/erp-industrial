# Documentação do ERP Industrial

- [Preparar, subir e verificar o projeto](../README.md)
- [Plano mestre, glossário dos contextos e decisões arquiteturais](plano-mestre.md)
- [Requisitos industriais e vínculos às fórmulas do Excel](aderencia-requisitos-industriais.md)
- [Escopo das três entregas, matriz de aceite e decisões em aberto](plano-fundacao-acesso-engenharia.md)
- [Próximas quatro entregas enquanto a fábrica valida a OS de referência](plano-quatro-entregas.md)
- [Versões e referências oficiais](versoes.md)
- [Contrato HTTP OpenAPI](openapi.json)

**Fronteiras.** Acesso mantém contas, setores, concessões e auditoria. Engenharia mantém cadastros, rascunhos e publicações. Os identificadores UUID de material e unidade fazem parte do contrato com Estoque. Uma ficha publicada identifica um produto e uma versão numérica. Cada linha de peça representa quantidade por kit e contém as etapas em ordem. Cada linha de material representa consumo por produto na unidade de referência. Os registros publicados guardam cópias das descrições e unidades.

**Homologação.** Os exemplos de Corte e Pintura e o roteiro do kit são sintéticos. As quantidades industriais, dimensões, matriz de concessões e papéis para publicação permanecem sujeitos à validação de D0 pela fábrica.
