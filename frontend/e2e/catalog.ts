import { expect, type APIRequestContext } from "@playwright/test";

export async function addCatalogItem(
  request: APIRequestContext,
  authorization: string,
  kind: string,
  data: Record<string, string>,
): Promise<string> {
  const response = await request.post("/api/units/eduk/catalog/" + kind, {
    headers: { authorization }, data,
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).id;
}

export async function countingUnit(request: APIRequestContext, authorization: string, code: string, name: string) {
  const response = await request.get("/api/units/eduk/catalog/unit", { headers: { authorization } });
  expect(response.ok()).toBe(true);
  type Unit = { id: string; value: { code: string; active: boolean } };
  const unit = (await response.json() as Unit[]).find(item => item.value.code === code);
  if (unit) {
    expect(unit.value.active).toBe(true);
    return unit.id;
  }
  return addCatalogItem(request, authorization, "unit", { code, name, dimension: "contagem" });
}
