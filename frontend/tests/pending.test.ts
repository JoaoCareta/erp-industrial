import {afterEach, expect, test} from "vitest";
import {encodePending,readPending,savePending} from "../src/production/pending";
const key='erp.stage-report.["user","unit"]';
afterEach(()=>sessionStorage.clear());
test("retoma o registro legado e descarta dados inválidos",()=>{
  sessionStorage.setItem(key,JSON.stringify({id:"legacy",quantity:2}));
  expect(readPending(key)).toEqual({id:"legacy",quantity:2});
  sessionStorage.setItem(key,'{"id":"bad/url","quantity":1}');
  expect(readPending(key)).toBeNull();
  expect(()=>encodePending({id:"id",quantity:-1})).toThrow();
  expect(()=>encodePending({orderId:"os",requestId:"r",data:{pieceIndex:0,stepIndex:0,quantity:1,
    consumption:{materialId:"m",quantity:"abc"}}})).toThrow();
});
test("aceita somente chaves da produção e conteúdo codificado",()=>{
  const encoded=encodePending({id:"r",quantity:3});
  expect(()=>savePending("outro",encoded)).toThrow();
  expect(()=>savePending(key,"<html>")).toThrow();
  savePending(key,encoded);
  expect(readPending(key)).toEqual({id:"r",quantity:3});
});
