import { useEffect, useState } from "react";
import type { RequestApi } from "./Workspace";

/** A read belongs to the mounted view. Ignore late responses after navigation or a retry. */
export function useRead<T>(api: RequestApi, path: string | null) {
  const [result, store] = useState<{path:string|null; value:T|"error"|null} | null>(null);
  const value=result?.path===path && result ? result.value : null;
  const setValue=(next:T|"error"|null)=>store({path,value:next});
  const [generation, refresh] = useState(0);
  useEffect(() => {
    if (path === null) return;
    let active = true;
    api<T>(path).then(result => { if (active) setValue(result); }, () => { if (active) setValue("error"); });
    return () => { active = false; };
  }, [api, path, generation]);
  function reload() { setValue(null); refresh(n => n + 1); }
  return { value, setValue, reload };
}
