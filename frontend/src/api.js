import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
      return Promise.reject(error);
    }
    
    if (error.response) {
      console.error('API Error:', error.response.data);
      return Promise.reject(error.response.data);
    } else if (error.request) {
      console.error('Network Error:', error.request);
      return Promise.reject({ error: 'Network error', code: 'NETWORK_ERROR' });
    } else {
      console.error('Request Error:', error.message);
      return Promise.reject({ error: error.message, code: 'REQUEST_ERROR' });
    }
  }
);
export const getItems = async ({ filterId, offset = 0, limit = 50, excludeSelectedIds = [], signal }) => {
  const params = { 
    offset, 
    limit,
    _t: Date.now()
  };
  if (filterId !== undefined && filterId !== null) {
    params.filterId = filterId;
  }
  
  if (Array.isArray(excludeSelectedIds) && excludeSelectedIds.length > 0) {
    params.excludeSelectedIds = JSON.stringify(excludeSelectedIds);
  }
  
  const response = await api.get('/items', { 
    params, 
    signal,
    headers: {
      'Cache-Control': 'no-cache',
    }
  });
      
  if (!response.data || !response.data.items || !Array.isArray(response.data.items)) {
    console.error('[api.getItems] Invalid response data');
    return { total: response.data?.total || 0, items: [] };
  }
      
  return response.data;
};

export const getItemsByIds = async (ids) => {
  const response = await api.post('/items/batch', { ids });
  return response.data;
};

export const addToQueue = async (ids) => {
  const response = await api.post('/queue/add', { ids });
  return response.data;
};

export const getSelection = async ({ signal } = {}) => {
  const response = await api.get('/selection', { signal });
  return response.data;
};

export const updateSelection = async (selectedIds, order) => {
  const response = await api.post('/selection/update', {
    selectedIds,
    order,
  });
  return response.data;
};

export const healthCheck = async () => {
  const response = await api.get('/health');
  return response.data;
};

export default api;

