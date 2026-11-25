package erp

import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.readValue
import erp.engineering.*
import erp.engineering.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.*
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class EngineeringTest @Autowired constructor(val mvc: MockMvc, val json: ObjectMapper, val catalog: Catalog, val sheets: Sheets) {
    val actor = jwt().jwt { it.subject("00000000-0000-4000-8000-000000000002").issuer(System.getenv("OIDC_ISSUER")) }
    fun post(path: String, body: Any): String = mvc.post("/api/$path") {
        with(actor); contentType = MediaType.APPLICATION_JSON; content = json.writeValueAsString(body)
    }.andExpect { status { isOk() } }.andReturn().response.contentAsString
    fun put(path: String, body: Any) = mvc.put("/api/$path") {
        with(actor); contentType = MediaType.APPLICATION_JSON; content = json.writeValueAsString(body)
    }.andExpect { status { isOk() } }
    fun item(kind: Kind, value: ItemInput = ItemInput(kind.name,kind.name)): Item =
        json.readValue(post("catalog/$kind",value))
    @Test fun preservesPublishedVersions() {
        val category = item(Kind.category)
        val unit = item(Kind.unit,ItemInput("pl","Placa","contagem"))
        val material = item(Kind.material,ItemInput("md","Madeira",categoryId=category.id,unitId=unit.id))
        val product = item(Kind.product)
        val part = item(Kind.part)
        val path = "products/${product.id}"
        val first = Sheet(listOf(PieceLine(part.id,2,listOf("corte","pintura"))), listOf(MaterialLine(material.id,unit.id,"0.50".toBigDecimal())))
        val second = Sheet(listOf(PieceLine(part.id,4,listOf("corte","lixa","pintura"),3.toBigDecimal(),20,40,5.toBigDecimal())),
            listOf(MaterialLine(material.id,unit.id,"0.75".toBigDecimal())))
        val d1: Draft = json.readValue(post("$path/drafts",first))
        assertEquals("1",post("$path/drafts/${d1.id}/publication",Revision(1)))
        assertEquals("1",post("$path/drafts/${d1.id}/publication",Revision(1)))
        assertThrows<ResponseStatusException> { sheets.edit(product.id,d1.id,Edit(1,second)) }
        val d2: Draft = json.readValue(post("$path/drafts",first))
        assertThrows<ResponseStatusException> { sheets.edit(product.id,d2.id,Edit(9,second)) }
        put("$path/drafts/${d2.id}",Edit(1,second))
        assertThrows<ResponseStatusException> { sheets.publish(product.id,d2.id,1,"admin") }
        assertEquals("2",post("$path/drafts/${d2.id}/publication",Revision(2)))
        put("catalog/part/${part.id}",part.value.copy(name="renomeada"))
        put("catalog/material/${material.id}",material.value.copy(active=false))
        mvc.get("/api/catalog/part") { with(actor) }.andExpect { jsonPath("$[0].value.name") { value("renomeada") } }
        mvc.get("/api/$path/versions") { with(actor) }.andExpect { content { json("[1,2]") } }
        for ((version, expected) in listOf(first,second).withIndex()) {
            val result=mvc.get("/api/$path/versions/${version+1}") { with(actor) }.andExpect {
                status { isOk() }; jsonPath("$.parts[0].value.name") { value("part") }
            }.andReturn().response.contentAsString
            val actual=json.treeToValue(json.readTree(result)["sheet"],Sheet::class.java)
            assertEquals(expected.pieces,actual.pieces)
            assertEquals(0,expected.materials.single().quantity.compareTo(actual.materials.single().quantity))
        }
    }
    @Test fun rejectsInvalidCatalogsAndDrafts() {
        val product=item(Kind.product)
        val part=item(Kind.part)
        val id=UUID.randomUUID()
        val line=PieceLine(part.id,1,listOf("corte"))
        val sheet=Sheet(listOf(line),emptyList())
        for (bad in listOf(sheet.copy(pieces=emptyList()),sheet.copy(pieces=listOf(line,line)),
            sheet.copy(pieces=listOf(line.copy(quantity=0))),sheet.copy(pieces=listOf(line.copy(steps=emptyList()))),
            sheet.copy(pieces=listOf(line.copy(steps=listOf("")))),sheet.copy(pieces=listOf(line.copy(minutesPerCut=(-1).toBigDecimal())))))
            assertThrows<IllegalArgumentException> { sheets.create(product.id,bad) }
        for (bad in listOf(ItemInput("","n"),ItemInput("c",""),ItemInput("c","n",unitId=id),ItemInput("c","n",categoryId=id)))
            assertThrows<IllegalArgumentException> { catalog.save(Kind.part,bad,null) }
        assertThrows<IllegalArgumentException> { catalog.save(Kind.unit, ItemInput("u","u"),null) }
        assertThrows<IllegalArgumentException> { catalog.save(Kind.material, ItemInput("m","m"),null) }
        val cat=item(Kind.category)
        assertThrows<IllegalArgumentException> { catalog.save(Kind.material,ItemInput("m","m",categoryId=cat.id),null) }
        val unit=item(Kind.unit,ItemInput("kg","Quilo","massa"))
        val m=item(Kind.material,ItemInput("m","m",unitId=unit.id,categoryId=cat.id))
        for (bad in listOf(MaterialLine(m.id,id,1.toBigDecimal()),MaterialLine(m.id,unit.id,0.toBigDecimal())))
            assertThrows<IllegalArgumentException> { sheets.create(product.id,sheet.copy(materials=listOf(bad))) }
        catalog.save(Kind.part,part.value.copy(active=false),part.id)
        assertThrows<IllegalArgumentException> { sheets.create(product.id,sheet) }
        assertThrows<ResponseStatusException> { catalog.get(id,Kind.product) }
        assertThrows<ResponseStatusException> { sheets.version(product.id,1) }
        assertThrows<ResponseStatusException> { sheets.edit(product.id,id,Edit(1,sheet)) }
    }
    @Test fun httpErrorsAndReadiness() {
        mvc.get("/api/ready").andExpect { status { isOk() } }
        mvc.get("/api/sectors/corte/team").andExpect { status { isUnauthorized() } }
        mvc.post("/api/accounts/${UUID.randomUUID()}/suspension") { with(actor); contentType=MediaType.APPLICATION_JSON;content="""{"reason":" " }""" }.andExpect { status { isBadRequest() } }
        mvc.post("/api/accounts/${UUID.randomUUID()}/suspension") { with(actor); contentType=MediaType.APPLICATION_JSON;content="""{"reason":"teste"}""" }.andExpect { status { isNotFound() } }
        item(Kind.part)
        mvc.post("/api/catalog/part") { with(actor); contentType=MediaType.APPLICATION_JSON;content="""{"code":"part","name":"outra"}""" }.andExpect { status { isConflict() } }
    }
}
