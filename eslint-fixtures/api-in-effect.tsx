// A request inside useEffect, three ways. Each must be flagged
// (`.eslintrc.js` "api-in-effect", docs/DATA_LAYER.md).
import { useEffect, useLayoutEffect, useState } from "react";

declare const contactsApi: { show: (id: number) => Promise<{ name: string }> };
declare const http: { get: (url: string) => Promise<{ data: unknown }> };

export function Fetches({ id }: { id: number }) {
  const [name, setName] = useState("");
  useEffect(() => {
    void contactsApi.show(id).then((c) => setName(c.name));
  }, [id]);
  useLayoutEffect(() => {
    void (async () => {
      await http.get("/api/v1/me");
    })();
  }, []);
  useEffect(() => {
    void fetch("https://example.test/x");
  }, []);
  return name;
}
