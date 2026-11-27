"""Reconcilia cenários de aceite com resultados JUnit produzidos nesta execução."""
from pathlib import Path
from xml.etree import ElementTree as ET
import json

suites = {
    "atualizacao-legada": ("reports/upgrade-legacy.xml", ["readsLegacyInstallation()", "preservesAuditAndContinuesSequence()"]),
    "atualizacao-por-unidade": ("reports/upgrade-scoped.xml", ["readsLegacyInstallation()", "preservesAuditAndContinuesSequence()"]),
    "integracao": ("build/test-results/test/TEST-*.xml", [
        "saleReducesOnlyFinishedStockAndReplayIsSafe()", "finishedInventoryAndCompetingSalesNeverOverdraw()",
        "repeatedRecountsUseTheEffectiveRevisionAndPreserveHistory()", "reconcilesShortageAndClosesUnusedReservation()",
        "purchasesRemainLinkedToPhysicalReceiptsAndReversals()", "returnsToSupplierLedgerLeaveFortyPiecesOutstanding()",
        "capacityUsesFreePartsAndIgnoresReplayedAssembly()", "costsApplyEachStageRateAndChannelPercentages()",
        "shiftDashboardTracesReceivedKitsToTheirOrder()", "plantGrantsCanBeChangedWithoutReplacingTheSession()",
        "scopedRoles()", "sectorAndSuspension()", "preservesPublishedVersions()", "rejectsInvalidCatalogsAndDrafts()",
        "concurrentRetryAndImmutableHistory()", "duplicateGrantsAreRejectedAtEveryScope()", "oidcIdentityUsesExactStringComparison()",
        "auditPreservesUtcMicrosecondsAfter2038()", "httpErrorsAndReadiness()", "moduleBoundaries()",
        "opensOneHundredPlatesOnce()", "reconcilesReceiptsAndLinkedReversals()", "checksPrecisionUnitAndHistoricalCatalog()",
        "isolatesPlantsAndLimitsStockGrants()", "serializesCompetingFirstMovements()",
        "protectsPhysicalStockAlreadyReservedForOrders()", "rejectsIncompatibleReservationsWithoutHoldingMaterial()",
        "serializesReservationAndReversalOfTheSameStock()", "releasesOneHundredKitsReservingThirtyOfOneHundredPlates()",
        "preservesSheetAndReplaysCreationAndRelease()", "insufficientSecondMaterialRollsBackReleaseAndAllReservations()",
        "concurrentOrdersAndRetriesPreserveAvailableStock()", "limitsOrdersToFactoryAndRequiresSeparateGrants()",
        "rejectsUnpublishedSheetsAndNonIntegralKitCounts()", "cuttingTheVillageConsumesTwelveWhitePlatesOnce()", "checkingThirtyVillageKitsReceivesThemOnceAndKeepsOrderOpen()",
        "reportsOnlyAvailablePiecesInTheirPublishedRoute()", "rejectsInvalidConsumptionAndScopesStageReporting()",
        "competingStageReportsCannotOverdrawOrDuplicate()",
        "consumesOnlyTheReservationOfTheReportingOrder()", "competingConsumptionCannotOverdrawTheOrderReservation()"]),
    "contrato": ("build/test-results/test/TEST-*.xml", ["openApiMatchesHandlers()", "stockReadsRequestedVersion()"]),
    "interface": ("reports/ui.xml", ["arredonda cada peça para cortes inteiros antes de somar os minutos",
        "registra uma venda e consulta o total no histórico", "planejamento mostra o gargalo, movimenta peças, estorna e simula reposição",
        "custos exigem taxas por etapa e identificam material sem compra", "correção informa saldo projetado e envia revisão e justificativa",
        "prévia de materiais por linha", "abre e corrige o arquivo de prévia", "UI-A1 carregamento, equipe, lista vazia, erro e saída",
        "seleção de unidade, setores e revogação", "entrada indisponível e conta suspensa",
        "UI-E2 cadastros, rascunho e histórico consultável", "inicialização OIDC, renovação e saída", "login indisponível",
        "UI-EST abrir 100 placas atualiza os saldos e o extrato do material",
        "UI-OS conferir 30 kits e retomar a entrada após perder a resposta",
        "UI-OS criar e liberar a ordem de 100 kits confirma a reserva de 30 placas",
        "UI-KAN corte da Casinha Branca consome 12 placas e libera peças para limpeza",
        "consumo no corte mostra a baixa e protege o vínculo com a OS"]),
    "e2e": ("reports/*.xml", ["troca de operador no mesmo posto", "setor e suspensão com o mesmo token", "funcionário sem concessão","regional escolhe e retoma a unidade",
        "publica V1 e V2 e preserva a composição e o roteiro", "histórico após reiniciar a API",
        "inventário inicial preserva 100 placas após perder a resposta e reenviar",
        "liberar a Vila Natalina reserva 30 de 100 placas brancas e mantém 70 disponíveis",
        "conferir 30 kits da Vila dá entrada parcial e mantém a OS aberta",
        "o corte de 60 casinhas consome 12 placas uma única vez e libera a limpeza"]),
}
report = {}
for suite, (pattern, expected) in suites.items():
    passed = {case.attrib["name"] for path in Path(".").glob(pattern)
              for case in ET.parse(path).iter("testcase")
              if all(case.find(tag) is None for tag in ("failure", "error", "skipped"))}
    missing = sorted(set(expected) - passed)
    report[suite] = {"passed":len(expected)-len(missing),"total":len(expected),"missing":missing}
print(json.dumps(report, indent=2, ensure_ascii=False))
Path("reports/acceptance.json").write_text(json.dumps(report, indent=2))
if any(s["missing"] for s in report.values()):
    raise SystemExit("Cenário obrigatório sem teste aprovado")
