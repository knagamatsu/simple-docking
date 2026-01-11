const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...options
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `Request failed: ${response.status}`);
    }
    return response;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Check API connectivity.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createLigand(payload) {
  const response = await request("/ligands", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.json();
}

export async function fetchLigand(ligandId) {
  const response = await request(`/ligands/${ligandId}`);
  return response.json();
}

export async function fetchProteins({ category, q } = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (q) params.set("q", q);
  const response = await request(`/proteins?${params.toString()}`);
  return response.json();
}

export async function importProteinFromPdb(payload) {
  const response = await request("/proteins/import", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.json();
}

export async function pasteProtein(payload) {
  const response = await request("/proteins/paste", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.json();
}

export async function createRun(payload) {
  const response = await request("/runs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.json();
}

export async function createBatch(payload) {
  const response = await request("/batches", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return response.json();
}

export async function fetchRunStatus(runId) {
  const response = await request(`/runs/${runId}/status`);
  return response.json();
}

export async function fetchRunResults(runId) {
  const response = await request(`/runs/${runId}/results`);
  return response.json();
}

export async function listRuns(status) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const response = await request(`/runs?${params.toString()}`);
  return response.json();
}

export async function listBatches(status) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const response = await request(`/batches?${params.toString()}`);
  return response.json();
}

export async function fetchBatchStatus(batchId) {
  const response = await request(`/batches/${batchId}/status`);
  return response.json();
}

export async function fetchBatchResults(batchId) {
  const response = await request(`/batches/${batchId}/results`);
  return response.json();
}

export async function fetchFile(path) {
  const response = await request(`/files/${path}`, { headers: {} });
  return response.text();
}

export async function fetchProteinFile(path) {
  const response = await request(`/protein-files/${path}`, { headers: {} });
  return response.text();
}

export { API_BASE };
