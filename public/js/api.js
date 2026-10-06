const API_BASE = '/api';

async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    credentials: 'include',
    ...options
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body);
  } else if (options.body) {
    config.body = options.body;
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

module.exports = {
  get: (endpoint) => api(endpoint),
  post: (endpoint, body) => api(endpoint, { method: 'POST', body }),
  put: (endpoint, body) => api(endpoint, { method: 'PUT', body }),
  delete: (endpoint) => api(endpoint, { method: 'DELETE' }),
};