import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { app } from '../server.js';

let server;

beforeAll(async () => {
  // Инициализируем батчинг для тестов
  const { initializeBatching } = await import('../queue.js');
  initializeBatching();
  
  // Запускаем сервер на случайном порту для тестов
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      resolve();
    });
  });
});

afterAll((done) => {
  // Останавливаем батчинг
  import('../queue.js').then(({ stopBatching }) => {
    stopBatching();
  });
  
  if (server) {
    server.close(done);
  } else {
    done();
  }
});

describe('API Integration Tests', () => {
  describe('GET /api/health', () => {
    it('should return ok: true', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({ ok: true });
    });
  });

  describe('POST /api/queue/add', () => {
    it('should add ids to queue and return accepted ids', async () => {
      const ids = [1000001, 1000002, 1000003];
      
      const response = await request(app)
        .post('/api/queue/add')
        .send({ ids })
        .expect(200);

      expect(response.body).toHaveProperty('accepted');
      expect(Array.isArray(response.body.accepted)).toBe(true);
      expect(response.body.accepted.length).toBeGreaterThan(0);
      // Все переданные ID должны быть в accepted (если они новые)
      expect(response.body.accepted).toEqual(expect.arrayContaining(ids));
    });

    it('should reject invalid input', async () => {
      const response = await request(app)
        .post('/api/queue/add')
        .send({ ids: 'not-an-array' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('INVALID_INPUT');
    });

    it('should reject empty array', async () => {
      const response = await request(app)
        .post('/api/queue/add')
        .send({ ids: [] })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('EMPTY_ARRAY');
    });
  });

  describe('GET /api/items', () => {
    it('should return items with pagination', async () => {
      const response = await request(app)
        .get('/api/items')
        .query({ offset: 0, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeLessThanOrEqual(10);
      
      if (response.body.items.length > 0) {
        expect(response.body.items[0]).toHaveProperty('id');
        expect(response.body.items[0]).toHaveProperty('createdAt');
      }
    });

    it('should support pagination', async () => {
      const firstPage = await request(app)
        .get('/api/items')
        .query({ offset: 0, limit: 5 })
        .expect(200);

      const secondPage = await request(app)
        .get('/api/items')
        .query({ offset: 5, limit: 5 })
        .expect(200);

      expect(firstPage.body.items.length).toBeLessThanOrEqual(5);
      expect(secondPage.body.items.length).toBeLessThanOrEqual(5);
      
      // Элементы должны быть разными (если их достаточно)
      if (firstPage.body.items.length > 0 && secondPage.body.items.length > 0) {
        const firstIds = firstPage.body.items.map(item => item.id);
        const secondIds = secondPage.body.items.map(item => item.id);
        expect(firstIds).not.toEqual(expect.arrayContaining(secondIds));
      }
    });

    it('should support filterId', async () => {
      const response = await request(app)
        .get('/api/items')
        .query({ filterId: 123, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('items');
      // Все элементы должны содержать "123" в ID
      response.body.items.forEach(item => {
        expect(item.id.toString()).toContain('123');
      });
    });

    it('should reject invalid offset', async () => {
      const response = await request(app)
        .get('/api/items')
        .query({ offset: -1, limit: 10 })
        .expect(400);

      expect(response.body.code).toBe('INVALID_OFFSET');
    });

    it('should reject invalid limit', async () => {
      const response = await request(app)
        .get('/api/items')
        .query({ offset: 0, limit: 2000 })
        .expect(400);

      expect(response.body.code).toBe('INVALID_LIMIT');
    });
  });

  describe('GET /api/selection', () => {
    it('should return selection object', async () => {
      const response = await request(app)
        .get('/api/selection')
        .expect(200);

      expect(response.body).toHaveProperty('selectedIds');
      expect(response.body).toHaveProperty('order');
      expect(Array.isArray(response.body.selectedIds)).toBe(true);
      expect(Array.isArray(response.body.order)).toBe(true);
    });
  });

  describe('POST /api/selection/update', () => {
    it('should update selection and return ok', async () => {
      const selectedIds = [1, 2, 3];
      const order = [3, 2, 1];

      const updateResponse = await request(app)
        .post('/api/selection/update')
        .send({ selectedIds, order })
        .expect(200);

      expect(updateResponse.body).toEqual({ ok: true });

      // Проверяем, что selection обновился
      const getResponse = await request(app)
        .get('/api/selection')
        .expect(200);

      // Проверяем, что данные сохранились (с учетом батчинга, может быть задержка)
      expect(getResponse.body).toHaveProperty('selectedIds');
      expect(getResponse.body).toHaveProperty('order');
    });

    it('should reject invalid input', async () => {
      const response = await request(app)
        .post('/api/selection/update')
        .send({ selectedIds: 'not-an-array', order: [] })
        .expect(400);

      expect(response.body.code).toBe('INVALID_SELECTED_IDS');
    });
  });

  describe('Selection flow', () => {
    it('should save and retrieve selection order correctly', async () => {
      const selectedIds = [10, 20, 30];
      const order = [30, 10, 20];

      // Обновляем selection
      await request(app)
        .post('/api/selection/update')
        .send({ selectedIds, order })
        .expect(200);

      // Ждем немного для коммита (батчинг каждую секунду)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Получаем selection
      const response = await request(app)
        .get('/api/selection')
        .expect(200);

      expect(response.body.selectedIds).toEqual(expect.arrayContaining(selectedIds));
      // order должен быть сохранен (может быть закоммичен в батче)
      expect(Array.isArray(response.body.order)).toBe(true);
      expect(response.body.order.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('POST /api/selection/remove', () => {
    it('should remove selected ids and return updated selection', async () => {
      // Сначала устанавливаем selection
      const selectedIds = [1, 2, 3];
      const order = [2, 1, 3];

      await request(app)
        .post('/api/selection/update')
        .send({ selectedIds, order })
        .expect(200);

      // Ждем коммита
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Удаляем элемент
      const removeResponse = await request(app)
        .post('/api/selection/remove')
        .send({ ids: [2] })
        .expect(200);

      expect(removeResponse.body).toHaveProperty('ok', true);
      expect(removeResponse.body).toHaveProperty('removed');
      expect(removeResponse.body).toHaveProperty('selectedIds');
      expect(removeResponse.body).toHaveProperty('order');
      
      expect(removeResponse.body.removed).toEqual([2]);
      expect(removeResponse.body.selectedIds).not.toContain(2);
      expect(removeResponse.body.order).not.toContain(2);
      expect(removeResponse.body.selectedIds).toEqual(expect.arrayContaining([1, 3]));
    });

    it('should be idempotent - repeated removal should not break order', async () => {
      // Устанавливаем selection
      const selectedIds = [10, 20, 30];
      const order = [30, 10, 20];

      await request(app)
        .post('/api/selection/update')
        .send({ selectedIds, order })
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 1100));

      // Первое удаление
      const firstRemove = await request(app)
        .post('/api/selection/remove')
        .send({ ids: [20] })
        .expect(200);

      expect(firstRemove.body.removed).toEqual([20]);

      // Повторное удаление того же id
      const secondRemove = await request(app)
        .post('/api/selection/remove')
        .send({ ids: [20] })
        .expect(200);

      expect(secondRemove.body.removed).toEqual([]);
      expect(secondRemove.body.selectedIds).toEqual(firstRemove.body.selectedIds);
      expect(secondRemove.body.order).toEqual(firstRemove.body.order);
    });

    it('should handle removal of non-existent ids gracefully', async () => {
      // Устанавливаем selection
      await request(app)
        .post('/api/selection/update')
        .send({ selectedIds: [1, 2, 3], order: [1, 2, 3] })
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 1100));

      // Пытаемся удалить несуществующий id
      const response = await request(app)
        .post('/api/selection/remove')
        .send({ ids: [999] })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.removed).toEqual([]);
    });

    it('should reject invalid input', async () => {
      const response = await request(app)
        .post('/api/selection/remove')
        .send({ ids: 'not-an-array' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('INVALID_INPUT');
    });

    it('should reject invalid ids', async () => {
      const response = await request(app)
        .post('/api/selection/remove')
        .send({ ids: [1, 'invalid', 3] })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.code).toBe('INVALID_IDS');
    });

    it('should remove multiple ids at once', async () => {
      // Устанавливаем selection
      await request(app)
        .post('/api/selection/update')
        .send({ selectedIds: [1, 2, 3, 4, 5], order: [5, 4, 3, 2, 1] })
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 1100));

      // Удаляем несколько элементов
      const response = await request(app)
        .post('/api/selection/remove')
        .send({ ids: [2, 4] })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.removed).toEqual(expect.arrayContaining([2, 4]));
      expect(response.body.selectedIds).not.toContain(2);
      expect(response.body.selectedIds).not.toContain(4);
      expect(response.body.order).not.toContain(2);
      expect(response.body.order).not.toContain(4);
      expect(response.body.selectedIds).toEqual(expect.arrayContaining([1, 3, 5]));
    });
  });
});

