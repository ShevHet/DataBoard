import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { listItems, getSelection, getItemsByIds } from './memoryStore.js';
import { initializeBatching, enqueueAdd, updateSelection, stopBatching } from './queue.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/items', (req, res) => {
  try {
    let filterId = undefined;
    if (req.query.filterId !== undefined && req.query.filterId !== null && req.query.filterId !== '') {
      const parsed = Number(req.query.filterId);
      if (!isNaN(parsed) && parsed !== 0) {
        filterId = parsed;
      }
    }
    const offset = req.query.offset !== undefined 
      ? Number(req.query.offset) 
      : 0;
    const limit = req.query.limit !== undefined 
      ? Number(req.query.limit) 
      : 50;
    
    let excludeSelectedIds = [];
    if (req.query.excludeSelectedIds) {
      if (Array.isArray(req.query.excludeSelectedIds)) {
        excludeSelectedIds = req.query.excludeSelectedIds.map(id => Number(id));
      } else {
        try {
          excludeSelectedIds = JSON.parse(req.query.excludeSelectedIds);
          if (!Array.isArray(excludeSelectedIds)) {
            excludeSelectedIds = [Number(req.query.excludeSelectedIds)];
          } else {
            excludeSelectedIds = excludeSelectedIds.map(id => Number(id));
          }
        } catch {
          excludeSelectedIds = [Number(req.query.excludeSelectedIds)];
        }
      }
    }
    if (offset < 0 || isNaN(offset)) {
      return res.status(400).json({ 
        error: 'offset must be a non-negative number',
        code: 'INVALID_OFFSET'
      });
    }

    if (limit < 1 || limit > 1000 || isNaN(limit)) {
      return res.status(400).json({ 
        error: 'limit must be a number between 1 and 1000',
        code: 'INVALID_LIMIT'
      });
    }

    const result = listItems({ filterId, offset, limit, excludeSelectedIds });
    res.json(result);
  } catch (error) {
    console.error('Error in GET /api/items:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

app.post('/api/items/batch', (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ 
        error: 'ids must be an array',
        code: 'INVALID_INPUT'
      });
    }

    const invalidIds = ids.filter(id => typeof id !== 'number' || isNaN(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ 
        error: 'All ids must be valid numbers',
        code: 'INVALID_IDS',
        invalidIds
      });
    }

    const items = getItemsByIds(ids);
    res.json({ items });
  } catch (error) {
    console.error('Error in POST /api/items/batch:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

app.post('/api/queue/add', (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids)) {
      return res.status(400).json({ 
        error: 'ids must be an array',
        code: 'INVALID_INPUT'
      });
    }

    if (ids.length === 0) {
      return res.status(400).json({ 
        error: 'ids array cannot be empty',
        code: 'EMPTY_ARRAY'
      });
    }

    const invalidIds = ids.filter(id => typeof id !== 'number' || isNaN(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ 
        error: 'All ids must be valid numbers',
        code: 'INVALID_IDS',
        invalidIds
      });
    }

    const accepted = enqueueAdd(ids);
    res.json({ accepted });
  } catch (error) {
    console.error('[POST /api/queue/add] Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

app.get('/api/selection', (req, res) => {
  try {
    const result = getSelection();
    res.json(result);
  } catch (error) {
    console.error('Error in GET /api/selection:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/selection/update', (req, res) => {
  try {
    const { selectedIds, order } = req.body;
    if (!Array.isArray(selectedIds)) {
      return res.status(400).json({ 
        error: 'selectedIds must be an array',
        code: 'INVALID_SELECTED_IDS'
      });
    }

    if (!Array.isArray(order)) {
      return res.status(400).json({ 
        error: 'order must be an array',
        code: 'INVALID_ORDER'
      });
    }

    const invalidSelectedIds = selectedIds.filter(
      id => typeof id !== 'number' || isNaN(id)
    );
    if (invalidSelectedIds.length > 0) {
      return res.status(400).json({ 
        error: 'All selectedIds must be valid numbers',
        code: 'INVALID_SELECTED_IDS',
        invalidIds: invalidSelectedIds
      });
    }

    const invalidOrderIds = order.filter(
      id => typeof id !== 'number' || isNaN(id)
    );
    if (invalidOrderIds.length > 0) {
      return res.status(400).json({ 
        error: 'All order ids must be valid numbers',
        code: 'INVALID_ORDER_IDS',
        invalidIds: invalidOrderIds
      });
    }

    updateSelection(selectedIds, order);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error in POST /api/selection/update:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = path.join(__dirname, 'frontend/dist');
  app.use(express.static(frontendDistPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({ message: 'Backend server is running' });
  });
}

export { app };

if (process.env.NODE_ENV !== 'test') {
  initializeBatching();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  stopBatching();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  stopBatching();
  process.exit(0);
});

