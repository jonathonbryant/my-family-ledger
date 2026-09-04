const STORAGE_ENDPOINT = "/.netlify/functions/storage";

async function describeError(res) {
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch (e) {}
  return `${res.status} ${res.statusText}${bodyText ? " — " + bodyText.slice(0, 200) : ""}`;
}

window.storage = {
  async get(key) {
    let res;
    try {
      res = await fetch(`${STORAGE_ENDPOINT}?key=${encodeURIComponent(key)}`);
    } catch (e) {
      throw new Error(`Storage get network error: ${e.message}`);
    }
    if (!res.ok) throw new Error(`Storage get failed: ${await describeError(res)}`);
    const data = await res.json();
    if (data.value === null || data.value === undefined) return null;
    return { key, value: data.value, shared: true };
  },
  async set(key, value) {
    let res;
    try {
      res = await fetch(`${STORAGE_ENDPOINT}?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value }),
      });
    } catch (e) {
      throw new Error(`Storage set network error: ${e.message}`);
    }
    if (!res.ok) throw new Error(`Storage set failed: ${await describeError(res)}`);
    return { key, value, shared: true };
  },
  async delete(key) {
    let res;
    try {
      res = await fetch(`${STORAGE_ENDPOINT}?key=${encodeURIComponent(key)}`, { method: "DELETE" });
    } catch (e) {
      throw new Error(`Storage delete network error: ${e.message}`);
    }
    if (!res.ok) throw new Error(`Storage delete failed: ${await describeError(res)}`);
    return { key, deleted: true, shared: true };
  },
  async list(prefix) {
    return { keys: [], shared: true };
  },
};
