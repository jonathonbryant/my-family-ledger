import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key) {
    return new Response(JSON.stringify({ error: "key is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const store = getStore("family-ledger");

    if (req.method === "GET") {
      const value = await store.get(key, { type: "text" });
      return new Response(JSON.stringify({ value: value ?? null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      await store.set(key, body.value);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (req.method === "DELETE") {
      await store.delete(key);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405 });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Storage function error", detail: String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};
